import asyncio
import csv
import io
import logging
import re

import discord
from discord import app_commands

from config import Settings, load_settings
from giftcode_parser import extract_gift_codes_from_message
from kingshot_redeemer import KingShotRedeemer, RedeemResult
from storage import KingShotStore


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

ID_PATTERN = re.compile(r"\b\d{5,20}\b")


def parse_ids(raw: str) -> list[str]:
    seen: set[str] = set()
    ids: list[str] = []
    for match in ID_PATTERN.finditer(raw):
        kingshot_id = match.group(0)
        if kingshot_id not in seen:
            seen.add(kingshot_id)
            ids.append(kingshot_id)
    return ids


def short_result_report(results: list[RedeemResult]) -> str:
    success_count = sum(1 for result in results if result.ok)
    fail_count = len(results) - success_count
    failed = [result for result in results if not result.ok]

    lines = [f"Done: {success_count} succeeded, {fail_count} failed."]
    for result in failed[:10]:
        lines.append(f"- `{result.kingshot_id}` ({result.account_info}): {result.message[:160]}")
    if len(failed) > 10:
        lines.append(f"- {len(failed) - 10} more failures.")
    return "\n".join(lines)


def split_discord_message(text: str, limit: int = 1900) -> list[str]:
    if len(text) <= limit:
        return [text]

    chunks: list[str] = []
    current: list[str] = []
    current_length = 0

    for line in text.splitlines():
        line_length = len(line) + 1
        if line_length > limit:
            if current:
                chunks.append("\n".join(current))
                current = []
                current_length = 0
            for start in range(0, len(line), limit):
                chunks.append(line[start : start + limit])
            continue

        if current and current_length + line_length > limit:
            chunks.append("\n".join(current))
            current = []
            current_length = 0

        current.append(line)
        current_length += line_length

    if current:
        chunks.append("\n".join(current))
    return chunks


async def send_chunked_message(target, text: str, **kwargs) -> None:
    chunks = split_discord_message(text)
    for index, chunk in enumerate(chunks):
        await target.send(chunk, **kwargs if index == 0 else {})


def make_result_csv(results: list[RedeemResult], gift_code: str) -> discord.File:
    text_buffer = io.StringIO()
    writer = csv.writer(text_buffer)
    writer.writerow(["gift_code", "kingshot_id", "status", "account_info", "reason"])

    for result in results:
        writer.writerow(
            [
                gift_code,
                result.kingshot_id,
                result.status,
                result.account_info,
                result.message,
            ]
        )

    bytes_buffer = io.BytesIO(text_buffer.get
