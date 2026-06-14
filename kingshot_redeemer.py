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

            await page.wait_for_timeout(700)
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
        data = await page.evaluate(
            """
            () => {
                const imgSources = [];
                for (const img of document.querySelectorAll("img")) {
                    if (img.src) imgSources.push(img.src);
                    if (img.currentSrc) imgSources.push(img.currentSrc);
                    if (img.getAttribute("src")) imgSources.push(img.getAttribute("src"));
                }

                return {
                    text: document.body.innerText || "",
                    imgSources
                };
            }
            """
        )

        body_text = data.get("text", "")
        img_sources = data.get("imgSources", [])
        return self._clean_account_info(body_text, img_sources)

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

    def _clean_account_info(self, body_text: str, img_sources: list[str]) -> str:
        cleaned = " ".join((body_text or "").split())
        sources = " ".join(img_sources or [])

        state = "State Unknown"
        state_match = re.search(r"State\s*:?\s*(\d+)", cleaned, re.IGNORECASE)
        if state_match:
            state = f"State {state_match.group(1)}"

        town_center = "TC Unknown"

        tg_match = re.search(r"stove_lv_(10|[1-9])\.png", sources, re.IGNORECASE)
        if tg_match:
            town_center = f"TG{tg_match.group(1)}"
        else:
            tc_match = re.search(
                r"Town\s*Center\s*Level\s*:?\s*(\d{1,2})",
                cleaned,
                re.IGNORECASE,
            )
            if tc_match:
                level = int(tc_match.group(1))
                if 1 <= level <= 30:
                    town_center = f"TC {level}"

        name = "Unknown Player"

        name_match = re.search(
            r"Gift\s*Code\s*Center\s+(.+?)\s+Town\s*Center\s*Level",
            cleaned,
            re.IGNORECASE,
        )
        if name_match:
            name = name_match.group(1).strip()
        else:
            fallback = re.sub(r"^.*?Gift\s*Code\s*Center\s+", "", cleaned, flags=re.IGNORECASE)
            fallback = re.sub(r"\s+Town\s*Center\s*Level.*$", "", fallback, flags=re.IGNORECASE)
            if fallback and not fallback.startswith("*"):
                name = fallback.strip()

        name = self._clean_player_name(name)

        pieces = [name, town_center, state]
        if "retreat" in cleaned.lower():
            pieces.append("Retreat")

        return " | ".join(pieces)

    def _clean_player_name(self, name: str) -> str:
        name = " ".join((name or "").split())
        name = re.sub(r"^(English|Korean|Japanese|Chinese|Deutsch|French|Spanish)\s+", "", name, flags=re.IGNORECASE)
        name = name.replace("Gift Code Center", "").strip()

        if not name or name.startswith("*"):
            return "Unknown Player"

        return name[:60]

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
