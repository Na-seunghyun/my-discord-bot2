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
        delay_seconds: float = 0.2,
        timeout_seconds: float = 20.0,
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
            browser = await playwright.chromium.launch(headless=self.headless)

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
        account_info = "Account info not detected."

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
            )
            await id_input.fill(kingshot_id)

            login_button = await self._first_visible(
                page,
                [
                    "button:has-text('Login')",
                    "button:has-text('Log in')",
                    "text=/^\\s*Login\\s*$/i",
                ],
            )
            await login_button.click()

            await page.wait_for_timeout(500)
            account_info = await self._read_account_info(page)

            code_input = await self._first_visible(
                page,
                [
                    "input[placeholder*='code' i]",
                    "input[placeholder*='gift' i]",
                    "textarea",
                    "input[type='text']",
                    "input:not([type])",
                ],
            )
            await code_input.fill(gift_code)

            confirm_button = await self._first_visible(
                page,
                [
                    "button:has-text('Confirm')",
                    "button:has-text('Redeem')",
                    "text=/^\\s*Confirm\\s*$/i",
                ],
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

    async def _first_visible(self, page, selectors: list[str]):
        last_error: Exception | None = None

        for selector in selectors:
            try:
                locator = page.locator(selector).first
                await locator.wait_for(state="visible", timeout=5000)
                return locator
            except Exception as exc:
                last_error = exc

        raise RuntimeError(f"Could not find a usable page element. Last error: {last_error}")

    async def _read_account_info(self, page) -> str:
        text = await page.evaluate(
            """
            () => {
                const values = [];

                function add(value) {
                    if (!value) return;
                    const cleaned = String(value).replace(/\\s+/g, " ").trim();
                    if (cleaned && !values.includes(cleaned)) values.push(cleaned);
                }

                add(document.body.innerText);

                for (const el of document.querySelectorAll("*")) {
                    const rect = el.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.height > 0;
                    if (!visible) continue;

                    add(el.innerText);
                    add(el.className);
                    add(el.id);
                    add(el.getAttribute("aria-label"));
                    add(el.getAttribute("title"));
                    add(el.getAttribute("alt"));
                    add(el.getAttribute("src"));
                    add(el.getAttribute("data-src"));
                    add(el.getAttribute("style"));
                    add(el.getAttribute("data-level"));
                    add(el.getAttribute("data-value"));

                    if (el.currentSrc) add(el.currentSrc);

                    const style = window.getComputedStyle(el);
                    add(style.backgroundImage);
                }

                return values.join("\\n");
            }
            """
        )

        return self._clean_account_info(text)

    async def _read_feedback(self, page) -> str:
        await page.wait_for_timeout(700)

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
                text = await page.locator(selector).first.inner_text(timeout=1000)
                text = " ".join(text.strip().split())

                if text:
                    return text[:max_length]

            except Exception:
                continue

        return ""

    def _clean_account_info(self, text: str) -> str:
        if not text:
            return "Unknown Player | TC Unknown"

        cleaned = " ".join(text.split())

        state_match = re.search(r"State\\s*:?\\s*(\\d+)", cleaned, re.IGNORECASE)
        state = f"State {state_match.group(1)}" if state_match else "State Unknown"

        town_center = "TC Unknown"

        normal_tc_match = re.search(
            r"Town\\s*Center\\s*Level\\s*:?\\s*(\\d{1,2})",
            cleaned,
            re.IGNORECASE,
        )
        if normal_tc_match:
            level = int(normal_tc_match.group(1))
            if 1 <= level <= 30:
                town_center = f"TC {level}"

        tg_patterns = [
            r"stove_lv_(10|[1-9])\\.png",
            r"\\bTG\\s*(10|[1-9])\\b",
            r"\\btg[-_ ]?(10|[1-9])\\b",
            r"\\btown[-_ ]?guard[-_ ]?(10|[1-9])\\b",
            r"\\btranscendence[-_ ]?(10|[1-9])\\b",
        ]

        for pattern in tg_patterns:
            match = re.search(pattern, cleaned, re.IGNORECASE)
            if match:
                town_center = f"TG{match.group(1)}"
                break

        name = "Unknown Player"

        name_match = re.search(
            r"^(.+?)\\s+Town\\s*Center\\s*Level",
            cleaned,
            re.IGNORECASE,
        )
        if name_match:
            name = name_match.group(1).strip()[:60]
        else:
            before_state = cleaned.split(" State ")[0].strip()
            before_state = re.sub(
                r"Town\\s*Center\\s*Level\\s*:?\\s*(\\d{1,2})?",
                "",
                before_state,
                flags=re.IGNORECASE,
            ).strip()

            before_state = re.sub(
                r"https?://\\S+",
                "",
                before_state,
                flags=re.IGNORECASE,
            ).strip()

            if before_state:
                name = before_state[:60]

        extra = "Retreat" if "retreat" in cleaned.lower() else ""

        pieces = [name, town_center, state]
        if extra:
            pieces.append(extra)

        return " | ".join(pieces)

    def _clean_feedback(self, text: str) -> str:
        if not text:
            return ""

        cleaned = " ".join(text.split())

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
