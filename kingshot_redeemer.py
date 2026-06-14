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
        timeout_seconds: float = 12.0,
        max_concurrency: int = 2,
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

            try:
                results = await self._run_batch(
                    browser,
                    kingshot_ids,
                    gift_code,
                    progress_callback,
                    progress_offset=0,
                    progress_total=len(kingshot_ids),
                )

                retry_indexes = [
                    index
                    for index, result in enumerate(results)
                    if self._should_retry(result)
                ]

                if retry_indexes:
                    await asyncio.sleep(3)

                    retry_ids = [results[index].kingshot_id for index in retry_indexes]
                    retry_results = await self._run_batch(
                        browser,
                        retry_ids,
                        gift_code,
                        progress_callback=None,
                        progress_offset=0,
                        progress_total=len(retry_ids),
                    )

                    for original_index, retry_result in zip(retry_indexes, retry_results):
                        message = retry_result.message
                        if retry_result.ok:
                            message = f"{message} Retried after temporary failure."
                        elif retry_result.message != results[original_index].message:
                            message = f"{message} Retried after temporary failure."

                        results[original_index] = RedeemResult(
                            kingshot_id=retry_result.kingshot_id,
                            ok=retry_result.ok,
                            status=retry_result.status,
                            account_info=retry_result.account_info,
                            message=message,
                        )

                return results

            finally:
                await browser.close()

    async def _run_batch(
        self,
        browser,
        kingshot_ids: list[str],
        gift_code: str,
        progress_callback: ProgressCallback | None,
        progress_offset: int,
        progress_total: int,
    ) -> list[RedeemResult]:
        results: list[RedeemResult | None] = [None] * len(kingshot_ids)
        completed = 0
        completed_lock = asyncio.Lock()
        semaphore = asyncio.Semaphore(self.max_concurrency)

        async def run_one(index: int, kingshot_id: str) -> None:
            nonlocal completed

            await asyncio.sleep(index * self.delay_seconds)

            async with semaphore:
                result = await self._redeem_one(browser, kingshot_id, gift_code)

            results[index] = result

            async with completed_lock:
                completed += 1
                current_completed = progress_offset + completed

            if progress_callback:
                await progress_callback(current_completed, progress_total, result)

        tasks = [
            asyncio.create_task(run_one(index, kingshot_id))
            for index, kingshot_id in enumerate(kingshot_ids)
        ]
        await asyncio.gather(*tasks)

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

            if self._is_unknown_account_info(account_info):
                await page.wait_for_timeout(300)
                account_info = await self._read_account_info(page)

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
                    const hasGiftCenter = /Gift\\s*Code\\s*Center/i.test(text);
                    const hasTownCenter = /Town\\s*Center\\s*Level/i.test(text);
                    const hasState = /State\\s*:?\\s*\\d+/i.test(text);
                    const hasLevelIcon = !!document.querySelector("img.level_icon");
                    return hasGiftCenter && (hasTownCenter || hasState || hasLevelIcon);
                }
                """,
                timeout=5000,
            )
        except Exception:
            await page.wait_for_timeout(1000)

    async def _read_account_info(self, page) -> str:
        data = await page.evaluate(
            """
            () => {
                const bodyText = document.body.innerText || "";
                const imageSources = [];

                for (const img of document.querySelectorAll("img")) {
                    if (img.currentSrc) imageSources.push(img.currentSrc);
                    if (img.src) imageSources.push(img.src);
                    const attrSrc = img.getAttribute("src");
                    if (attrSrc) imageSources.push(attrSrc);
                }

                return {
                    bodyText,
                    imageSources
                };
            }
            """
        )

        return self._clean_account_info(
            data.get("bodyText", ""),
            data.get("imageSources", []),
        )

    async def _read_feedback(self, page) -> str:
        try:
            await page.wait_for_function(
                """
                () => {
                    const text = document.body.innerText || "";
                    return /gift code|success|reward|invalid|expired|not found|already|claimed|case-sensitive|failed/i.test(text);
                }
                """,
                timeout=1500,
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

    def _clean_account_info(self, body_text: str, image_sources: list[str]) -> str:
        raw_text = body_text or ""
        cleaned = " ".join(raw_text.split())
        raw_lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

        if not cleaned:
            return "Unknown Player | TC Unknown | State Unknown"

        state = "State Unknown"

        for line in raw_lines:
            match = re.search(r"^State\\s*:?\\s*(\\d+)$", line, re.IGNORECASE)
            if match:
                state = f"State {match.group(1)}"
                break

        if state == "State Unknown":
            state_match = re.search(r"State\\s*:?\\s*(\\d+)", cleaned, re.IGNORECASE)
            if state_match:
                state = f"State {state_match.group(1)}"

        town_center = "TC Unknown"

        sources = " ".join(image_sources or [])
        tg_match = re.search(r"stove_lv_(10|[1-9])\\.png", sources, re.IGNORECASE)
        if tg_match:
            town_center = f"TG{tg_match.group(1)}"
        else:
            for index, line in enumerate(raw_lines):
                if re.search(r"Town\\s*Center\\s*Level", line, re.IGNORECASE):
                    same_line_match = re.search(r"Town\\s*Center\\s*Level\\s*:?\\s*(\\d{1,2})", line, re.IGNORECASE)
                    if same_line_match:
                        level = int(same_line_match.group(1))
                        if 1 <= level <= 30:
                            town_center = f"TC {level}"
                            break

                    if index + 1 < len(raw_lines):
                        next_line = raw_lines[index + 1]
                        next_line_match = re.search(r"^(\\d{1,2})$", next_line)
                        if next_line_match:
                            level = int(next_line_match.group(1))
                            if 1 <= level <= 30:
                                town_center = f"TC {level}"
                                break

            if town_center == "TC Unknown":
                tc_match = re.search(
                    r"Town\\s*Center\\s*Level\\s*:?\\s*(\\d{1,2})",
                    cleaned,
                    re.IGNORECASE,
                )
                if tc_match:
                    level = int(tc_match.group(1))
                    if 1 <= level <= 30:
                        town_center = f"TC {level}"

        name = self._extract_player_name(raw_text, cleaned)

        return " | ".join([name, town_center, state])

    def _extract_player_name(self, raw_text: str, cleaned: str) -> str:
        raw_lines = [line.strip() for line in (raw_text or "").splitlines() if line.strip()]

        for index, line in enumerate(raw_lines):
            if line.lower() == "gift code center":
                for next_line in raw_lines[index + 1:]:
                    lowered = next_line.lower()

                    if lowered in {"town center level:", "town center level"}:
                        break

                    if self._is_bad_name_line(next_line):
                        continue

                    return self._clean_player_name(next_line)

        return "Unknown Player"

    def _is_bad_name_line(self, line: str) -> bool:
        lowered = (line or "").strip().lower()
        if not lowered:
            return True

        bad_words = [
            "english",
            "login",
            "gift code center",
            "gift code",
            "town center level",
            "state:",
            "confirm",
            "check your player id",
            "avatar",
            "settings",
            "redeem",
            "rewards will be",
            "gift code not found",
            "case-sensitive",
            "retreat",
            "already claimed",
            "unable to claim",
        ]

        return any(word in lowered for word in bad_words)

    def _clean_player_name(self, name: str) -> str:
        name = " ".join((name or "").split())

        if not name or name.startswith("*") or "login" in name.lower():
            return "Unknown Player"

        return name[:60]

    def _is_unknown_account_info(self, account_info: str) -> bool:
        lowered = (account_info or "").lower()
        return (
            not account_info
            or "unknown player" in lowered
            or "tc unknown" in lowered
            or "state unknown" in lowered
            or "check your player id" in lowered
            or "login" in lowered
        )

    def _should_retry(self, result: RedeemResult) -> bool:
        if result.ok:
            return False

        message = (result.message or "").lower()

        permanent_failures = [
            "already claimed",
            "unable to claim again",
            "gift code not found",
            "case-sensitive",
            "expired",
            "already been used",
            "invalid gift code",
        ]

        if any(item in message for item in permanent_failures):
            return False

        retryable_failures = [
            "timed out",
            "timeout",
            "could not find",
            "net::",
            "err_",
            "server",
            "connection",
            "navigation",
            "target closed",
            "page closed",
            "503",
            "502",
            "504",
        ]

        return any(item in message for item in retryable_failures)

    def _clean_feedback(self, text: str) -> str:
        if not text:
            return ""

        cleaned = " ".join(text.split())

        feedback_patterns = [
            r"Already claimed, unable to claim again\\.?",
            r"Gift Code not found, this is case-sensitive!",
            r"This gift code has expired[^.]*\\.?",
            r"This gift code has already been used[^.]*\\.?",
            r"Invalid gift code[^.]*\\.?",
            r"Rewards sent successfully[^.]*\\.?",
            r"Redeemed successfully[^.]*\\.?",
            r"Success[^.]*\\.?",
        ]
