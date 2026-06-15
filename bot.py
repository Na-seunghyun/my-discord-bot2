import asyncio
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


def short_result_report(results: list[RedeemResult], gift_code: str) -> str:
    success_count = sum(1 for result in results if result.ok)
    claimed_after_retry_count = sum(1 for result in results if result.status == "CLAIMED_AFTER_RETRY")
    fail_count = len(results) - success_count - claimed_after_retry_count

    lines = [
        f"Redeem result for `{gift_code}`",
        f"Total: {len(results)} / Success: {success_count} / Claimed after retry: {claimed_after_retry_count} / Failed: {fail_count}",
        "",
    ]

    for index, result in enumerate(results, start=1):
        account = result.account_info or "Account info not detected."
        lines.append(
            f"{index}. `{result.kingshot_id}` | {result.status} | {account} | {result.message}"
        )

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


async def send_chunked_message(target, text: str) -> None:
    chunks = split_discord_message(text)
    for chunk in chunks:
        await target.send(chunk)


class KingShotBot(discord.Client):
    def __init__(self, settings: Settings):
        intents = discord.Intents.default()
        intents.message_content = True
        intents.guilds = True
        intents.members = True
        super().__init__(intents=intents)

        self.settings = settings
        self.tree = app_commands.CommandTree(self)
        self.store = KingShotStore(settings.database_path)
        self.manual_redeemer = KingShotRedeemer(
            headless=settings.redeem_headless,
            delay_seconds=settings.redeem_delay_seconds,
            timeout_seconds=settings.redeem_timeout_seconds,
            max_concurrency=settings.redeem_max_concurrency,
            element_timeout_seconds=settings.redeem_element_timeout_seconds,
        )
        self.auto_redeemer = KingShotRedeemer(
            headless=settings.redeem_headless,
            delay_seconds=settings.auto_redeem_delay_seconds,
            timeout_seconds=settings.auto_redeem_timeout_seconds,
            max_concurrency=settings.auto_redeem_max_concurrency,
            element_timeout_seconds=settings.auto_redeem_element_timeout_seconds,
        )
        self.redeem_lock = asyncio.Lock()

    async def setup_hook(self) -> None:
        register_commands(self)

        if self.settings.discord_guild_id:
            guild = discord.Object(id=self.settings.discord_guild_id)
            self.tree.copy_global_to(guild=guild)
            self.tree.clear_commands(guild=None)
            await self.tree.sync(guild=guild)
            await self.tree.sync()
            logging.info("Synced commands to guild %s", self.settings.discord_guild_id)
        else:
            await self.tree.sync()
            logging.info("Synced global commands")

    async def on_ready(self) -> None:
        logging.info("Logged in as %s", self.user)

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot and message.webhook_id is None:
            return

        if message.channel.id != self.settings.watch_channel_id:
            return

        codes = extract_gift_codes_from_message(message)

        for code in codes:
            if not self.store.mark_code_seen(code):
                logging.info("Gift code %s was already handled; skipping", code)
                continue

            result_channel = self.get_result_channel() or message.channel
            wait_seconds = self.settings.auto_redeem_start_delay_seconds
            await result_channel.send(
                f"Detected gift code `{code}`. Waiting {wait_seconds:g} seconds before auto redeem."
            )
            asyncio.create_task(self.auto_redeem_after_delay(result_channel, code, wait_seconds))

    def get_result_channel(self) -> discord.abc.Messageable | None:
        channel = self.get_channel(self.settings.result_channel_id)
        if channel:
            return channel
        return None

    async def auto_redeem_after_delay(
        self,
        channel: discord.abc.Messageable,
        gift_code: str,
        wait_seconds: float,
    ) -> None:
        await asyncio.sleep(wait_seconds)
        await self.redeem_code_to_channel(channel, gift_code, self.auto_redeemer, source="auto")

    async def redeem_code_to_channel(
        self,
        channel: discord.abc.Messageable,
        gift_code: str,
        redeemer: KingShotRedeemer,
        source: str,
    ) -> None:
        async with self.redeem_lock:
            ids = self.store.list_ids()

            if not ids:
                await channel.send("No KingShot IDs are registered. Skipping redeem.")
                return

            await channel.send(f"Redeeming `{gift_code}` for {len(ids)} registered IDs. Source: {source}.")

            last_progress_message = 0

            async def progress(index: int, total: int, result: RedeemResult) -> None:
                nonlocal last_progress_message

                if index == total or index - last_progress_message >= 10:
                    last_progress_message = index
                    await channel.send(f"Progress: {index}/{total} processed.")

            results = await redeemer.redeem_many(ids, gift_code, progress)
            self.store_account_info(results)

            await send_chunked_message(
                channel,
                short_result_report(results, gift_code),
            )

    def store_account_info(self, results: list[RedeemResult]) -> None:
        for result in results:
            self.store.update_account_info(result.kingshot_id, result.account_info)


def can_manage(interaction: discord.Interaction) -> bool:
    settings = interaction.client.settings

    if not interaction.guild or not isinstance(interaction.user, discord.Member):
        return False

    if settings.admin_role_ids:
        return any(role.id in settings.admin_role_ids for role in interaction.user.roles)

    return interaction.user.guild_permissions.administrator


def can_manage_ids(interaction: discord.Interaction) -> bool:
    settings = interaction.client.settings

    if not interaction.guild or not isinstance(interaction.user, discord.Member):
        return False

    if settings.id_manager_role_ids:
        return any(role.id in settings.id_manager_role_ids for role in interaction.user.roles)

    return can_manage(interaction)


def require_manager():
    async def predicate(interaction: discord.Interaction) -> bool:
        if can_manage(interaction):
            return True

        raise app_commands.CheckFailure("You need manager permission to use this command.")

    return app_commands.check(predicate)


def require_id_manager():
    async def predicate(interaction: discord.Interaction) -> bool:
        if can_manage_ids(interaction):
            return True

        raise app_commands.CheckFailure("You need an ID manager role to use this command.")

    return app_commands.check(predicate)


def register_commands(bot: KingShotBot) -> None:
    @bot.tree.error
    async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError):
        message = "Command failed."

        if isinstance(error, app_commands.CheckFailure):
            message = str(error)
        elif error.__cause__:
            message = str(error.__cause__)

        if interaction.response.is_done():
            await interaction.followup.send(message, ephemeral=True)
        else:
            await interaction.response.send_message(message, ephemeral=True)

    @bot.tree.command(name="add-id", description="Register one KingShot player ID.")
    @require_id_manager()
    async def add_id(interaction: discord.Interaction, kingshot_id: str):
        ids = parse_ids(kingshot_id)

        if len(ids) != 1:
            await interaction.response.send_message("Please enter exactly one numeric KingShot ID.", ephemeral=True)
            return

        inserted = bot.store.add_id(ids[0])
        status = "registered." if inserted else "is already registered."
        await interaction.response.send_message(f"`{ids[0]}` {status}", ephemeral=True)

    @bot.tree.command(name="bulk-add", description="Register multiple KingShot player IDs.")
    @require_id_manager()
    async def bulk_add(interaction: discord.Interaction, ids: str):
        parsed_ids = parse_ids(ids)

        if not parsed_ids:
            await interaction.response.send_message("No numeric KingShot IDs were found.", ephemeral=True)
            return

        inserted, duplicates = bot.store.add_ids(parsed_ids)
        await interaction.response.send_message(
            f"Bulk add complete: {inserted} new, {duplicates} duplicate.",
            ephemeral=True,
        )

    @bot.tree.command(name="delete-id", description="Delete one registered KingShot player ID.")
    @require_id_manager()
    async def delete_id(interaction: discord.Interaction, kingshot_id: str):
        ids = parse_ids(kingshot_id)

        if len(ids) != 1:
            await interaction.response.send_message("Please enter exactly one numeric KingShot ID.", ephemeral=True)
            return

        deleted = bot.store.delete_id(ids[0])
        status = "deleted." if deleted else "was not registered."
        await interaction.response.send_message(f"`{ids[0]}` {status}", ephemeral=True)

    @bot.tree.command(name="list-ids", description="Show registered KingShot player IDs.")
    @require_manager()
    async def list_ids(interaction: discord.Interaction):
        players = bot.store.list_players()

        if not players:
            await interaction.response.send_message("No IDs are registered.", ephemeral=True)
            return

        result_channel = bot.get_result_channel()

        if result_channel is None:
            await interaction.response.send_message(
                "Result channel was not found. Check RESULT_CHANNEL_ID.",
                ephemeral=True,
            )
            return

        lines = [f"Registered IDs: {len(players)}", ""]

        for index, player in enumerate(players, start=1):
            account = player.account_info or "Unknown account info until first redeem/login."
            lines.append(f"{index}. `{player.kingshot_id}` | {account}")

        await interaction.response.send_message(
            f"Registered ID list will be posted in <#{bot.settings.result_channel_id}>.",
            ephemeral=True,
        )

        await send_chunked_message(
            result_channel,
            "\n".join(lines),
        )

    @bot.tree.command(name="redeem", description="Redeem a gift code for all registered KingShot IDs.")
    @require_manager()
    async def redeem(interaction: discord.Interaction, gift_code: str):
        gift_code = gift_code.strip()
        ids = bot.store.list_ids()

        if not ids:
            await interaction.response.send_message("No IDs are registered.", ephemeral=True)
            return

        result_channel = bot.get_result_channel()

        if result_channel is None:
            await interaction.response.send_message(
                "Result channel was not found. Check RESULT_CHANNEL_ID.",
                ephemeral=True,
            )
            return

        await interaction.response.send_message(
            f"Started redeeming `{gift_code}` for {len(ids)} IDs. Results will be posted in <#{bot.settings.result_channel_id}>.",
            ephemeral=True,
        )

        await result_channel.send(
            f"{interaction.user.mention} started redeeming `{gift_code}` for {len(ids)} registered IDs."
        )

        async with bot.redeem_lock:
            ids = bot.store.list_ids()

        await bot.redeem_code_to_channel(result_channel, gift_code, bot.manual_redeemer, source="manual")

        await interaction.followup.send(
            f"Redeem finished. Public results were posted in <#{bot.settings.result_channel_id}>.",
            ephemeral=True,
        )


def main() -> None:
    settings = load_settings()
    bot = KingShotBot(settings)
    bot.run(settings.discord_token)


if __name__ == "__main__":
    main()
