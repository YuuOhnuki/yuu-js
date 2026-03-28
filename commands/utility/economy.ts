import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import { createErrorEmbed, createInfoEmbed } from '../../lib/embed'
import {
    getUserEconomy,
    claimDaily,
    transferBalance,
    getGuildSettings,
    getToday,
} from '../../lib/db'

export default {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('経済コマンド')
        .addSubcommand((sub) =>
            sub
                .setName('balance')
                .setDescription('残高を確認')
                .addUserOption((opt) =>
                    opt
                        .setName('target')
                        .setDescription('対象ユーザー（省略時は自分）')
                )
        )
        .addSubcommand((sub) =>
            sub.setName('daily').setDescription('デイリーボーナスを受け取る')
        )
        .addSubcommand((sub) =>
            sub
                .setName('pay')
                .setDescription('他のユーザーにコインを送る')
                .addUserOption((opt) =>
                    opt
                        .setName('target')
                        .setDescription('送り先')
                        .setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('amount')
                        .setDescription('金額')
                        .setRequired(true)
                        .setMinValue(1)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const sub = interaction.options.getSubcommand()
            const guildId = interaction.guildId!
            const settings = await getGuildSettings(guildId)
            const emoji = settings.currency_emoji ?? '🪙'
            const currencyName = settings.currency_name ?? 'コイン'

            // ─── balance ─────────────────────────────────────────────────────
            if (sub === 'balance') {
                const user =
                    interaction.options.getUser('target') ?? interaction.user
                const data = await getUserEconomy(user.id, guildId)

                const dailyAvailable = data.last_daily_date !== getToday()

                const embed = createInfoEmbed()
                    .setTitle(`${emoji} ${user.username} の残高`)
                    .setThumbnail(user.displayAvatarURL())
                    .setFields([
                        {
                            name: '現在の残高',
                            value: `${emoji} **${data.balance.toLocaleString()}** ${currencyName}`,
                            inline: true,
                        },
                        {
                            name: '累計獲得',
                            value: `${emoji} ${data.total_earned.toLocaleString()} ${currencyName}`,
                            inline: true,
                        },
                        {
                            name: 'デイリー',
                            value: dailyAvailable
                                ? '✅ 受け取れます！ `/economy daily`'
                                : '⏳ 受け取り済み（また明日）',
                            inline: false,
                        },
                    ])

                return await interaction.reply({ embeds: [embed] })
            }

            // ─── daily ───────────────────────────────────────────────────────
            if (sub === 'daily') {
                const result = await claimDaily(interaction.user.id, guildId)

                if (!result.success) {
                    return await interaction.reply({
                        embeds: [createErrorEmbed(`デイリーはすでに受け取り済みです。\n次回受け取り可能: **${result.nextAvailableDate}**`)],
                        flags: [MessageFlags.Ephemeral],
                    })
                }

                const embed = createInfoEmbed().setTitle('🎁 デイリーボーナス').setFields([
                    {
                        name: '獲得',
                        value: `${emoji} +**${result.amount.toLocaleString()}** ${currencyName}`,
                        inline: true,
                    },
                    {
                        name: '現在の残高',
                        value: `${emoji} **${result.newBalance.toLocaleString()}** ${currencyName}`,
                        inline: true,
                    },
                    {
                        name: '次回',
                        value: '明日また受け取れます 🌅',
                        inline: false,
                    },
                ])

                return await interaction.reply({ embeds: [embed] })
            }

            // ─── pay ─────────────────────────────────────────────────────────
            if (sub === 'pay') {
                const target = interaction.options.getUser('target', true)
                const amount = interaction.options.getInteger('amount', true)

                const result = await transferBalance(
                    interaction.user.id,
                    target.id,
                    guildId,
                    amount
                )

                if (!result.success) {
                    if (result.error === 'self_transfer') {
                        return await interaction.reply({ embeds: [createErrorEmbed('自分自身には送れません。')], flags: [MessageFlags.Ephemeral] })
                    } else {
                        return await interaction.reply({
                            embeds: [createErrorEmbed(`残高が不足しています。\n現在の残高: ${emoji} **${result.senderBalance?.toLocaleString()}** ${currencyName}`)],
                            flags: [MessageFlags.Ephemeral],
                        })
                    }
                }

                const embed = createInfoEmbed().setTitle('💸 送金完了').setFields([
                    { name: '送り先', value: `${target}`, inline: true },
                    {
                        name: '金額',
                        value: `${emoji} **${amount.toLocaleString()}** ${currencyName}`,
                        inline: true,
                    },
                    {
                        name: 'あなたの残高',
                        value: `${emoji} **${result.senderBalance?.toLocaleString()}** ${currencyName}`,
                        inline: true,
                    },
                    {
                        name: `${target.username} の残高`,
                        value: `${emoji} **${result.receiverBalance?.toLocaleString()}** ${currencyName}`,
                        inline: true,
                    },
                ])

                return await interaction.reply({ embeds: [embed] })
            }
        } catch (error: any) {
            console.error(error)
            await interaction.reply({
                embeds: [createErrorEmbed(error.message)],
                flags: [MessageFlags.Ephemeral],
            })
        }
    },
}
