import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    ChannelType,
} from 'discord.js'
import {
    createErrorEmbed,
    createInfoEmbed,
    createSuccessEmbed,
} from '../../lib/embed'
import {
    getGuildSettings,
    updateGuildSettings,
    getXpBlacklistChannels,
    setXpBlacklistChannels,
    type GuildSettingsRow,
} from '../../lib/db'

export default {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('サーバーのBot設定を管理')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) =>
            sub.setName('show').setDescription('現在の設定を表示')
        )
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('設定を変更する')
                .addRoleOption((opt) =>
                    opt
                        .setName('support_role')
                        .setDescription('サポートロール（チケット用）')
                )
                .addRoleOption((opt) =>
                    opt
                        .setName('moderator_role')
                        .setDescription('モデレーターロール')
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('log_channel')
                        .setDescription('ログチャンネル')
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('welcome_channel')
                        .setDescription('ウェルカムチャンネル')
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('levelup_channel')
                        .setDescription(
                            'レベルアップ通知チャンネル（省略時: 発言チャンネル）'
                        )
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName('levelup_notification')
                        .setDescription('レベルアップ通知を有効にするか')
                )
                .addStringOption((opt) =>
                    opt
                        .setName('currency_name')
                        .setDescription('通貨名（例: コイン）')
                )
                .addStringOption((opt) =>
                    opt
                        .setName('currency_emoji')
                        .setDescription('通貨絵文字（例: 🪙）')
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('daily_amount')
                        .setDescription('デイリーボーナス金額')
                        .setMinValue(1)
                )
                .addNumberOption((opt) =>
                    opt
                        .setName('xp_multiplier')
                        .setDescription('XP倍率（例: 1.5）')
                        .setMinValue(0.1)
                        .setMaxValue(10)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('min_message_length')
                        .setDescription(
                            'カウントする最小メッセージ文字数（デフォルト: 5）'
                        )
                        .setMinValue(1)
                        .setMaxValue(50)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('message_cooldown')
                        .setDescription(
                            'メッセージカウントのクールダウン（秒）（デフォルト: 60）'
                        )
                        .setMinValue(5)
                        .setMaxValue(3600)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('xp_blacklist')
                .setDescription('XP取得を無効にするチャンネルを設定')
                .addStringOption((opt) =>
                    opt
                        .setName('action')
                        .setDescription('操作')
                        .setRequired(true)
                        .addChoices(
                            { name: '追加', value: 'add' },
                            { name: '削除', value: 'remove' },
                            { name: '一覧', value: 'list' }
                        )
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('対象チャンネル（追加・削除時に指定）')
                        .addChannelTypes(ChannelType.GuildText)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
            const sub = interaction.options.getSubcommand()
            const guildId = interaction.guildId!
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })

            // ─── show ─────────────────────────────────────────────────────────
            if (sub === 'show') {
                const settings = await getGuildSettings(guildId)
                const blacklist = await getXpBlacklistChannels(guildId)

                const fmt = (id: string | null, type: 'role' | 'channel') =>
                    id ? (type === 'role' ? `<@&${id}>` : `<#${id}>`) : '未設定'

                const embed = createInfoEmbed()
                    .setTitle(`⚙️ ${interaction.guild?.name} の設定`)
                    .setFields([
                        {
                            name: 'サポートロール',
                            value: fmt(settings.support_role_id, 'role'),
                            inline: true,
                        },
                        {
                            name: 'モデレーターロール',
                            value: fmt(settings.moderator_role_id, 'role'),
                            inline: true,
                        },
                        {
                            name: 'ログチャンネル',
                            value: fmt(settings.log_channel_id, 'channel'),
                            inline: true,
                        },
                        {
                            name: 'ウェルカムチャンネル',
                            value: fmt(settings.welcome_channel_id, 'channel'),
                            inline: true,
                        },
                        {
                            name: 'レベルアップ通知',
                            value: settings.levelup_notification
                                ? `有効 ${settings.levelup_channel_id ? fmt(settings.levelup_channel_id, 'channel') : '（発言チャンネル）'}`
                                : '無効',
                            inline: true,
                        },
                        {
                            name: '通貨',
                            value: `${settings.currency_emoji} ${settings.currency_name}`,
                            inline: true,
                        },
                        {
                            name: 'デイリーボーナス',
                            value: `${settings.currency_emoji} ${settings.daily_amount}`,
                            inline: true,
                        },
                        {
                            name: 'XP倍率',
                            value: `×${settings.xp_multiplier}`,
                            inline: true,
                        },
                        {
                            name: '最小文字数',
                            value: `${settings.min_message_length} 文字`,
                            inline: true,
                        },
                        {
                            name: 'メッセージクールダウン',
                            value: `${settings.message_cooldown_seconds} 秒`,
                            inline: true,
                        },
                        {
                            name: `XPブラックリスト (${blacklist.length}件)`,
                            value:
                                blacklist.length > 0
                                    ? blacklist
                                          .map((id) => `<#${id}>`)
                                          .join(', ')
                                    : 'なし',
                            inline: false,
                        },
                    ])

                return await interaction.editReply({
                    embeds: [embed],
                })
            }

            // ─── set ──────────────────────────────────────────────────────────
            if (sub === 'set') {
                const patch: Partial<
                    Omit<
                        GuildSettingsRow,
                        'guild_id' | 'created_at' | 'updated_at'
                    >
                > = {}

                const supportRole = interaction.options.getRole('support_role')
                const moderatorRole =
                    interaction.options.getRole('moderator_role')
                const logChannel = interaction.options.getChannel('log_channel')
                const welcomeChannel =
                    interaction.options.getChannel('welcome_channel')
                const levelupChannel =
                    interaction.options.getChannel('levelup_channel')
                const levelupNotif = interaction.options.getBoolean(
                    'levelup_notification'
                )
                const currencyName =
                    interaction.options.getString('currency_name')
                const currencyEmoji =
                    interaction.options.getString('currency_emoji')
                const dailyAmount =
                    interaction.options.getInteger('daily_amount')
                const xpMultiplier =
                    interaction.options.getNumber('xp_multiplier')
                const minMsgLen =
                    interaction.options.getInteger('min_message_length')
                const cooldown =
                    interaction.options.getInteger('message_cooldown')

                if (supportRole) patch.support_role_id = supportRole.id
                if (moderatorRole) patch.moderator_role_id = moderatorRole.id
                if (logChannel) patch.log_channel_id = logChannel.id
                if (welcomeChannel) patch.welcome_channel_id = welcomeChannel.id
                if (levelupChannel) patch.levelup_channel_id = levelupChannel.id
                if (levelupNotif !== null)
                    patch.levelup_notification = levelupNotif ? 1 : 0
                if (currencyName) patch.currency_name = currencyName
                if (currencyEmoji) patch.currency_emoji = currencyEmoji
                if (dailyAmount !== null) patch.daily_amount = dailyAmount
                if (xpMultiplier !== null) patch.xp_multiplier = xpMultiplier
                if (minMsgLen !== null) patch.min_message_length = minMsgLen
                if (cooldown !== null) patch.message_cooldown_seconds = cooldown

                if (Object.keys(patch).length === 0) {
                    return await interaction.editReply({
                        embeds: [
                            createErrorEmbed(
                                '変更する設定を少なくとも1つ指定してください。'
                            ),
                        ],
                    })
                }

                await updateGuildSettings(guildId, patch)

                const embed = createSuccessEmbed()
                    .setTitle('設定を更新しました')
                    .setDescription(
                        Object.keys(patch)
                            .map((k) => `• \`${k}\` を更新`)
                            .join('\n')
                    )
                    .setFields([])

                return await interaction.editReply({
                    embeds: [embed],
                })
            }

            // ─── xp_blacklist ─────────────────────────────────────────────────
            if (sub === 'xp_blacklist') {
                const action = interaction.options.getString('action', true)
                const channel = interaction.options.getChannel('channel')
                const blacklist = await getXpBlacklistChannels(guildId)

                if (action === 'list') {
                    const embed = createInfoEmbed()
                        .setTitle('🚫 XPブラックリスト')
                        .setDescription(
                            blacklist.length > 0
                                ? blacklist.map((id) => `<#${id}>`).join('\n')
                                : 'ブラックリストは空です。'
                        )
                    return await interaction.editReply({
                        embeds: [embed],
                    })
                }

                if (!channel) {
                    return await interaction.editReply({
                        embeds: [
                            createErrorEmbed('チャンネルを指定してください。'),
                        ],
                    })
                }

                if (action === 'add') {
                    if (!blacklist.includes(channel.id)) {
                        blacklist.push(channel.id)
                        await setXpBlacklistChannels(guildId, blacklist)
                    }
                    const embed = createInfoEmbed()
                        .setTitle('✅ ブラックリストに追加')
                        .setDescription(
                            `<#${channel.id}> でのXP取得を無効にしました。`
                        )
                    return await interaction.editReply({ embeds: [embed] })
                } else {
                    const updated = blacklist.filter((id) => id !== channel.id)
                    await setXpBlacklistChannels(guildId, updated)
                    const embed = createInfoEmbed()
                        .setTitle('✅ ブラックリストから削除')
                        .setDescription(
                            `<#${channel.id}> でのXP取得を再度有効にしました。`
                        )
                    return await interaction.editReply({ embeds: [embed] })
                }
            }
    },
}
