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


def short_result_report(results: list[RedeemResult]) -> str:
    success_count = sum(1 for result in results if result.ok)
    fail_count = len(results) - success_count
    failed = [result for result in results if not result.ok]

    lines = [f"Done: {success_count} succeeded, {fail_count} failed."]
    for result in failed[:10]:
        lines.append(f"- `{result.kingshot_id}`: {result.message[:160]}")
    if len(failed) > 10:
        lines.append(f"- {len(failed) - 10} more failures.")
    return "\n".join(lines)


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
        self.redeemer = KingShotRedeemer(
            headless=settings.redeem_headless,
            delay_seconds=settings.redeem_delay_seconds,
            timeout_seconds=settings.redeem_timeout_seconds,
        )
        self.redeem_lock = asyncio.Lock()

    async def setup_hook(self) -> None:
        register_commands(self)
        if self.settings.discord_guild_id:
            guild = discord.Object(id=self.settings.discord_guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
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
            await message.channel.send(f"Detected gift code `{code}`. Starting auto redeem.")
            asyncio.create_task(self.redeem_code_to_channel(message.channel, code))

    async def redeem_code_to_channel(self, channel: discord.abc.Messageable, gift_code: str) -> None:
        async with self.redeem_lock:
            ids = self.store.list_ids()
            if not ids:
                await channel.send("No KingShot IDs are registered. Skipping redeem.")
                return

            await channel.send(f"Redeeming `{gift_code}` for {len(ids)} registered IDs.")
            results = await self.redeemer.redeem_many(ids, gift_code)
            await channel.send(short_result_report(results))


def can_manage(interaction: discord.Interaction) -> bool:
    settings = interaction.client.settings
    if not interaction.guild or not isinstance(interaction.user, discord.Member):
        return False
    if settings.admin_role_ids:
        return any(role.id in settings.admin_role_ids for role in interaction.user.roles)
    return interaction.user.guild_permissions.administrator


def require_manager():
    async def predicate(interaction: discord.Interaction) -> bool:
        if can_manage(interaction):
            return True
        raise app_commands.CheckFailure("You need manager permission to use this command.")

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
    @require_manager()
    async def add_id(interaction: discord.Interaction, kingshot_id: str):
        ids = parse_ids(kingshot_id)
        if len(ids) != 1:
            await interaction.response.send_message("Please enter exactly one numeric KingShot ID.", ephemeral=True)
            return
        inserted = bot.store.add_id(ids[0])
        status = "registered." if inserted else "is already registered."
        await interaction.response.send_message(f"`{ids[0]}` {status}", ephemeral=True)

    @bot.tree.command(name="bulk-add", description="Register multiple KingShot player IDs.")
    @require_manager()
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
    @require_manager()
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
        ids = bot.store.list_ids()
        if not ids:
            await interaction.response.send_message("No IDs are registered.", ephemeral=True)
            return
        preview = "\n".join(f"`{item}`" for item in ids[:80])
        suffix = f"\n...and {len(ids) - 80} more." if len(ids) > 80 else ""
        await interaction.response.send_message(f"Registered IDs: {len(ids)}\n{preview}{suffix}", ephemeral=True)

    @bot.tree.command(name="redeem", description="Redeem a gift code for all registered KingShot IDs.")
    @require_manager()
    async def redeem(interaction: discord.Interaction, gift_code: str):
        gift_code = gift_code.strip().upper()
        ids = bot.store.list_ids()
        if not ids:
            await interaction.response.send_message("No IDs are registered.", ephemeral=True)
            return

        await interaction.response.send_message(
            f"Started redeeming `{gift_code}` for {len(ids)} IDs.",
            ephemeral=True,
        )
        async with bot.redeem_lock:
            results = await bot.redeemer.redeem_many(ids, gift_code)
        await interaction.followup.send(short_result_report(results), ephemeral=True)


def main() -> None:
    settings = load_settings()
    bot = KingShotBot(settings)
    bot.run(settings.discord_token)


if __name__ == "__main__":
    main()

