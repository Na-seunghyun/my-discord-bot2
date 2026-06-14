import asyncio
from dataclasses import dataclass

from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright


GIFT_CODE_URL = "https://ks-giftcode.centurygame.com/"


@dataclass(frozen=True)
class RedeemResult:
    kingshot_id: str
    ok: bool
    message: str


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

    async def redeem_many(self, kingshot_ids: list[str], gift_code: str) -> list[RedeemResult]:
        results: list[RedeemResult] = []
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=self.headless)
            try:
                for kingshot_id in kingshot_ids:
                    result = await self._redeem_one(browser, kingshot_id, gift_code)
                    results.append(result)
                    await asyncio.sleep(self.delay_seconds)
            finally:
                await browser.close()
        return results

    async def _redeem_one(self, browser, kingshot_id: str, gift_code: str) -> RedeemResult:
        page = await browser.new_page()
        page.set_default_timeout(self.timeout_ms)
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
                    "text=/^\\s*로그인\\s*$/",
                ],
            )
            await login_button.click()

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
                    "text=/^\\s*확인\\s*$/",
                ],
            )
            await confirm_button.click()

            message = await self._read_feedback(page)
            ok = not any(
                word in message.lower()
                for word in ["invalid", "error", "failed", "already", "expired", "wrong"]
            )
            return RedeemResult(kingshot_id=kingshot_id, ok=ok, message=message)
        except PlaywrightTimeoutError:
            return RedeemResult(kingshot_id=kingshot_id, ok=False, message="Timed out while using the gift-code page.")
        except Exception as exc:
            return RedeemResult(kingshot_id=kingshot_id, ok=False, message=str(exc))
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

    async def _read_feedback(self, page) -> str:
        await page.wait_for_timeout(1800)
        candidates = [
            "[role='dialog']",
            ".modal",
            ".toast",
            ".notice",
            ".message",
            "body",
        ]
        for selector in candidates:
            try:
                text = (await page.locator(selector).first.inner_text(timeout=1500)).strip()
                if text:
                    return " ".join(text.split())[:500]
            except Exception:
                continue
        return "Submitted, but no response text was detected."

