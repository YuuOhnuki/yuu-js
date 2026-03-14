/**
 * lib/handlers/ticketHandler.ts
 *
 * チケットボタンの永続インタラクション処理。
 * interactionCreate イベントから呼び出す。
 *
 * customId 体系:
 *   tkt_open:{panelId}   - チケット作成ボタン
 *   tkt_close            - チケットクローズボタン
 *   tkt_close_confirm    - クローズ確認ボタン
 *   tkt_close_cancel     - クローズキャンセルボタン
 */

import {
    ButtonInteraction,
    ChannelType,
    EmbedBuilder,
    Colors,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    PermissionFlagsBits,
    MessageFlags,
    type TextChannel,
    type Guild,
} from 'discord.js'
import {
    getTicketPanelById,
    checkTicketCooldown,
    updateTicketCooldown,
    getGuildSettings,
    type TicketPanelRow,
} from '../db'

// ─── パネルメッセージ構築（ticket.ts からも呼ばれる） ─────────────────────────

export function buildTicketPanelMessage(panel: TicketPanelRow): {
    embeds: EmbedBuilder[]
    components: ActionRowBuilder<ButtonBuilder>[]
} {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(panel.panel_title)
        .setDescription(panel.panel_description)
        .setTimestamp()
        .setFooter({ text: `クールダウン: ${panel.cooldown_seconds}秒` })

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`tkt_open:${panel.id}`)
            .setLabel(panel.button_label)
            .setStyle(ButtonStyle.Primary)
    )

    return { embeds: [embed], components: [row] }
}

// ─── メインハンドラー ─────────────────────────────────────────────────────────

export async function handleTicketInteraction(
    i: ButtonInteraction
): Promise<void> {
    const { customId, guild, user } = i
    if (!guild) return

    // ── チケット作成 ──────────────────────────────────────────────────────────
    if (customId.startsWith('tkt_open:')) {
        const panelId = Number(customId.split(':')[1])
        const panel = await getTicketPanelById(panelId)
        if (!panel) {
            await i.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription('❌ パネルが見つかりません。'),
                ],
                ephemeral: true,
            })
            return
        }

        // クールダウンチェック
        const cooldownResult = await checkTicketCooldown(
            user.id,
            guild.id,
            panel.cooldown_seconds
        )
        if (!cooldownResult.allowed) {
            const remainingSec = Math.ceil(
                (cooldownResult.remainingMs ?? 0) / 1000
            )
            const mins = Math.floor(remainingSec / 60)
            const secs = remainingSec % 60
            const label = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`

            await i.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Orange)
                        .setTitle('⏱ クールダウン中')
                        .setDescription(
                            `チケットを作成できるまで **${label}** お待ちください。`
                        ),
                ],
                flags: [MessageFlags.Ephemeral],
            })
            return
        }

        // 既存チケット確認
        const existingChannel = guild.channels.cache.find(
            (ch) =>
                ch.name === `ticket-${user.id}` &&
                ch.type === ChannelType.GuildText
        )
        if (existingChannel) {
            await i.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Orange)
                        .setDescription(
                            `既にチケットがあります: <#${existingChannel.id}>`
                        ),
                ],
                flags: [MessageFlags.Ephemeral],
            })
            return
        }

        await i.deferReply({ flags: [MessageFlags.Ephemeral] })

        try {
            const settings = await getGuildSettings(guild.id)

            // チャンネル作成
            const ticketChannel = await guild.channels.create({
                name: `ticket-${user.id}`,
                type: ChannelType.GuildText,
                parent: panel.ticket_category_id ?? undefined,
                topic: `${user.tag} のサポートチケット | Panel: ${panel.id}`,
                permissionOverwrites: buildTicketPermissions(
                    guild,
                    user.id,
                    settings.support_role_id
                ),
            })

            // クールダウン更新
            await updateTicketCooldown(user.id, guild.id)

            // チケット内メッセージ
            const closeRow =
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId('tkt_close')
                        .setLabel('🔒 チケットを閉じる')
                        .setStyle(ButtonStyle.Danger)
                )

            const ticketEmbed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🎫 チケット')
                .setDescription(
                    `<@${user.id}> さん、お問い合わせありがとうございます。\nスタッフがまもなく対応します。`
                )
                .addFields({
                    name: '作成日時',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: false,
                })
                .setTimestamp()

            await ticketChannel.send({
                embeds: [ticketEmbed],
                components: [closeRow],
            })

            // サポートロールへ通知
            if (settings.support_role_id) {
                await ticketChannel.send(
                    `<@&${settings.support_role_id}> 新しいチケットが作成されました。`
                )
            }

            await i.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setDescription(
                            `✅ チケットを作成しました: <#${ticketChannel.id}>`
                        ),
                ],
            })
        } catch (err) {
            console.error('[ticketHandler] create error:', err)
            await i.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription('❌ チケットの作成に失敗しました。'),
                ],
            })
        }
        return
    }

    // ── クローズボタン ────────────────────────────────────────────────────────
    if (customId === 'tkt_close') {
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('tkt_close_confirm')
                .setLabel('✅ はい、閉じる')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('tkt_close_cancel')
                .setLabel('キャンセル')
                .setStyle(ButtonStyle.Secondary)
        )

        await i.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle('🔒 チケットを閉じますか？')
                    .setDescription('このチャンネルは5秒後に削除されます。'),
            ],
            components: [confirmRow],
            flags: [MessageFlags.Ephemeral],
        })
        return
    }

    // ── クローズ確認 ──────────────────────────────────────────────────────────
    if (customId === 'tkt_close_confirm') {
        await i.update({
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('🔒 5秒後にチャンネルを削除します...'),
            ],
            components: [],
        })
        setTimeout(async () => {
            await (i.channel as TextChannel).delete().catch(() => null)
        }, 5000)
        return
    }

    // ── キャンセル ────────────────────────────────────────────────────────────
    if (customId === 'tkt_close_cancel') {
        await i.update({
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Green)
                    .setDescription('キャンセルしました。'),
            ],
            components: [],
        })
        return
    }
}

// ─── 権限ヘルパー ─────────────────────────────────────────────────────────────

function buildTicketPermissions(
    guild: Guild,
    userId: string,
    supportRoleId: string | null
) {
    const overwrites = [
        {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: userId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
            ],
        },
    ]

    if (supportRoleId) {
        overwrites.push({
            id: supportRoleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
            ],
        } as (typeof overwrites)[0])
    }

    return overwrites
}
