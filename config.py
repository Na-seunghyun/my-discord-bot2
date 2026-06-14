import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_int(name: str, default: int | None = None) -> int | None:
    value = os.getenv(name)
    if not value:
        return default
    return int(value.strip())


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if not value:
        return default
    return float(value.strip())


def _get_int_set(name: str) -> set[int]:
    value = os.getenv(name, "")
    items = [item.strip() for item in value.split(",") if item.strip()]
    return {int(item) for item in items}


@dataclass(frozen=True)
class Settings:
    discord_token: str
    watch_channel_id: int
    admin_role_ids: set[int]
    id_manager_role_ids: set[int]
    discord_guild_id: int | None
    database_path: Path
    redeem_headless: bool
    redeem_delay_seconds: float
    redeem_timeout_seconds: float


def load_settings() -> Settings:
    token = os.getenv("DISCORD_TOKEN", "").strip()
    if not token:
        raise RuntimeError("DISCORD_TOKEN is missing. Add it to your .env file.")

    return Settings(
        discord_token=token,
        watch_channel_id=_get_int("WATCH_CHANNEL_ID", 1422359547393347685),
        admin_role_ids=_get_int_set("ADMIN_ROLE_IDS"),
        id_manager_role_ids=_get_int_set("ID_MANAGER_ROLE_IDS"),
        discord_guild_id=_get_int("DISCORD_GUILD_ID"),
        database_path=Path(os.getenv("DATABASE_PATH", "data/kingshot.sqlite3")),
        redeem_headless=_get_bool("REDEEM_HEADLESS", True),
        redeem_delay_seconds=_get_float("REDEEM_DELAY_SECONDS", 2.5),
        redeem_timeout_seconds=_get_float("REDEEM_TIMEOUT_SECONDS", 45.0),
    )
