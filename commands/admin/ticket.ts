/**
 * commands/admin/ticket.ts
 *
 * チケットパネルをチャンネルに設置・管理するコマンド。
 *
 * /ticket setup   - チャンネルにパネルを設置（投稿）
 * /ticket edit    - パネルのタイトル・説明等を変更
 * /ticket list    - このサーバーのパネル一覧
 * /ticket delete  - パネルを削除
 */

import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    Colors,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    type TextChannel,
} from 'discord.js'
import { errorEmbed, infoEmbed } from '../../lib/embed'
import {
    upsertTicketPanel,
    getTicketPanelsByGuild,
    getTicketPanelById,
    deleteTicketPanel,
    updateTicketPanelMessageId,
    getGuildSettings,
} from '../../lib/db'
import { buildTicketPanelMessage } from '../../lib/handlers/ticketHandler'

export default {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('チケットパネルの管理（管理者専用）')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) =>
            sub
                .setName('setup')
                .setDescription('チャンネルにチケットパネルを設置')
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('パネルを設置するチャンネル')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt.setName('title').setDescription('パネルのタイトル')
                )
                .addStringOption((opt) =>
                    opt.setName('description').setDescription('パネルの説明文')
                )
                .addStringOption((opt) =>
                    opt.setName('button_label').setDescription('ボタンのラベル')
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('category')
                        .setDescription('チケットチャンネルを作成するカテゴリ')
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('cooldown')
                        .setDescription(
                            'チケット作成クールダウン（秒）デフォルト: 300'
                        )
                        .setMinValue(0)
                        .setMaxValue(86400)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('edit')
                .setDescription('パネルの設定を変更して再投稿')
                .addIntegerOption((opt) =>
                    opt
                        .setName('panel_id')
                        .setDescription('パネルID（/ticket list で確認）')
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt.setName('title').setDescription('新しいタイトル')
                )
                .addStringOption((opt) =>
                    opt.setName('description').setDescription('新しい説明文')
                )
                .addStringOption((opt) =>
                    opt
                        .setName('button_label')
                        .setDescription('新しいボタンラベル')
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('cooldown')
                        .setDescription('クールダウン（秒）')
                        .setMinValue(0)
                        .setMaxValue(86400)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('このサーバーのチケットパネル一覧')
        )
        .addSubcommand((sub) =>
            sub
                .setName('delete')
                .setDescription('チケットパネルを削除')
                .addIntegerOption((opt) =>
                    opt
                        .setName('panel_id')
                        .setDescription('パネルID')
                        .setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const sub = interaction.options.getSubcommand()
            const guildId = interaction.guildId!
            const guild = interaction.guild!

            // ── setup ─────────────────────────────────────────────────────────
            if (sub === 'setup') {
                await interaction.deferReply({
                    flags: [MessageFlags.Ephemeral],
                })

                const channel = interaction.options.getChannel(
                    'channel',
                    true
                ) as TextChannel
                const title =
                    interaction.options.getString('title') ?? 'サポートチケット'
                const description =
                    interaction.options.getString('description') ??
                    'ご不明な点やお問い合わせはボタンをクリックして\nチケットを作成してください。'
                const buttonLabel =
                    interaction.options.getString('button_label') ??
                    '🎫 チケットを作成'
                const category = interaction.options.getChannel('category')
                const cooldown =
                    interaction.options.getInteger('cooldown') ?? 300

                // パネルをDB保存
                const panel = await upsertTicketPanel(guildId, channel.id, {
                    panel_title: title,
                    panel_description: description,
                    button_label: buttonLabel,
                    ticket_category_id: category?.id ?? null,
                    cooldown_seconds: cooldown,
                })

                // チャンネルにパネルを投稿
                const { embeds, components } = buildTicketPanelMessage(panel)
                const msg = await channel.send({ embeds, components })
                await updateTicketPanelMessageId(panel.id, msg.id)

                infoEmbed
                    .setTitle('✅ チケットパネルを設置しました')
                    .setDescription(`<#${channel.id}> にパネルを投稿しました。`)
                    .setFields([
                        {
                            name: 'パネルID',
                            value: `\`${panel.id}\``,
                            inline: true,
                        },
                        { name: 'タイトル', value: title, inline: true },
                        {
                            name: 'クールダウン',
                            value: `${cooldown}秒`,
                            inline: true,
                        },
                    ])

                await interaction.editReply({ embeds: [infoEmbed] })
            }

            // ── edit ──────────────────────────────────────────────────────────
            if (sub === 'edit') {
                await interaction.deferReply({
                    flags: [MessageFlags.Ephemeral],
                })

                const panelId = interaction.options.getInteger('panel_id', true)
                const panel = await getTicketPanelById(panelId)

                if (!panel || panel.guild_id !== guildId) {
                    errorEmbed.setDescription(
                        '指定されたパネルが見つかりません。'
                    )
                    return await interaction.editReply({ embeds: [errorEmbed] })
                }

                const patch: Record<string, string | number> = {}
                const title = interaction.options.getString('title')
                const description = interaction.options.getString('description')
                const buttonLabel =
                    interaction.options.getString('button_label')
                const cooldown = interaction.options.getInteger('cooldown')

                if (title) patch.panel_title = title
                if (description) patch.panel_description = description
                if (buttonLabel) patch.button_label = buttonLabel
                if (cooldown !== null) patch.cooldown_seconds = cooldown!

                const updated = await upsertTicketPanel(
                    guildId,
                    panel.channel_id,
                    patch
                )

                // 古いメッセージを削除して再投稿
                if (panel.message_id) {
                    const ch = guild.channels.cache.get(panel.channel_id) as
                        | TextChannel
                        | undefined
                    const oldMsg = await ch?.messages
                        .fetch(panel.message_id)
                        .catch(() => null)
                    await oldMsg?.delete().catch(() => null)
                }

                const ch = guild.channels.cache.get(
                    panel.channel_id
                ) as TextChannel
                const { embeds, components } = buildTicketPanelMessage(updated)
                const newMsg = await ch.send({ embeds, components })
                await updateTicketPanelMessageId(panelId, newMsg.id)

                infoEmbed
                    .setTitle('✅ パネルを更新しました')
                    .setDescription(
                        `<#${panel.channel_id}> のパネルを再投稿しました。`
                    )
                    .setFields([])

                await interaction.editReply({ embeds: [infoEmbed] })
            }

            // ── list ──────────────────────────────────────────────────────────
            if (sub === 'list') {
                const panels = await getTicketPanelsByGuild(guildId)

                if (panels.length === 0) {
                    infoEmbed
                        .setTitle('🎫 チケットパネル一覧')
                        .setDescription(
                            'まだパネルがありません。`/ticket setup` で作成してください。'
                        )
                        .setFields([])
                    return await interaction.reply({
                        embeds: [infoEmbed],
                        flags: [MessageFlags.Ephemeral],
                    })
                }

                const fields = panels.map((p) => ({
                    name: `ID: ${p.id} — ${p.panel_title}`,
                    value:
                        `チャンネル: <#${p.channel_id}>\n` +
                        `クールダウン: ${p.cooldown_seconds}秒\n` +
                        `メッセージ: ${p.message_id ? `[リンク](https://discord.com/channels/${guildId}/${p.channel_id}/${p.message_id})` : '未投稿'}`,
                    inline: false,
                }))

                infoEmbed.setTitle('🎫 チケットパネル一覧').setFields(fields)
                await interaction.reply({
                    embeds: [infoEmbed],
                    flags: [MessageFlags.Ephemeral],
                })
            }

            // ── delete ────────────────────────────────────────────────────────
            if (sub === 'delete') {
                await interaction.deferReply({
                    flags: [MessageFlags.Ephemeral],
                })

                const panelId = interaction.options.getInteger('panel_id', true)
                const panel = await getTicketPanelById(panelId)

                if (!panel || panel.guild_id !== guildId) {
                    errorEmbed.setDescription(
                        '指定されたパネルが見つかりません。'
                    )
                    return await interaction.editReply({ embeds: [errorEmbed] })
                }

                // メッセージ削除
                if (panel.message_id) {
                    const ch = guild.channels.cache.get(panel.channel_id) as
                        | TextChannel
                        | undefined
                    const msg = await ch?.messages
                        .fetch(panel.message_id)
                        .catch(() => null)
                    await msg?.delete().catch(() => null)
                }

                await deleteTicketPanel(panelId)

                infoEmbed
                    .setTitle('✅ パネルを削除しました')
                    .setDescription(`パネル ID \`${panelId}\` を削除しました。`)
                    .setFields([])

                await interaction.editReply({ embeds: [infoEmbed] })
            }
        } catch (error: unknown) {
            console.error(error)
            const message =
                error instanceof Error ? error.message : '不明なエラー'
            errorEmbed.setDescription(message)
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] })
            } else {
                await interaction.reply({
                    embeds: [errorEmbed],
                    flags: [MessageFlags.Ephemeral],
                })
            }
        }
    },
}
