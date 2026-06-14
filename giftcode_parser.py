import re


GIFT_CODE_PATTERNS = [
    re.compile(r"gift\s*code\s*[:：]\s*`?([A-Z0-9_-]{3,64})`?", re.IGNORECASE),
    re.compile(r"🎁\s*gift\s*code\s*[:：]\s*`?([A-Z0-9_-]{3,64})`?", re.IGNORECASE),
]


def extract_gift_codes(text: str) -> list[str]:
    if not text:
        return []

    codes: list[str] = []
    seen: set[str] = set()
    for pattern in GIFT_CODE_PATTERNS:
        for match in pattern.finditer(text):
            code = match.group(1).strip().upper()
            if code not in seen:
                seen.add(code)
                codes.append(code)
    return codes


def extract_gift_codes_from_message(message) -> list[str]:
    chunks = [message.content or ""]

    for embed in message.embeds:
        chunks.extend(
            [
                embed.title or "",
                embed.description or "",
                embed.footer.text if embed.footer else "",
                embed.author.name if embed.author else "",
            ]
        )
        for field in embed.fields:
            chunks.append(field.name or "")
            chunks.append(field.value or "")

    return extract_gift_codes("\n".join(chunks))

