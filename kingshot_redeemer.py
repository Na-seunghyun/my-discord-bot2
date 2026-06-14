import asyncio
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright


GIFT_CODE_URL = "https://ks-giftcode.centurygame.com/"


@dataclass(frozen=True)
class RedeemResult:
    kingshot_id: str
    ok: bool
    status: str
    account_info: str
    message: str


ProgressCallback = Callable[[int, int, RedeemResult], Awaitable[None]]


class KingShotRedeemer:
    def __init__(
        self,
        *,
        headless: bool = True,
        delay_seconds: float = 0.05,
        timeout_seconds: float = 10.0,
        max_concurrency: int = 3,
    ):
        self.headless = headless
        self.delay_seconds = delay_seconds
        self.timeout_ms = int(timeout_seconds * 1000)
        self.max_concurrency = max(1, max_concurrency)

    async def redeem_many(
        self,
        kingshot_ids: list[str],
        gift_code: str,
        progress_callback: ProgressCallback | None = None,
    ) -> list[RedeemResult]:
        results: list[RedeemResult | None] = [None] * len(kingshot_ids)
        total = len(kingshot_ids)
        completed = 0
        completed_lock = asyncio.Lock()
        semaphore = asyncio.Semaphore(self.max_concurrency)

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=self.headless,
                args=[
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--no-sandbox",
                    "--disable-extensions",
                    "--disable-background-networking",
                ],
            )

            async def run_one(index: int, kingshot_id: str) -> None:
                nonlocal completed

                await asyncio.sleep(index * self.delay_seconds)

                async with semaphore:
                    result = await self._redeem_one(browser, kingshot_id, gift_code)

                results[index] = result

                async with completed_lock:
                    completed += 1
                    current_completed = completed

                if progress_callback:
                    await progress_callback(current_completed, total, result)

            try:
                tasks = [
                    asyncio.create_task(run_one(index, kingshot_id))
                    for index, kingshot_id in enumerate(kingshot_ids)
                ]
                await asyncio.gather(*tasks)
            finally:
                await browser.close()

        return [result for result in results if result is not None]

    async def _redeem_one(self, browser, kingshot_id: str, gift_code: str) -> RedeemResult:
        page = await browser.new_page()
        page.set_default_timeout(self.timeout_ms)
        account_info = "Unknown Player | TC Unknown | State Unknown"

        try:
            await page.goto(GIFT_CODE_URL, wait_until="domcontentloaded")

            id_input = await self._first_visible(
                page,
                [
                    "input[placeholder*='ID' i]",
                    "input[placeholder*='player' i]",
                    "input[type='text']",
                    "input:not([type])",
                ],
                timeout_ms=3000,
            )
            await id_input.fill(kingshot_id)

            login_button = await self._first_visible(
                page,
                [
                    "button:has-text('Login')",
                    "button:has-text('Log in')",
                    "text=/^\\s*Login\\s*$/i",
                ],
                timeout_ms=3000,
            )
            await login_button.click()

            await self._wait_for_account_loaded(page)
            account_info = await self._read_account_info(page)

            code_input = await self._find_gift_code_input(page, kingshot_id)
            await code_input.fill(gift_code)

            confirm_button = await self._first_visible(
                page,
                [
                    "button:has-text('Confirm')",
                    "button:has-text('Redeem')",
                    "text=/^\\s*Confirm\\s*$/i",
                ],
                timeout_ms=3000,
            )
            await confirm_button.click()

            message = await self._read_feedback(page)
            ok = self._looks_successful(message)

            return RedeemResult(
                kingshot_id=kingshot_id,
                ok=ok,
                status="SUCCESS" if ok else "FAILED",
                account_info=account_info,
                message=message,
            )

        except PlaywrightTimeoutError:
            return RedeemResult(
                kingshot_id=kingshot_id,
                ok=False,
                status="FAILED",
                account_info=account_info,
                message="Timed out while using the gift-code page.",
            )

        except Exception as exc:
            return RedeemResult(
                kingshot_id=kingshot_id,
                ok=False,
                status="FAILED",
                account_info=account_info,
                message=str(exc),
            )

        finally:
            await page.close()

    async def _first_visible(self, page, selectors: list[str], timeout_ms: int = 3000):
        last_error: Exception | None = None

        for selector in selectors:
            try:
                locator = page.locator(selector).first
                await locator.wait_for(state="visible", timeout=timeout_ms)
                return locator
            except Exception as exc:
                last_error = exc

        raise RuntimeError(f"Could not find a usable page element. Last error: {last_error}")

    async def _find_gift_code_input(self, page, kingshot_id: str):
        try:
            preferred = page.locator("input[placeholder*='code' i], input[placeholder*='gift' i], textarea").first
            await preferred.wait_for(state="visible", timeout=1500)
            return preferred
        except Exception:
            pass

        inputs = page.locator("input:visible, textarea:visible")
        count = await inputs.count()

        for index in range(count - 1, -1, -1):
            item = inputs.nth(index)
            try:
                value = await item.input_value(timeout=500)
                if value.strip() != kingshot_id:
                    return item
            except Exception:
                return item

        raise RuntimeError("Could not find the gift-code input.")

    async def _wait_for_account_loaded(self, page) -> None:
        try:
            await page.wait_for_function(
                """
                () => {
                    const text = document.body.innerText || "";
                    const hasAccountText = /Town\\s*Center\\s*Level|State\\s*:?\\s*\\d+/i.test(text);
                    const hasLevelIcon = !!document.querySelector("img.level_icon");
                    return hasAccountText || hasLevelIcon;
                }
                """,
                timeout=3000,
            )
        except Exception:
            await page.wait_for_timeout(300)

    async def _read_account_info(self, page) -> str:
        data = await page.evaluate(
            """
            () => {
                const bodyText = document.body.innerText || "";
                const levelIcon = document.querySelector("img.level_icon");
                const levelSrc = levelIcon
                    ? (levelIcon.currentSrc || levelIcon.src || levelIcon.getAttribute("src") || "")
                    : "";

                return {
                    bodyText,
                    levelSrc
                };
            }
            """
        )

        return self._clean_account_info(
            data.get("bodyText", ""),
            data.get("levelSrc", ""),
        )

    async def _read_feedback(self, page) -> str:
        try:
            await page.wait_for_function(
                """
                () => {
                    const text = document.body.innerText || "";
                    return /gift code|success|reward|invalid|expired|not found|already|case-sensitive|failed/i.test(text);
                }
                """,
                timeout=1200,
            )
        except Exception:
            await page.wait_for_timeout(300)

        text = await self._read_text_from_candidates(
            page,
            [
                "[role='dialog']",
                ".modal",
                ".toast",
                ".notice",
                ".message",
                "[class*='toast' i]",
                "[class*='modal' i]",
                "[class*='message' i]",
                "body",
            ],
            max_length=500,
        )

        return self._clean_feedback(text) or "Submitted, but no response text was detected."

    async def _read_text_from_candidates(self, page, selectors: list[str], max_length: int) -> str:
        for selector in selectors:
            try:
                text = await page.locator(selector).first.inner_text(timeout=500)
                text = " ".join(text.strip().split())

                if text:
                    return text[:max_length]

            except Exception:
                continue

        return ""

    def _clean_account_info(self, body_text: str, level_src: str) -> str:
        cleaned = " ".join((body_text or "").split())

        state = "State Unknown"
        state_match = re.search(r"State\\s*:?\\s*(\\d+)", cleaned, re.IGNORECASE)
        if state_match:
            state = f"State {state_match.group(1)}"

        town_center = "TC Unknown"

        tg_match = re.search(r"stove_lv_(10|[1-9])\\.png", level_src or "", re.IGNORECASE)
        if tg_match:
            town_center = f"TG{tg_match.group(1)}"
        else:
            tc_match = re.search(
                r"Town\\s*Center\\s*Level\\s*:?\\s*(\\d{1,2})",
                cleaned,
                re.IGNORECASE,
            )
            if tc_match:
                level = int(tc_match.group(1))
                if 1 <= level <= 30:
                    town_center = f"TC {level}"

        name = self._extract_player_name(cleaned)

        return " | ".join([name, town_center, state])

    def _extract_player_name(self, cleaned: str) -> str:
        bad_markers = [
            "*Check your Player ID",
            "Login",
            "Gift Code not found",
            "Please enter",
        ]

        for marker in bad_markers:
            if marker.lower() in cleaned.lower() and "Town Center Level" not in cleaned:
                return "Unknown Player"

        patterns = [
            r"Gift\\s*Code\\s*Center\\s+(.+?)\\s+Town\\s*Center\\s*Level",
            r"Center\\s+(.+?)\\s+Town\\s*Center\\s*Level",
            r"^(.+?)\\s+Town\\s*Center\\s*Level",
        ]

        for pattern in patterns:
            match = re.search(pattern, cleaned, re.IGNORECASE)
            if match:
                return self._clean_player_name(match.group(1))

        return "Unknown Player"

    def _clean_player_name(self, name: str) -> str:
        name = " ".join((name or "").split())
        name = re.sub(
            r"^(English|Korean|Japanese|Chinese|Deutsch|French|Spanish)\\s+",
            "",
            name,
            flags=re.IGNORECASE,
        )
        name = name.replace("Gift Code Center", "").strip()

        if not name or name.startswith("*") or "login" in name.lower():
            return "Unknown Player"

        return name[:60]

    def _clean_feedback(self, text: str) -> str:
        if not text:
            return ""

        cleaned = " ".join(text.split())

        feedback_patterns = [
            r"Gift Code not found, this is case-sensitive!",
            r"This gift code has expired[^.]*\\.?",
            r"This gift code has already been used[^.]*\\.?",
            r"Invalid gift code[^.]*\\.?",
            r"Rewards sent successfully[^.]*\\.?",
            r"Redeemed successfully[^.]*\\.?",
            r"Success[^.]*\\.?",
        ]

        for pattern in feedback_patterns:
            match = re.search(pattern, cleaned, re.IGNORECASE)
            if match:
                return match.group(0).strip()

        removable_suffixes = [
            " Confirm",
            " Redeem",
            " Login",
            " Log in",
        ]

        changed = True
        while changed:
            changed = False
            for suffix in removable_suffixes:
                if cleaned.endswith(suffix):
                    cleaned = cleaned[: -len(suffix)].strip()
                    changed = True

        return cleaned[:500]

    def _looks_successful(self, message: str) -> bool:
        lowered = message.lower()

        failure_words = [
            "already",
            "cannot",
            "error",
            "expired",
            "fail",
            "invalid",
            "not exist",
            "not found",
            "used",
            "wrong",
        ]

        success_words = [
            "success",
            "successful",
            "sent",
            "reward",
            "claimed",
            "redeemed",
        ]

        if any(word in lowered for word in failure_words):
            return False

        if any(word in lowered for word in success_words):
            return True

        return False
