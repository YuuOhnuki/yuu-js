import { Events, MessageFlags, EmbedBuilder } from 'discord.js'
import type { ExtendedClient } from '../index.ts'
import { handleTicketInteraction } from '../lib/handlers/ticketHandler'
import { handleRolePanelInteraction } from '../lib/handlers/rolePanelHandler'

export default {
    name: Events.InteractionCreate,
    async execute(
        interaction: import('discord.js').Interaction,
        client: ExtendedClient
    ) {
        // ── スラッシュコマンド ────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.slashCommands.get(interaction.commandName)
            if (!command) return

            try {
                await command.execute(interaction)
            } catch (err) {
                console.error(err)
                const payload = {
                    content: 'エラーが発生しました。',
                }
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(payload)
                } else {
                    await interaction.reply(payload)
                }
            }
            return
        }

        // ── /help のセレクトメニュー ──────────────────────────────────────────
        if (
            interaction.isStringSelectMenu() &&
            interaction.customId === 'help_select'
        ) {
            const client = interaction.client as ExtendedClient
            const value = interaction.values[0]!
            const command = client.slashCommands.get(value)

            const helpEmbed = new EmbedBuilder().setColor('#89c3eb')

            if (command?.data) {
                const json = command.data.toJSON() as {
                    name: string
                    description?: string
                    options?: Array<{
                        name: string
                        description: string
                        required?: boolean
                    }>
                }
                helpEmbed.setTitle(`コマンド \`/${json.name}\``)
                let desc = json.description ?? ''
                const options = json.options
                if (options?.length) {
                    desc += '\n\n**パラメーター:**\n'
                    desc += options
                        .map(
                            (opt) =>
                                `• \`${opt.name}\`${opt.required ? ' *(必須)*' : ''} — ${opt.description}`
                        )
                        .join('\n')
                }
                helpEmbed.setDescription(desc)
            } else {
                helpEmbed.setTitle('コマンドが見つかりません')
                helpEmbed.setDescription(
                    `スラッシュコマンド \`${value}\` は見つかりませんでした。`
                )
            }

            await interaction.update({
                embeds: [helpEmbed],
            })
            return
        }

        // ── 永続ボタン ────────────────────────────────────────────────────────
        if (interaction.isButton()) {
            const id = interaction.customId

            // チケット系: tkt_open:{panelId} / tkt_close / tkt_close_confirm / tkt_close_cancel
            if (id.startsWith('tkt_')) {
                await handleTicketInteraction(interaction).catch(console.error)
                return
            }

            // ロールパネル(ボタン形式): rp_btn:{panelId}:{roleId}
            if (id.startsWith('rp_btn:')) {
                await handleRolePanelInteraction(interaction).catch(
                    console.error
                )
                return
            }
        }

        // ── 永続セレクトメニュー ──────────────────────────────────────────────
        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId

            // ロールパネル(セレクト形式): rp_sel:{panelId}
            if (id.startsWith('rp_sel:')) {
                await handleRolePanelInteraction(interaction).catch(
                    console.error
                )
                return
            }
        }
    },
}
