#!/usr/bin/env python3
"""
Tmux-friendly Kingshot Auto Redeem runner.

This daemon claims pending redeem jobs from the Worker, redeems them through the
official Kingshot gift-code page with Playwright, then reports the result back
to the Worker/Supabase queue.

Required environment variables:
  HUB_BASE_URL   Example: https://my-discord-bot2.looloo90.workers.dev
  ADMIN_TOKEN    Same value as the Cloudflare Worker ADMIN_TOKEN secret

Optional:
  AUTO_REDEEM_DAEMON_MODE        api/hybrid/browser, default api
  AUTO_REDEEM_DAEMON_API_FALLBACK_BROWSER true/false, default true
  AUTO_REDEEM_DAEMON_INTERVAL    Idle seconds when no jobs exist, default 10
  AUTO_REDEEM_DAEMON_REST_SECONDS Seconds to rest after a non-empty batch, default 0
  AUTO_REDEEM_DAEMON_BATCH_SIZE  Jobs per loop, default 40
  AUTO_REDEEM_DAEMON_CONCURRENCY Pages processed at once, default 4
  AUTO_REDEEM_DAEMON_TIMEOUT_MS  Browser action timeout, default 2500
  AUTO_REDEEM_DAEMON_BATCH_TIMEOUT_SECONDS Whole batch timeout; 0/off disables it
  AUTO_REDEEM_DAEMON_HEADLESS    true/false, default true
  AUTO_REDEEM_CAPTURE_OFFICIAL_REQUESTS true/false, default false
"""

import asyncio
import hashlib
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError
    from playwright.async_api import async_playwright
except Exception:  # pragma: no cover - shown to the server operator
    async_playwright = None
    PlaywrightTimeoutError = TimeoutError


BASE_URL = os.getenv("HUB_BASE_URL", "https://my-discord-bot2.looloo90.workers.dev").rstrip("/")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
DAEMON_MODE = os.getenv("AUTO_REDEEM_DAEMON_MODE", "api").strip().lower()
API_FALLBACK_BROWSER = os.getenv("AUTO_REDEEM_DAEMON_API_FALLBACK_BROWSER", "true").strip().lower() not in {"0", "false", "no", "off"}
REVIEW_ONLY = os.getenv("AUTO_REDEEM_DAEMON_REVIEW_ONLY", "false").strip().lower() not in {"0", "false", "no", "off"}
AUTO_REVIEW = os.getenv("AUTO_REDEEM_DAEMON_AUTO_REVIEW", "true").strip().lower() not in {"0", "false", "no", "off"}
INTERVAL = max(2, int(os.getenv("AUTO_REDEEM_DAEMON_INTERVAL", "10")))
REST_SECONDS = max(0.0, float(os.getenv("AUTO_REDEEM_DAEMON_REST_SECONDS", "0")))
BATCH_SIZE = max(1, min(80, int(os.getenv("AUTO_REDEEM_DAEMON_BATCH_SIZE", "40"))))
REVIEW_BATCH_SIZE = max(1, min(10, int(os.getenv("AUTO_REDEEM_DAEMON_REVIEW_BATCH_SIZE", "3"))))
CONCURRENCY = max(1, min(6, int(os.getenv("AUTO_REDEEM_DAEMON_CONCURRENCY", "4"))))
TIMEOUT_MS = max(800, int(os.getenv("AUTO_REDEEM_DAEMON_TIMEOUT_MS", "2500")))
DEFAULT_BATCH_TIMEOUT_SECONDS = max(90, min(300, int((BATCH_SIZE * 12) / max(1, CONCURRENCY))))
_BATCH_TIMEOUT_RAW = os.getenv("AUTO_REDEEM_DAEMON_BATCH_TIMEOUT_SECONDS", str(DEFAULT_BATCH_TIMEOUT_SECONDS)).strip().lower()
BATCH_TIMEOUT_SECONDS = 0 if _BATCH_TIMEOUT_RAW in {"0", "off", "false", "no", "none", "disabled"} else max(30, int(_BATCH_TIMEOUT_RAW))
HEADLESS = os.getenv("AUTO_REDEEM_DAEMON_HEADLESS", "true").strip().lower() not in {"0", "false", "no", "off"}
CAPTURE_OFFICIAL_REQUESTS = os.getenv("AUTO_REDEEM_CAPTURE_OFFICIAL_REQUESTS", "false").strip().lower() not in {"0", "false", "no", "off"}
OFFICIAL_REDEEM_URL = "https://ks-giftcode.centurygame.com/"
OFFICIAL_GIFT_CONFIG_API = "https://kingshot-giftcode.centurygame.com/api/gift_code_config"
OFFICIAL_GIFT_PLAYER_API = "https://kingshot-giftcode.centurygame.com/api/player"
OFFICIAL_GIFT_REDEEM_API = "https://kingshot-giftcode.centurygame.com/api/gift_code"
OFFICIAL_GIFT_SIGN_SALT = "mN4!pQs6JrYwV9"
OFFICIAL_GIFT_ORIGIN = "https://ks-giftcode.centurygame.com"
USER_AGENT = os.getenv(
    "AUTO_REDEEM_DAEMON_USER_AGENT",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 NashshAutoRedeem/2.0",
)
API_FALLBACK_STATUSES = {
    "failed",
    "timeout",
    "network_error",
    "server_error",
    "rate_limited",
    "server_busy",
    "captcha_required",
    "not_logged_in",
}


def daemon_source() -> str:
    if REVIEW_ONLY:
        return "putty-browser-review-daemon"
    if DAEMON_MODE == "api":
        return "putty-api-daemon"
    if DAEMON_MODE == "hybrid":
        return "putty-hybrid-daemon"
    return "putty-browser-daemon"


def request_json(path: str, payload: dict | None = None) -> dict:
    runner = daemon_source()
    body = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        method="POST",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "user-agent": USER_AGENT,
            "x-admin-token": ADMIN_TOKEN,
            "x-auto-redeem-runner": runner,
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode("utf-8", "replace")
    return json.loads(raw or "{}")


def official_gift_sign(data: dict) -> str:
    payload = "&".join(f"{key}={data[key]}" for key in sorted(data.keys()))
    return hashlib.md5(f"{payload}{OFFICIAL_GIFT_SIGN_SALT}".encode("utf-8")).hexdigest()


def official_post_json(url: str, data: dict, opener=None) -> dict:
    time_ms = int(time.time() * 1000)
    signed_data = {**data, "time": time_ms}
    body_data = {"sign": official_gift_sign(signed_data), **data, "time": time_ms}
    body = urllib.parse.urlencode(body_data).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "accept": "application/json, text/plain, */*",
            "content-type": "application/x-www-form-urlencoded",
            "origin": OFFICIAL_GIFT_ORIGIN,
            "referer": f"{OFFICIAL_GIFT_ORIGIN}/",
            "user-agent": USER_AGENT,
        },
    )
    open_request = opener.open if opener else urllib.request.urlopen
    with open_request(request, timeout=max(8, TIMEOUT_MS / 1000 * 3)) as response:
        raw = response.read().decode("utf-8", "replace")
    return json.loads(raw or "{}")


async def official_post_json_browser(request_context, url: str, data: dict) -> dict:
    time_ms = int(time.time() * 1000)
    signed_data = {**data, "time": time_ms}
    body_data = {"sign": official_gift_sign(signed_data), **data, "time": time_ms}
    response = await request_context.post(
        url,
        form=body_data,
        headers={
            "accept": "application/json, text/plain, */*",
            "origin": OFFICIAL_GIFT_ORIGIN,
            "referer": f"{OFFICIAL_GIFT_ORIGIN}/",
            "user-agent": USER_AGENT,
        },
        timeout=max(8000, TIMEOUT_MS * 3),
    )
    text = await response.text()
    try:
        payload = json.loads(text or "{}")
    except Exception:
        payload = {"msg": text[:500] or f"HTTP {response.status}"}
    if response.status >= 400:
        payload.setdefault("http_status", response.status)
    return payload


def official_player_payload_ok(payload: dict) -> bool:
    data = payload.get("data") if isinstance(payload, dict) else None
    return isinstance(payload, dict) and payload.get("code") == 0 and isinstance(data, dict) and bool(data.get("fid"))


def classify_official_payload(payload: dict) -> tuple[str, bool, str]:
    err_code = int(payload.get("err_code") or 0) if str(payload.get("err_code") or "").lstrip("-").isdigit() else 0
    message = str(payload.get("msg") or payload.get("message") or payload.get("err_msg") or "").strip()
    lower = message.lower()
    if "claim limit reached" in lower or "unable to claim" in lower:
        return "claim_limit_reached", False, message or "claim limit reached"
    if err_code == 40102 or "captcha" in lower or "verification" in lower or "verify" in lower:
        return "captcha_required", False, message or "captcha required"
    if err_code == 40014 or "gift code not found" in lower or "case-sensitive" in lower or "invalid code" in lower:
        return "invalid_code", False, message or "invalid code"
    if err_code == 40009 or "not logged in" in lower:
        return "not_logged_in", False, message or "not logged in"
    if "time error" in lower or "redemption time" in lower or "exchange time" in lower or "time limit" in lower:
        return "time_window_closed", False, message or "time window closed"
    if "same type exchange" in lower or "same gift code" in lower or "only be redeemed once" in lower or "already" in lower or "claimed" in lower or "used" in lower:
        return "already_claimed", False, message or "already claimed"
    if "expired" in lower or "ended" in lower or "no longer valid" in lower:
        return "expired", False, message or "expired"
    if "too frequent" in lower or "too many" in lower or "rate limit" in lower:
        return "rate_limited", False, message or "rate limited"
    if "does not satisfy" in lower or "redemption requirements" in lower or "customer service" in lower or "stove_lv" in lower:
        return "official_blocked", False, message or "official redeem blocked"
    if "recharge_money" in lower or "recharge money" in lower:
        return "server_busy", False, message or "official session was not ready"
    if "server busy" in lower or "try again later" in lower:
        return "server_busy", False, message or "server busy"
    if "double check player" in lower:
        return "not_logged_in", False, message or "player check required"
    if "player not found" in lower or "invalid player" in lower:
        return "player_not_found", False, message or "player not found"
    if payload.get("code") == 0 or err_code == 0 or "redeemed, please claim" in lower or "claim the rewards in your mail" in lower:
        return "success", True, message or "success"
    return "failed", False, message or "redeem failed"


def classify_message(message: str) -> tuple[str, bool]:
    text = (message or "").strip()
    lower = text.lower()
    if "claim limit reached" in lower or "unable to claim" in lower:
        return "claim_limit_reached", False
    if "same type exchange" in lower or "same gift code" in lower or "only be redeemed once" in lower or "already claimed" in lower:
        return "already_claimed", False
    if "gift code not found" in lower or "case-sensitive" in lower or "invalid code" in lower:
        return "invalid_code", False
    if "expired" in lower or "no longer valid" in lower:
        return "expired", False
    if "time error" in lower or "redemption time" in lower or "exchange time" in lower:
        return "time_window_closed", False
    if "not login" in lower or "not logged in" in lower or "problem with logging in" in lower:
        return "not_logged_in", False
    if "server busy" in lower or "try again later" in lower:
        return "server_busy", False
    if "too frequent" in lower or "too many" in lower or "rate limit" in lower:
        return "rate_limited", False
    if "does not satisfy" in lower or "redemption requirements" in lower or "customer service" in lower or "stove_lv" in lower:
        return "official_blocked", False
    if "redeemed, please claim" in lower or "claim the rewards in your mail" in lower:
        return "success", True
    if "captcha" in lower or "verification" in lower or "verify" in lower:
        return "captcha_required", False
    if "double check player" in lower:
        return "not_logged_in", False
    if "player not found" in lower or "invalid player" in lower:
        return "player_not_found", False
    return "failed", False


def redeem_one_api_sync(job: dict) -> dict:
    job_key = str(job.get("jobKey") or "")
    player_id = str(job.get("playerId") or "")
    gift_code = str(job.get("giftCode") or "")
    attempts = int(job.get("attempts") or 0)

    result = {
        "jobKey": job_key,
        "playerId": player_id,
        "giftCode": gift_code,
        "attempts": attempts,
        "ok": False,
        "status": "failed",
        "message": "",
        "response": {"source": "putty-api-daemon"},
    }

    if not player_id or not gift_code:
        result.update(status="failed", message="Missing player ID or gift code.")
        return result

    try:
        cookie_jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

        config_payload = official_post_json(OFFICIAL_GIFT_CONFIG_API, {}, opener=opener)
        player_payload = official_post_json(OFFICIAL_GIFT_PLAYER_API, {"fid": player_id}, opener=opener)
        if not official_player_payload_ok(player_payload):
            status, _ok, message = classify_official_payload(player_payload)
            result.update(
                status=status if status != "failed" else "not_logged_in",
                ok=False,
                message=message or "Player login did not complete.",
                response={"source": "putty-api-daemon", "config_payload": config_payload, "player_payload": player_payload},
            )
            return result

        payload = official_post_json(
            OFFICIAL_GIFT_REDEEM_API,
            {"fid": player_id, "cdk": gift_code, "captcha_code": ""},
            opener=opener,
        )
        status, ok, message = classify_official_payload(payload)
        result.update(
            status=status,
            ok=ok,
            message=message,
            response={
                "source": "putty-api-daemon",
                "config_payload": config_payload,
                "player_payload": player_payload,
                "payload": payload,
            },
        )
        return result
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        try:
            payload = json.loads(detail or "{}")
        except Exception:
            payload = {"msg": detail or f"HTTP {error.code}"}
        status, ok, message = classify_official_payload(payload)
        if status == "failed":
            if error.code == 429:
                status = "rate_limited"
            elif error.code in {408, 425} or error.code >= 500:
                status = "server_error"
        result.update(
            status=status,
            ok=ok,
            message=message or f"HTTP {error.code}",
            response={"source": "putty-api-daemon", "httpStatus": error.code, "payload": payload},
        )
        return result
    except TimeoutError as error:
        result.update(status="timeout", message=f"Timeout: {error}")
        return result
    except Exception as error:
        result.update(status="network_error", message=str(error))
        return result


async def redeem_jobs_api(jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []
    semaphore = asyncio.Semaphore(CONCURRENCY)
    ordered_results: list[dict | None] = [None] * len(jobs)

    async def run_one(index: int, job: dict) -> None:
        async with semaphore:
            ordered_results[index] = await asyncio.to_thread(redeem_one_api_sync, job)
            await asyncio.sleep(0.05)

    await asyncio.gather(*(run_one(index, job) for index, job in enumerate(jobs)))
    return [result for result in ordered_results if result is not None]


def result_job_key(result: dict) -> str:
    job_key = str(result.get("jobKey") or result.get("job_key") or "")
    if job_key:
        return job_key
    gift_code = str(result.get("giftCode") or result.get("gift_code") or "")
    player_id = str(result.get("playerId") or result.get("player_id") or "")
    return f"{gift_code}:{player_id}" if gift_code and player_id else ""


def should_browser_fallback(results: list[dict]) -> bool:
    if not results:
        return False
    for result in results:
        if result.get("ok"):
            return False
        status = str(result.get("status") or "").strip().lower()
        if status not in API_FALLBACK_STATUSES:
            return False
    return True


def mark_browser_fallback(result: dict, previous_result: dict | None = None, previous_source: str = "api") -> dict:
    response = result.get("response") if isinstance(result.get("response"), dict) else {}
    result["response"] = {
        **response,
        "fallback_from": previous_source,
        "fallback_from_api": previous_source == "api",
        "fallback_from_hybrid": previous_source == "hybrid",
        "previous_status": (previous_result or {}).get("status"),
        "previous_message": (previous_result or {}).get("message"),
    }
    return result


async def redeem_jobs_api_with_browser_fallback(jobs: list[dict]) -> list[dict]:
    api_results = await redeem_jobs_api(jobs)
    if not API_FALLBACK_BROWSER or not api_results or async_playwright is None:
        return api_results

    results_by_key = {result_job_key(result): result for result in api_results if result_job_key(result)}
    grouped_results: dict[str, list[dict]] = {}
    for result in api_results:
        code = str(result.get("giftCode") or result.get("gift_code") or "")
        grouped_results.setdefault(code, []).append(result)

    fallback_keys: set[str] = set()
    for group in grouped_results.values():
        if should_browser_fallback(group):
            for result in group:
                key = result_job_key(result)
                if key:
                    fallback_keys.add(key)

    if not fallback_keys:
        return api_results

    fallback_jobs = []
    for job in jobs:
        key = str(job.get("jobKey") or "")
        if key in fallback_keys:
            fallback_jobs.append(job)
    if not fallback_jobs:
        return api_results

    try:
        browser_results = await redeem_jobs(fallback_jobs)
    except Exception:
        return api_results
    for result in browser_results:
        key = result_job_key(result)
        if key:
            results_by_key[key] = mark_browser_fallback(result, results_by_key.get(key), "api")

    ordered_results = []
    for job in jobs:
        key = str(job.get("jobKey") or "")
        if key and key in results_by_key:
            ordered_results.append(results_by_key[key])
    return ordered_results or api_results


async def redeem_one_hybrid(context, job: dict) -> dict:
    job_key = str(job.get("jobKey") or "")
    player_id = str(job.get("playerId") or "")
    gift_code = str(job.get("giftCode") or "")
    attempts = int(job.get("attempts") or 0)

    result = {
        "jobKey": job_key,
        "playerId": player_id,
        "giftCode": gift_code,
        "attempts": attempts,
        "ok": False,
        "status": "failed",
        "message": "",
        "response": {"source": "putty-hybrid-daemon"},
    }

    if not player_id or not gift_code:
        result.update(status="failed", message="Missing player ID or gift code.")
        return result

    try:
        config_payload = await official_post_json_browser(context.request, OFFICIAL_GIFT_CONFIG_API, {})
        player_payload = await official_post_json_browser(context.request, OFFICIAL_GIFT_PLAYER_API, {"fid": player_id})
        if not official_player_payload_ok(player_payload):
            status, _ok, message = classify_official_payload(player_payload)
            result.update(
                status=status if status != "failed" else "not_logged_in",
                ok=False,
                message=message or "Player login did not complete.",
                response={
                    "source": "putty-hybrid-daemon",
                    "config_payload": config_payload,
                    "player_payload": player_payload,
                },
            )
            return result

        payload = await official_post_json_browser(
            context.request,
            OFFICIAL_GIFT_REDEEM_API,
            {"fid": player_id, "cdk": gift_code, "captcha_code": ""},
        )
        status, ok, message = classify_official_payload(payload)
        result.update(
            status=status,
            ok=ok,
            message=message,
            response={
                "source": "putty-hybrid-daemon",
                "config_payload": config_payload,
                "player_payload": player_payload,
                "payload": payload,
            },
        )
        return result
    except PlaywrightTimeoutError as error:
        result.update(status="timeout", message=f"Timeout: {error}")
        return result
    except Exception as error:
        result.update(status="network_error", message=str(error))
        return result


async def redeem_jobs_hybrid(jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []
    if async_playwright is None:
        return [
            {
                "jobKey": job.get("jobKey"),
                "playerId": job.get("playerId"),
                "giftCode": job.get("giftCode"),
                "attempts": job.get("attempts"),
                "ok": False,
                "status": "failed",
                "message": "Playwright is not installed. Run: pip install -r requirements.txt && python3 -m playwright install chromium",
            }
            for job in jobs
        ]

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=HEADLESS)
        context = await browser.new_context(user_agent=USER_AGENT, viewport={"width": 1280, "height": 900})
        seed_page = await context.new_page()
        try:
            await seed_page.goto(OFFICIAL_REDEEM_URL, wait_until="domcontentloaded", timeout=TIMEOUT_MS * 8)
            blocked = await detect_blocked_or_unready(seed_page)
            if blocked:
                return [
                    {
                        "jobKey": job.get("jobKey"),
                        "playerId": job.get("playerId"),
                        "giftCode": job.get("giftCode"),
                        "attempts": job.get("attempts"),
                        "ok": False,
                        "status": blocked,
                        "message": "Official page requires verification.",
                        "response": {"source": "putty-hybrid-daemon"},
                    }
                    for job in jobs
                ]
            await seed_page.wait_for_timeout(700)
        finally:
            await seed_page.close()

        semaphore = asyncio.Semaphore(CONCURRENCY)
        ordered_results: list[dict | None] = [None] * len(jobs)

        async def run_one(index: int, job: dict) -> None:
            async with semaphore:
                ordered_results[index] = await redeem_one_hybrid(context, job)
                await asyncio.sleep(0.05)

        await asyncio.gather(*(run_one(index, job) for index, job in enumerate(jobs)))
        results = [result for result in ordered_results if result is not None]
        await context.close()
        await browser.close()
        return results


async def redeem_jobs_hybrid_with_browser_fallback(jobs: list[dict]) -> list[dict]:
    hybrid_results = await redeem_jobs_hybrid(jobs)
    if not API_FALLBACK_BROWSER or not hybrid_results or async_playwright is None:
        return hybrid_results

    results_by_key = {result_job_key(result): result for result in hybrid_results if result_job_key(result)}
    fallback_keys: set[str] = set()
    for result in hybrid_results:
        if result.get("ok"):
            continue
        status = str(result.get("status") or "").strip().lower()
        if status in API_FALLBACK_STATUSES:
            key = result_job_key(result)
            if key:
                fallback_keys.add(key)

    fallback_jobs = [job for job in jobs if str(job.get("jobKey") or "") in fallback_keys]
    if not fallback_jobs:
        return hybrid_results

    try:
        browser_results = await redeem_jobs(fallback_jobs)
    except Exception:
        return hybrid_results

    for result in browser_results:
        key = result_job_key(result)
        if key:
            results_by_key[key] = mark_browser_fallback(result, results_by_key.get(key), "hybrid")

    ordered_results = []
    for job in jobs:
        key = str(job.get("jobKey") or "")
        if key and key in results_by_key:
            ordered_results.append(results_by_key[key])
    return ordered_results or hybrid_results


async def read_modal_message(page) -> str:
    try:
        await page.wait_for_selector("div.message_modal", timeout=TIMEOUT_MS * 3)
        return (await page.inner_text("div.modal_content .msg", timeout=TIMEOUT_MS)).strip()
    except Exception:
        return ""


async def close_modal(page) -> None:
    for selector in ("div.confirm_btn", "button:has-text('OK')", "button:has-text('Confirm')"):
        try:
            locator = page.locator(selector).first
            if await locator.is_visible(timeout=500):
                await locator.click(timeout=TIMEOUT_MS)
                return
        except Exception:
            pass


async def exit_player_panel(page) -> None:
    try:
        locator = page.locator("div.exit_con").first
        if await locator.is_visible(timeout=700):
            await locator.click(timeout=TIMEOUT_MS)
    except Exception:
        pass


async def detect_blocked_or_unready(page) -> str:
    try:
        content = (await page.content()).lower()
    except Exception:
        return ""
    if "captcha" in content or "challenge" in content or "verify you are human" in content:
        return "captcha_required"
    return ""


def official_trace_url(url: str) -> bool:
    return (
        "kingshot-giftcode.centurygame.com/api/player" in url
        or "kingshot-giftcode.centurygame.com/api/gift_code" in url
    )


def safe_capture_headers(headers: dict) -> dict:
    allowed = {
        "accept",
        "accept-language",
        "content-type",
        "origin",
        "referer",
        "user-agent",
        "sec-ch-ua",
        "sec-ch-ua-mobile",
        "sec-ch-ua-platform",
        "sec-fetch-dest",
        "sec-fetch-mode",
        "sec-fetch-site",
    }
    return {
        str(key).lower(): str(value)[:500]
        for key, value in (headers or {}).items()
        if str(key).lower() in allowed
    }


async def redeem_one(page, job: dict) -> dict:
    job_key = str(job.get("jobKey") or "")
    player_id = str(job.get("playerId") or "")
    gift_code = str(job.get("giftCode") or "")
    attempts = int(job.get("attempts") or 0)

    result = {
        "jobKey": job_key,
        "playerId": player_id,
        "giftCode": gift_code,
        "attempts": attempts,
        "ok": False,
        "status": "failed",
        "message": "",
        "response": {"source": daemon_source()},
    }
    official_trace: list[dict] = []
    capture_tasks: list[asyncio.Task] = []

    async def capture_response(response) -> None:
        try:
            if not CAPTURE_OFFICIAL_REQUESTS or not official_trace_url(response.url):
                return
            request = response.request
            request_headers = {}
            try:
                request_headers = await request.all_headers()
            except Exception:
                request_headers = getattr(request, "headers", {}) or {}
            post_data = getattr(request, "post_data", None)
            if callable(post_data):
                post_data = post_data()
            response_text = ""
            try:
                response_text = await response.text()
            except Exception as error:
                response_text = f"<response text unavailable: {error}>"
            official_trace.append({
                "url": response.url,
                "method": request.method,
                "status": response.status,
                "request_headers": safe_capture_headers(request_headers),
                "post_data": str(post_data or "")[:1000],
                "response_text": response_text[:2000],
            })
        except Exception as error:
            official_trace.append({"capture_error": str(error)[:240]})

    def on_response(response) -> None:
        if CAPTURE_OFFICIAL_REQUESTS and official_trace_url(response.url):
            capture_tasks.append(asyncio.create_task(capture_response(response)))

    if CAPTURE_OFFICIAL_REQUESTS:
        page.on("response", on_response)

    try:
        await page.goto(OFFICIAL_REDEEM_URL, wait_until="domcontentloaded", timeout=TIMEOUT_MS * 8)
        blocked = await detect_blocked_or_unready(page)
        if blocked:
            result.update(status=blocked, message="Official page requires verification.")
            return result

        await page.fill("input[placeholder='Player ID']", player_id, timeout=TIMEOUT_MS * 4)
        await page.click("div.btn.login_btn", timeout=TIMEOUT_MS * 4)
        await page.wait_for_timeout(900)

        login_message = await read_modal_message(page)
        if login_message:
            await close_modal(page)
            status, ok = classify_message(login_message)
            if status == "failed":
                status = "server_busy" if "server busy" in login_message.lower() else "not_logged_in"
            result.update(status=status, ok=ok, message=login_message)
            return result

        try:
            player_nick = (await page.inner_text("p.name", timeout=TIMEOUT_MS * 5)).strip()
        except Exception:
            blocked = await detect_blocked_or_unready(page)
            result.update(
                status=blocked or "timeout",
                message="Player login did not complete before timeout.",
            )
            return result

        await page.fill("input[placeholder='Enter Gift Code']", gift_code, timeout=TIMEOUT_MS * 4)
        await page.click("div.btn.exchange_btn", timeout=TIMEOUT_MS * 4)
        await page.wait_for_timeout(900)

        modal_text = await read_modal_message(page)
        if not modal_text:
            result.update(status="timeout", message="No confirmation modal appeared.")
            return result

        await close_modal(page)
        await exit_player_panel(page)

        status, ok = classify_message(modal_text)
        result.update(
            status=status,
            ok=ok,
            message=modal_text,
            playerNick=player_nick,
            response={
                "source": daemon_source(),
                "player_nick": player_nick,
                "message": modal_text,
            },
        )
        return result
    except PlaywrightTimeoutError as error:
        result.update(status="timeout", message=f"Timeout: {error}")
        return result
    except Exception as error:
        result.update(status="network_error", message=str(error))
        return result
    finally:
        if CAPTURE_OFFICIAL_REQUESTS:
            if capture_tasks:
                await asyncio.gather(*capture_tasks, return_exceptions=True)
            if official_trace:
                response = result.get("response") if isinstance(result.get("response"), dict) else {}
                result["response"] = {
                    **response,
                    "official_trace": official_trace[:8],
                }


async def redeem_jobs(jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []
    if async_playwright is None:
        return [
            {
                "jobKey": job.get("jobKey"),
                "playerId": job.get("playerId"),
                "giftCode": job.get("giftCode"),
                "attempts": job.get("attempts"),
                "ok": False,
                "status": "failed",
                "message": "Playwright is not installed. Run: pip install -r requirements.txt && python3 -m playwright install chromium",
            }
            for job in jobs
        ]

    results: list[dict] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=HEADLESS)
        semaphore = asyncio.Semaphore(CONCURRENCY)
        ordered_results: list[dict | None] = [None] * len(jobs)

        async def run_one(index: int, job: dict) -> None:
            async with semaphore:
                page = await browser.new_page(user_agent=USER_AGENT, viewport={"width": 1280, "height": 900})
                try:
                    ordered_results[index] = await redeem_one(page, job)
                finally:
                    await page.close()
                await asyncio.sleep(0.5)

        await asyncio.gather(*(run_one(index, job) for index, job in enumerate(jobs)))
        results = [result for result in ordered_results if result is not None]
        await browser.close()
    return results


def timeout_result_for_job(job: dict, message: str) -> dict:
    return {
        "jobKey": job.get("jobKey"),
        "playerId": job.get("playerId"),
        "giftCode": job.get("giftCode"),
        "attempts": job.get("attempts"),
        "ok": False,
        "status": "timeout",
        "message": message,
        "response": {"source": daemon_source(), "batch_timeout": True},
    }


def count_result_sources(results: list[dict]) -> tuple[dict[str, int], dict[str, int]]:
    sources: dict[str, int] = {}
    fallbacks: dict[str, int] = {}
    for result in results or []:
        response = result.get("response") if isinstance(result.get("response"), dict) else {}
        source = str(response.get("source") or "unknown")
        fallback_from = str(response.get("fallback_from") or "")
        sources[source] = sources.get(source, 0) + 1
        if fallback_from:
            fallbacks[fallback_from] = fallbacks.get(fallback_from, 0) + 1
    return sources, fallbacks


def tag_browser_review_results(results: list[dict]) -> list[dict]:
    for result in results or []:
        response = result.get("response") if isinstance(result.get("response"), dict) else {}
        response = {**response, "source": "putty-browser-review-daemon", "review_only": True}
        result["response"] = response
    return results


def print_cycle(
    started: str,
    claim: dict,
    report: dict | None = None,
    error: str = "",
    started_ms: int | None = None,
    raw_results: list[dict] | None = None,
) -> None:
    jobs = claim.get("jobs") or []
    recovered = claim.get("recovered") or {}
    now_ms = int(time.time() * 1000)
    duration_sec = round(max(0, now_ms - (started_ms or now_ms)) / 1000, 1)
    processed = int((report or {}).get("processed", 0) or 0)
    throughput = round((processed / duration_sec) * 60, 1) if duration_sec > 0 and processed else 0
    sources, fallbacks = count_result_sources(raw_results or [])
    status_counts: dict[str, int] = {}
    samples: list[str] = []
    report_failed_samples: list[str] = []
    for row in (report or {}).get("results", [])[:50]:
        status = str(row.get("status") or "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        message = str(row.get("message") or "").strip()
        sample = f"{status}: {message[:160]}" if message else status
        if status == "report_failed" and len(report_failed_samples) < 5:
            report_failed_samples.append(sample)
        elif message and len(samples) < 3:
            samples.append(sample)
    payload = {
        "time": started,
        "ok": not error,
        "durationSec": duration_sec,
        "perMin": throughput,
        "claimMode": claim.get("claimMode"),
        "claimed": len(jobs),
        "processed": processed,
        "saved": (report or {}).get("saved", 0),
        "saveFailed": (report or {}).get("saveFailed", 0),
        "success": (report or {}).get("success", 0),
        "failed": (report or {}).get("failed", 0),
        "retrying": (report or {}).get("retrying", 0),
        "deferred": (report or {}).get("deferred", 0),
        "reviewing": (report or {}).get("reviewing", 0),
        "recovered": recovered.get("recovered", 0),
        "deferredRecovered": recovered.get("deferredRecovered", 0),
        "staleFailed": recovered.get("failed", 0),
        "statuses": status_counts,
        "sources": sources,
        "fallbacks": fallbacks,
        "samples": (report_failed_samples[:3] or samples),
        "reportFailedSamples": report_failed_samples,
        "error": error,
    }
    print(json.dumps(payload, ensure_ascii=False), flush=True)


async def run_once() -> int:
    if DAEMON_MODE in {"browser", "hybrid"} and async_playwright is None:
        raise RuntimeError(
            "Playwright is not installed. Install it before starting the daemon: "
            "pip install -r requirements.txt && python3 -m playwright install chromium"
        )

    started_text = time.strftime("%Y-%m-%d %H:%M:%S")
    started_ms = int(time.time() * 1000)
    review_pass = REVIEW_ONLY
    claim = request_json("/api/redeem/claim", {"limit": REVIEW_BATCH_SIZE if REVIEW_ONLY else BATCH_SIZE, "reviewOnly": REVIEW_ONLY})
    jobs = claim.get("jobs") or []
    if (
        not jobs
        and AUTO_REVIEW
        and not REVIEW_ONLY
        and DAEMON_MODE == "hybrid"
    ):
        review_claim = request_json("/api/redeem/claim", {"limit": REVIEW_BATCH_SIZE, "reviewOnly": True})
        review_jobs = review_claim.get("jobs") or []
        if review_jobs:
            claim = review_claim
            jobs = review_jobs
            review_pass = True
    if not jobs:
        report = request_json("/api/redeem/report", {"startedAtMs": started_ms, "results": []})
        print_cycle(started_text, claim, report, started_ms=started_ms, raw_results=[])
        return 0

    try:
        if review_pass:
            task = redeem_jobs(jobs)
        elif DAEMON_MODE == "api":
            task = redeem_jobs_api_with_browser_fallback(jobs)
        elif DAEMON_MODE == "hybrid":
            task = redeem_jobs_hybrid_with_browser_fallback(jobs)
        else:
            task = redeem_jobs(jobs)
        results = await task if BATCH_TIMEOUT_SECONDS <= 0 else await asyncio.wait_for(task, timeout=BATCH_TIMEOUT_SECONDS)
        if review_pass:
            results = tag_browser_review_results(results)
    except asyncio.TimeoutError:
        results = [
            timeout_result_for_job(job, f"Batch timed out after {BATCH_TIMEOUT_SECONDS}s; job will retry.")
            for job in jobs
        ]
        if review_pass:
            results = tag_browser_review_results(results)
    report = request_json("/api/redeem/report", {"startedAtMs": started_ms, "results": results})
    print_cycle(started_text, claim, report, started_ms=started_ms, raw_results=results)
    return len(jobs)


def main() -> int:
    if not ADMIN_TOKEN:
        print("ADMIN_TOKEN is required.", file=sys.stderr)
        return 2
    if DAEMON_MODE not in {"api", "hybrid", "browser"}:
        print("AUTO_REDEEM_DAEMON_MODE must be api, hybrid, or browser.", file=sys.stderr)
        return 2
    if DAEMON_MODE in {"hybrid", "browser"} and async_playwright is None:
        print(
            "Playwright is not installed. Stop here before claiming jobs.\n"
            "Run: pip install -r requirements.txt && python3 -m playwright install chromium",
            file=sys.stderr,
            flush=True,
        )
        return 2

    print(
        f"Auto Redeem daemon started. mode={DAEMON_MODE} base={BASE_URL} interval={INTERVAL}s "
        f"batch={BATCH_SIZE} reviewBatch={REVIEW_BATCH_SIZE} concurrency={CONCURRENCY} rest={REST_SECONDS:g}s "
        f"headless={HEADLESS} batchTimeout={'off' if BATCH_TIMEOUT_SECONDS <= 0 else str(BATCH_TIMEOUT_SECONDS) + 's'} "
        f"reviewOnly={REVIEW_ONLY} autoReview={AUTO_REVIEW} "
        f"fallback={'browser' if DAEMON_MODE in {'api', 'hybrid'} and API_FALLBACK_BROWSER else 'off'}",
        flush=True,
    )
    while True:
        sleep_seconds = INTERVAL
        try:
            claimed = asyncio.run(run_once())
            sleep_seconds = REST_SECONDS if claimed else INTERVAL
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code == 403 and "1010" in detail:
                detail = (
                    "Cloudflare blocked this server request before it reached the Worker "
                    "(error code: 1010). Add a Cloudflare WAF/Security skip rule for "
                    "/api/redeem/* or allow this server IP."
                )
            print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} HTTP {error.code}: {detail}", flush=True)
        except KeyboardInterrupt:
            raise
        except Exception as error:
            print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} ERROR: {error}", flush=True)
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
