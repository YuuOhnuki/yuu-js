/**
 * commands/admin/rolepanel.ts
 *
 * インタラクティブなロール付与パネルを作成・管理するコマンド。
 *
 * /rolepanel create  - 対話式ウィザードでパネルを作成
 * /rolepanel edit    - パネルにロールを追加・削除
 * /rolepanel publish - パネルをチャンネルに投稿（または再投稿）
 * /rolepanel list    - パネル一覧
 * /rolepanel delete  - パネルを削除
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
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
    type TextChannel,
    type Message,
    type ButtonInteraction,
    type StringSelectMenuInteraction,
} from 'discord.js'
import {
    createErrorEmbed,
    createInfoEmbed,
    createSuccessEmbed,
} from '../../lib/embed'
import {
    createRolePanel,
    getRolePanelById,
    getRolePanelsByGuild,
    deleteRolePanel,
    addRolePanelItem,
    removeRolePanelItem,
    getRolePanelItems,
    updateRolePanelMessageId,
    type RolePanelRow,
    type RolePanelItemRow,
} from '../../lib/db'

const WIZARD_TIMEOUT = 10 * 60 * 1000 // 10分

export default {
    data: new SlashCommandBuilder()
        .setName('rolepanel')
        .setDescription('ロール付与パネルの管理（管理者専用）')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) =>
            sub
                .setName('create')
                .setDescription('新しいロールパネルを作成')
                .addStringOption((opt) =>
                    opt
                        .setName('title')
                        .setDescription('パネルのタイトル')
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('type')
                        .setDescription('ボタン形式 or セレクトメニュー形式')
                        .setRequired(true)
                        .addChoices(
                            {
                                name: 'ボタン',
                                value: 'button',
                            },
                            {
                                name: 'セレクトメニュー',
                                value: 'select',
                            }
                        )
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('パネルを投稿するチャンネル')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('edit')
                .setDescription('パネルへのロールの追加・削除を行い再投稿')
                .addIntegerOption((opt) =>
                    opt
                        .setName('panel_id')
                        .setDescription('パネルID')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('publish')
                .setDescription('パネルをチャンネルに投稿（または再投稿）')
                .addIntegerOption((opt) =>
                    opt
                        .setName('panel_id')
                        .setDescription('パネルID')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('list').setDescription('このサーバーのロールパネル一覧')
        )
        .addSubcommand((sub) =>
            sub
                .setName('delete')
                .setDescription('ロールパネルを削除')
                .addIntegerOption((opt) =>
                    opt
                        .setName('panel_id')
                        .setDescription('パネルID')
                        .setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand()
        const guildId = interaction.guildId!
        const guild = interaction.guild!

        // ── create ────────────────────────────────────────────────────────
        if (sub === 'create') {
            const title = interaction.options.getString('title', true)
            const type = interaction.options.getString('type', true) as
                | 'button'
                | 'select'
            const channel = interaction.options.getChannel(
                'channel',
                true
            ) as TextChannel

            // DBにパネル作成（ロールはこの後ウィザードで追加）
            const panel = await createRolePanel(
                guildId,
                channel.id,
                title,
                type
            )

            // ウィザード UI を開始
            const wizardMsg = await interaction.reply({
                embeds: [buildWizardEmbed(panel.id, title, type, [])],
                components: buildWizardComponents(guild, []),
                fetchReply: true,
            })

            await runWizard(interaction, wizardMsg as Message, panel.id, guild)
            return
        }

        // ── edit ──────────────────────────────────────────────────────────
        if (sub === 'edit') {
            const panelId = interaction.options.getInteger('panel_id', true)
            const panel = await getRolePanelById(panelId)

            if (!panel || panel.guild_id !== guildId) {
                return await interaction.reply({
                    embeds: [
                        createErrorEmbed('指定されたパネルが見つかりません。'),
                    ],
                    flags: [MessageFlags.Ephemeral],
                })
            }

            const items = await getRolePanelItems(panelId)

            const wizardMsg = await interaction.reply({
                embeds: [
                    buildWizardEmbed(
                        panel.id,
                        panel.panel_title,
                        panel.panel_type as 'button' | 'select',
                        items.map((it) => it.role_id)
                    ),
                ],
                components: buildWizardComponents(
                    guild,
                    items.map((it) => it.role_id)
                ),
                fetchReply: true,
            })

            await runWizard(interaction, wizardMsg as Message, panelId, guild)
            return
        }

        // ── publish ───────────────────────────────────────────────────────
        if (sub === 'publish') {
            await interaction.deferReply({
                flags: [MessageFlags.Ephemeral],
            })

            const panelId = interaction.options.getInteger('panel_id', true)
            const panel = await getRolePanelById(panelId)

            if (!panel || panel.guild_id !== guildId) {
                return await interaction.editReply({
                    embeds: [
                        createErrorEmbed('指定されたパネルが見つかりません。'),
                    ],
                })
            }

            await publishPanel(guild, panel.id)

            const embed = createInfoEmbed()
                .setTitle('パネルを投稿しました')
                .setDescription(
                    `<#${panel.channel_id}> にパネルを投稿しました。`
                )
            await interaction.editReply({ embeds: [embed] })
        }

        // ── list ──────────────────────────────────────────────────────────
        if (sub === 'list') {
            const panels = await getRolePanelsByGuild(guildId)

            if (panels.length === 0) {
                const embed = createInfoEmbed()
                    .setTitle('ロールパネル一覧')
                    .setDescription(
                        'まだパネルがありません。`/rolepanel create` で作成してください。'
                    )
                return await interaction.reply({
                    embeds: [embed],
                    flags: [MessageFlags.Ephemeral],
                })
            }

            const fields = await Promise.all(
                panels.map(async (p) => {
                    const items = await getRolePanelItems(p.id)
                    return {
                        name: `ID: ${p.id} — ${p.panel_title} (${p.panel_type === 'button' ? 'ボタン' : 'セレクト'})`,
                        value:
                            `チャンネル: <#${p.channel_id}>\n` +
                            `ロール数: ${items.length}個\n` +
                            `メッセージ: ${p.message_id ? `[リンク](https://discord.com/channels/${guildId}/${p.channel_id}/${p.message_id})` : '未投稿'}`,
                        inline: false,
                    }
                })
            )

            const embed = createInfoEmbed()
                .setTitle('ロールパネル一覧')
                .setFields(fields)
            await interaction.reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral],
            })
        }

        // ── delete ────────────────────────────────────────────────────────
        if (sub === 'delete') {
            await interaction.deferReply({
                flags: [MessageFlags.Ephemeral],
            })

            const panelId = interaction.options.getInteger('panel_id', true)
            const panel = await getRolePanelById(panelId)

            if (!panel || panel.guild_id !== guildId) {
                return await interaction.editReply({
                    embeds: [
                        createErrorEmbed('指定されたパネルが見つかりません。'),
                    ],
                })
            }

            // 投稿済みメッセージを削除
            if (panel.message_id) {
                const ch = guild.channels.cache.get(panel.channel_id) as
                    | TextChannel
                    | undefined
                const msg = await ch?.messages
                    .fetch(panel.message_id)
                    .catch(() => null)
                await msg?.delete().catch(() => null)
            }

            await deleteRolePanel(panelId)

            const embed = createInfoEmbed()
                .setTitle('パネルを削除しました')
                .setDescription(`パネル ID \`${panelId}\` を削除しました。`)
            await interaction.editReply({ embeds: [embed] })
        }
    },
}

// ─── ウィザード ───────────────────────────────────────────────────────────────

function buildWizardEmbed(
    panelId: number,
    title: string,
    type: string,
    currentRoleIds: string[]
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`ロールパネルウィザード — ${title}`)
        .setDescription(
            `形式: **${type === 'button' ? '🔘 ボタン' : 'セレクトメニュー'}**\n` +
                `パネルID: \`${panelId}\`\n\n` +
                (currentRoleIds.length > 0
                    ? `現在のロール (${currentRoleIds.length}個):\n${currentRoleIds.map((id) => `• <@&${id}>`).join('\n')}`
                    : '_まだロールが追加されていません。_')
        )
        .setFooter({
            text: '「ロールを追加」でロールを追加し、完成したら「投稿する」を押してください。',
        })
}

function buildWizardComponents(
    guild: import('discord.js').Guild,
    currentRoleIds: string[]
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = []

    // ロール追加セレクト（まだ追加されていないロールのみ）
    const available = guild.roles.cache
        .filter(
            (r) =>
                r.id !== guild.id &&
                !r.managed &&
                !currentRoleIds.includes(r.id)
        )
        .sort((a, b) => b.position - a.position)
        .first(25)

    if (available.length > 0) {
        const addRow =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('rp_wizard_add')
                    .setPlaceholder('➕ 追加するロールを選択')
                    .addOptions(
                        available.map((r) =>
                            new StringSelectMenuOptionBuilder()
                                .setValue(r.id)
                                .setLabel(r.name.slice(0, 100))
                                .setEmoji('🎭')
                        )
                    )
            )
        rows.push(addRow)
    }

    // ロール削除セレクト（追加済みのみ）
    if (currentRoleIds.length > 0) {
        const removeOptions = currentRoleIds.map((id) => {
            const role = guild.roles.cache.get(id)
            return new StringSelectMenuOptionBuilder()
                .setValue(id)
                .setLabel(role?.name.slice(0, 100) ?? id)
                .setEmoji('❌')
        })
        const removeRow =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('rp_wizard_remove')
                    .setPlaceholder('➖ 削除するロールを選択')
                    .addOptions(removeOptions)
            )
        rows.push(removeRow)
    }

    // アクションボタン
    const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('rp_wizard_publish')
            .setLabel('🚀 投稿する')
            .setStyle(ButtonStyle.Success)
            .setDisabled(currentRoleIds.length === 0),
        new ButtonBuilder()
            .setCustomId('rp_wizard_cancel')
            .setLabel('🚫 キャンセル')
            .setStyle(ButtonStyle.Danger)
    )
    rows.push(btnRow)

    return rows
}

// ─── パネルメッセージ構築（他のコマンドからも再利用可能） ────────────────────────

function buildRolePanelMessage(
    panel: RolePanelRow,
    items: RolePanelItemRow[]
): {
    embeds: EmbedBuilder[]
    components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]
} {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(panel.panel_title)
        .setDescription(panel.panel_description ?? null)
        .setFooter({ text: `Panel ID: ${panel.id}` })

    const components: ActionRowBuilder<
        ButtonBuilder | StringSelectMenuBuilder
    >[] = []

    if (panel.panel_type === 'button') {
        // ボタン形式: ロールごとにボタンを並べる（1行最大5個）
        const chunks: RolePanelItemRow[][] = []
        for (let i = 0; i < items.length; i += 5) {
            chunks.push(items.slice(i, i + 5))
        }
        for (const chunk of chunks) {
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                ...chunk.map((item) =>
                    new ButtonBuilder()
                        .setCustomId(`rp_role:${panel.id}:${item.role_id}`)
                        .setLabel(item.label)
                        .setStyle(ButtonStyle.Secondary)
                )
            )
            components.push(row as ActionRowBuilder<ButtonBuilder>)
        }
    } else {
        // セレクトメニュー形式: 1つのセレクトに全ロールを入れる
        const select = new StringSelectMenuBuilder()
            .setCustomId(`rp_select:${panel.id}`)
            .setPlaceholder('ロールを選択')
            .addOptions(
                items.map((item) => {
                    const option = new StringSelectMenuOptionBuilder()
                        .setValue(item.role_id)
                        .setLabel(item.label)
                    if (item.description) {
                        option.setDescription(item.description)
                    }
                    return option
                })
            )

        components.push(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                select
            )
        )
    }

    return { embeds: [embed], components }
}

async function runWizard(
    interaction: ChatInputCommandInteraction,
    wizardMsg: Message,
    panelId: number,
    guild: import('discord.js').Guild
): Promise<void> {
    const collector = wizardMsg.createMessageComponentCollector({
        time: WIZARD_TIMEOUT,
        filter: (i) => i.user.id === interaction.user.id,
    })

    collector.on(
        'collect',
        async (i: ButtonInteraction | StringSelectMenuInteraction) => {
            try {
                // ── ロール追加 ──────────────────────────────────────────────────
                if (i.customId === 'rp_wizard_add' && i.isStringSelectMenu()) {
                    if (!i.values.length) {
                        return await i.deferUpdate()
                    }
                    const roleId = i.values[0]!
                    const role = guild.roles.cache.get(roleId)
                    if (!role) return await i.deferUpdate()

                    await addRolePanelItem(
                        panelId,
                        roleId,
                        role.name,
                        null,
                        null
                    )

                    const items = await getRolePanelItems(panelId)
                    const panel = await getRolePanelById(panelId)
                    await i.update({
                        embeds: [
                            buildWizardEmbed(
                                panelId,
                                panel?.panel_title ?? '',
                                panel?.panel_type ?? 'button',
                                items.map((it) => it.role_id)
                            ),
                        ],
                        components: buildWizardComponents(
                            guild,
                            items.map((it) => it.role_id)
                        ) as ActionRowBuilder<ButtonBuilder>[],
                    })
                    return
                }

                // ── ロール削除 ──────────────────────────────────────────────────
                if (
                    i.customId === 'rp_wizard_remove' &&
                    i.isStringSelectMenu()
                ) {
                    if (!i.values.length) {
                        return await i.deferUpdate()
                    }
                    const roleId = i.values[0]!
                    await removeRolePanelItem(panelId, roleId)

                    const items = await getRolePanelItems(panelId)
                    const panel = await getRolePanelById(panelId)
                    await i.update({
                        embeds: [
                            buildWizardEmbed(
                                panelId,
                                panel?.panel_title ?? '',
                                panel?.panel_type ?? 'button',
                                items.map((it) => it.role_id)
                            ),
                        ],
                        components: buildWizardComponents(
                            guild,
                            items.map((it) => it.role_id)
                        ) as ActionRowBuilder<ButtonBuilder>[],
                    })
                    return
                }

                // ── 投稿 ────────────────────────────────────────────────────────
                if (i.customId === 'rp_wizard_publish') {
                    await i.deferUpdate()
                    await publishPanel(guild, panelId)

                    const panel = await getRolePanelById(panelId)
                    await i.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(Colors.Green)
                                .setTitle('ロールパネルを投稿しました')
                                .setDescription(
                                    panel
                                        ? `<#${panel.channel_id}> に投稿しました。`
                                        : '投稿完了'
                                ),
                        ],
                        components: [],
                    })
                    collector.stop('published')
                    return
                }

                // ── キャンセル ───────────────────────────────────────────────────
                if (i.customId === 'rp_wizard_cancel') {
                    await i.update({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(Colors.Grey)
                                .setDescription('🚫 キャンセルしました。'),
                        ],
                        components: [],
                    })
                    collector.stop('cancelled')
                    return
                }
            } catch (err) {
                console.error('[rolepanel wizard]', err)
            }
        }
    )

    collector.on('end', async (_, reason) => {
        if (reason === 'published' || reason === 'cancelled') return
        try {
            await wizardMsg.edit({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Grey)
                        .setTitle('⏱ タイムアウト')
                        .setDescription(
                            '操作がタイムアウトしました。`/rolepanel publish` で後から投稿できます。'
                        ),
                ],
                components: [],
            })
        } catch {
            /* ignore */
        }
    })
}

// ─── パネル投稿（publish / re-publish） ──────────────────────────────────────

async function publishPanel(
    guild: import('discord.js').Guild,
    panelId: number
): Promise<void> {
    const panel = await getRolePanelById(panelId)
    if (!panel) throw new Error(`Panel ${panelId} not found`)

    const items = await getRolePanelItems(panelId)
    const ch = guild.channels.cache.get(panel.channel_id) as
        | TextChannel
        | undefined
    if (!ch) throw new Error(`Channel ${panel.channel_id} not found`)

    // 古いメッセージを削除
    if (panel.message_id) {
        const old = await ch.messages.fetch(panel.message_id).catch(() => null)
        await old?.delete().catch(() => null)
    }

    const { embeds, components } = buildRolePanelMessage(panel, items)
    const msg = await ch.send({ embeds, components })
    await updateRolePanelMessageId(panelId, msg.id)
}
