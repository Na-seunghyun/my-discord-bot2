import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PlayerRecord:
    kingshot_id: str
    account_info: str


class KingShotStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.database_path)

    def _init_db(self) -> None:
        with self._connect() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS player_ids (
                    kingshot_id TEXT PRIMARY KEY,
                    account_info TEXT NOT NULL DEFAULT '',
                    updated_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            self._ensure_column(db, "player_ids", "account_info", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(db, "player_ids", "updated_at", "TEXT")
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS redeemed_codes (
                    gift_code TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def _ensure_column(self, db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        rows = db.execute(f"PRAGMA table_info({table})").fetchall()
        existing_columns = {row[1] for row in rows}
        if column not in existing_columns:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def add_id(self, kingshot_id: str) -> bool:
        kingshot_id = kingshot_id.strip()
        with self._connect() as db:
            cursor = db.execute(
                "INSERT OR IGNORE INTO player_ids (kingshot_id) VALUES (?)",
                (kingshot_id,),
            )
            return cursor.rowcount > 0

    def add_ids(self, kingshot_ids: list[str]) -> tuple[int, int]:
        inserted = 0
        duplicates = 0
        with self._connect() as db:
            for kingshot_id in kingshot_ids:
                cursor = db.execute(
                    "INSERT OR IGNORE INTO player_ids (kingshot_id) VALUES (?)",
                    (kingshot_id.strip(),),
                )
                if cursor.rowcount:
                    inserted += 1
                else:
                    duplicates += 1
        return inserted, duplicates

    def delete_id(self, kingshot_id: str) -> bool:
        with self._connect() as db:
            cursor = db.execute(
                "DELETE FROM player_ids WHERE kingshot_id = ?",
                (kingshot_id.strip(),),
            )
            return cursor.rowcount > 0

    def list_ids(self) -> list[str]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT kingshot_id FROM player_ids ORDER BY created_at, kingshot_id"
            ).fetchall()
        return [row[0] for row in rows]

    def list_players(self) -> list[PlayerRecord]:
        with self._connect() as db:
            rows = db.execute(
                """
                SELECT kingshot_id, account_info
                FROM player_ids
                ORDER BY created_at, kingshot_id
                """
            ).fetchall()
        return [PlayerRecord(kingshot_id=row[0], account_info=row[1] or "") for row in rows]

    def update_account_info(self, kingshot_id: str, account_info: str) -> None:
        account_info = account_info.strip()
        if not account_info or account_info == "Account info not detected.":
            return
        with self._connect() as db:
            db.execute(
                """
                UPDATE player_ids
                SET account_info = ?, updated_at = CURRENT_TIMESTAMP
                WHERE kingshot_id = ?
                """,
                (account_info, kingshot_id.strip()),
            )

    def mark_code_seen(self, gift_code: str) -> bool:
        with self._connect() as db:
            cursor = db.execute(
                "INSERT OR IGNORE INTO redeemed_codes (gift_code) VALUES (?)",
                (gift_code.strip().upper(),),
            )
            return cursor.rowcount > 0
