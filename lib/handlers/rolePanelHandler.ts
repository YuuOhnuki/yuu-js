/**
 * lib/handlers/rolePanelHandler.ts
 *
 * ロールパネルの永続インタラクション処理。
 * interactionCreate イベントから呼び出す。
 *
 * customId 体系:
 *   rp_btn:{panelId}:{roleId}  - ボタン形式のロールトグル
 *   rp_sel:{panelId}           - セレクトメニュー形式のロール付与
 */

import {
    ButtonInteraction,
    StringSelectMenuInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    type GuildMember,
} from 'discord.js'
import {
    getRolePanelById,
    getRolePanelItems,
    type RolePanelRow,
    type RolePanelItemRow,
} from '../db'
import { getErrorMessage } from './errorHandler.ts'

// ─── パネルメッセージ構築（rolepanel.ts からも呼ばれる） ──────────────────────

export function buildRolePanelMessage(
    panel: RolePanelRow,
    items: RolePanelItemRow[]
): {
    embeds: EmbedBuilder[]
    components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]
} {
    const roleLines =
        items.length > 0
            ? items
                  .map((item) => `• <@&${item.role_id}> — ${item.label}`)
                  .join('\n')
            : '_ロールがまだ設定されていません。_'

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('ロールパネル')
        .setDescription(`**${panel.panel_title}**\n\n${roleLines}`)

    const components: ActionRowBuilder<
        ButtonBuilder | StringSelectMenuBuilder
    >[] = []

    if (panel.panel_type === 'button') {
        // ボタン形式: 5個ずつActionRow
        for (let i = 0; i < items.length; i += 5) {
            const slice = items.slice(i, i + 5)
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                slice.map((item) => {
                    const btn = new ButtonBuilder()
                        .setCustomId(`rp_btn:${panel.id}:${item.role_id}`)
                        .setLabel(item.label)
                        .setStyle(ButtonStyle.Secondary)
                    if (item.emoji) btn.setEmoji(item.emoji)
                    return btn
                })
            )
            components.push(row)
        }
    } else if (items.length > 0) {
        // セレクトメニュー形式: 最大25ロール
        const options = items.slice(0, 25).map((item) => {
            const opt = new StringSelectMenuOptionBuilder()
                .setValue(item.role_id)
                .setLabel(item.label)
            if (item.emoji) opt.setEmoji(item.emoji)
            return opt
        })

        const selectRow =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`rp_sel:${panel.id}`)
                    .setPlaceholder('ロールを選択してください')
                    .setMinValues(0)
                    .setMaxValues(Math.min(items.length, 25))
                    .addOptions(options)
            )
        components.push(selectRow)
    }

    return { embeds: [embed], components }
}

// ─── メインハンドラー ─────────────────────────────────────────────────────────

export async function handleRolePanelInteraction(
    i: ButtonInteraction | StringSelectMenuInteraction
): Promise<void> {
    const { guild, member } = i
    if (!guild || !member) return

    const guildMember = member as GuildMember

    // ── ボタン形式: ロールトグル ──────────────────────────────────────────────
    if (i.isButton() && i.customId.startsWith('rp_btn:')) {
        const parts = i.customId.split(':')
        // rp_btn:{panelId}:{roleId}
        const panelId = Number(parts[1])
        const roleId = parts[2]

        if (!panelId || !roleId) return

        const panel = await getRolePanelById(panelId).catch(() => null)
        if (!panel || panel.guild_id !== guild.id) {
            await i.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription('❌ パネルが見つかりません。'),
                ],
                flags: [MessageFlags.Ephemeral],
            })
            return
        }

        const role = guild.roles.cache.get(roleId)
        if (!role) {
            await i.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription('❌ ロールが見つかりません。'),
                ],
                flags: [MessageFlags.Ephemeral],
            })
            return
        }

        try {
            // ボットがこのロールを管理できるか確認
            if (!guild.members.me?.permissions.has('ManageRoles')) {
                await i.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Red)
                            .setDescription(
                                '❌ Botが「ロールを管理」の権限を持っていません。\nサーバー管理者に連絡してください。'
                            ),
                    ],
                    flags: [MessageFlags.Ephemeral],
                })
                return
            }

            // ボットがロールより高い位置にあるか確認
            const botHighestRole = guild.members.me?.roles.highest
            if (botHighestRole && role.position >= botHighestRole.position) {
                await i.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Red)
                            .setDescription(
                                `❌ Botのロール位置が低いため、**${role.name}** を管理できません。\nサーバー管理者がBotのロール位置を上げてください。`
                            ),
                    ],
                    flags: [MessageFlags.Ephemeral],
                })
                return
            }

            const hasRole = guildMember.roles.cache.has(roleId)
            if (hasRole) {
                await guildMember.roles.remove(role)
                await i.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Orange)
                            .setDescription(
                                `➖ **${role.name}** ロールを外しました。`
                            ),
                    ],
                    flags: [MessageFlags.Ephemeral],
                })
            } else {
                await guildMember.roles.add(role)
                await i.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Green)
                            .setDescription(
                                `✅ **${role.name}** ロールを付与しました。`
                            ),
                    ],
                    flags: [MessageFlags.Ephemeral],
                })
            }
        } catch (err) {
            console.error('[rolePanelHandler] toggle error:', err)
            await i.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(getErrorMessage(err, 'ロール管理')),
                ],
                flags: [MessageFlags.Ephemeral],
            })
        }
        return
    }

    // ── セレクトメニュー形式 ──────────────────────────────────────────────────
    if (i.isStringSelectMenu() && i.customId.startsWith('rp_sel:')) {
        const panelId = Number(i.customId.split(':')[1])
        if (!panelId) return

        const panel = await getRolePanelById(panelId).catch(() => null)
        if (!panel || panel.guild_id !== guild.id) {
            await i.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription('❌ パネルが見つかりません。'),
                ],
                flags: [MessageFlags.Ephemeral],
            })
            return
        }

        await i.deferReply({ flags: [MessageFlags.Ephemeral] })

        try {
            // ボットがロール管理権限を持っているか確認
            if (!guild.members.me?.permissions.has('ManageRoles')) {
                await i.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Red)
                            .setDescription(
                                '❌ Botが「ロールを管理」の権限を持っていません。\nサーバー管理者に連絡してください。'
                            ),
                    ],
                })
                return
            }

            const items = await getRolePanelItems(panelId)
            const panelRoleIds = new Set(items.map((it) => it.role_id))
            const selectedRoleIds = new Set(i.values)

            const added: string[] = []
            const removed: string[] = []
            const errors: string[] = []

            for (const item of items) {
                const role = guild.roles.cache.get(item.role_id)
                if (!role) continue

                // ボットがロールより高い位置にあるか確認
                const botHighestRole = guild.members.me?.roles.highest
                if (botHighestRole && role.position >= botHighestRole.position) {
                    errors.push(role.name)
                    continue
                }

                const shouldHave = selectedRoleIds.has(item.role_id)
                const hasNow = guildMember.roles.cache.has(item.role_id)

                try {
                    if (shouldHave && !hasNow) {
                        await guildMember.roles.add(role)
                        added.push(role.name)
                    } else if (
                        !shouldHave &&
                        hasNow &&
                        panelRoleIds.has(item.role_id)
                    ) {
                        // パネルで管理されているロールのみ削除
                        await guildMember.roles.remove(role)
                        removed.push(role.name)
                    }
                } catch {
                    errors.push(role.name)
                }
            }

            const lines: string[] = []
            if (added.length > 0)
                lines.push(
                    `✅ **付与:** ${added.map((n) => `\`${n}\``).join(', ')}`
                )
            if (removed.length > 0)
                lines.push(
                    `➖ **解除:** ${removed.map((n) => `\`${n}\``).join(', ')}`
                )
            if (errors.length > 0)
                lines.push(
                    `❌ **失敗:** ${errors.map((n) => `\`${n}\``).join(', ')}\n_Botの権限が不足しているか、ロール位置が低い可能性があります。_`
                )
            if (lines.length === 0) lines.push('変更なし')

            await i.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            errors.length > 0 ? Colors.Orange : Colors.Green
                        )
                        .setTitle('🎭 ロール更新')
                        .setDescription(lines.join('\n')),
                ],
            })
        } catch (err) {
            console.error('[rolePanelHandler] select error:', err)
            await i.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(getErrorMessage(err, 'ロール管理')),
                ],
            })
        }
        return
    }
}
