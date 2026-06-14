import asyncio
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
        delay_seconds: float = 2.5,
        timeout_seconds: float = 45.0,
    ):
        self.headless = headless
        self.delay_seconds = delay_seconds
        self.timeout_ms = int(timeout_seconds * 1000)

    async def redeem_many(
        self,
        kingshot_ids: list[str],
        gift_code: str,
        progress_callback: ProgressCallback | None = None,
    ) -> list[RedeemResult]:
        results: list[RedeemResult] = []
        total = len(kingshot_ids)

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=self.headless)
            try:
                for index, kingshot_id in enumerate(kingshot_ids, start=1):
                    result = await self._redeem_one(browser, kingshot_id, gift_code)
                    results.append(result)

                    if progress_callback:
                        await progress_callback(index, total, result)

                    await asyncio.sleep(self.delay_seconds)
            finally:
                await browser.close()

        return results

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

            await page.wait_for_timeout(1200)
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
                await locator.wait_for(state="visible", timeout=7000)
                return locator
            except Exception as exc:
                last_error = exc

        raise RuntimeError(f"Could not find a usable page element. Last error: {last_error}")

    async def _read_account_info(self, page) -> str:
        text = await self._read_text_from_candidates(
            page,
            [
                ".user-info",
                ".player-info",
                ".role-info",
                ".account-info",
                "[class*='user' i]",
                "[class*='player' i]",
                "[class*='role' i]",
                "body",
            ],
            max_length=300,
        )

        return self._clean_account_info(text)

    async def _read_feedback(self, page) -> str:
        await page.wait_for_timeout(1800)

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

        return text or "Submitted, but no response text was detected."

    async def _read_text_from_candidates(self, page, selectors: list[str], max_length: int) -> str:
        for selector in selectors:
            try:
                text = await page.locator(selector).first.inner_text(timeout=1500)
                text = " ".join(text.strip().split())

                if text:
                    return text[:max_length]

            except Exception:
                continue

        return ""

    def _clean_account_info(self, text: str) -> str:
        if not text:
            return "Account info not detected."

        ignored = {
            "login",
            "log in",
            "confirm",
            "redeem",
            "gift code",
            "player id",
            "character id",
        }

        parts = [part.strip() for part in text.replace("|", "\n").split("\n") if part.strip()]
        useful = [part for part in parts if part.lower() not in ignored]

        if useful:
            return " / ".join(useful[:4])[:300]

        return text[:300]

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
