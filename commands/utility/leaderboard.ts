import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import { errorEmbed, infoEmbed } from '../../lib/embed'
import {
    getLevelRanking,
    getEconomyRanking,
    getMessageRanking,
    getGuildSettings,
} from '../../lib/db'

const MEDALS = ['🥇', '🥈', '🥉']
const rankLabel = (i: number) => MEDALS[i] ?? `**#${i + 1}**`

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('サーバーのランキングを表示')
        .addStringOption((opt) =>
            opt
                .setName('type')
                .setDescription('ランキングの種類')
                .setRequired(false)
                .addChoices(
                    { name: '📈 レベル・XP', value: 'level' },
                    { name: '💰 所持金', value: 'economy' },
                    { name: '💬 メッセージ数', value: 'messages' }
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply()

            const type = interaction.options.getString('type') ?? 'level'
            const guildId = interaction.guildId!
            const guild = interaction.guild!
            const settings = await getGuildSettings(guildId)

            if (type === 'level') {
                const ranking = await getLevelRanking(guildId, 10)

                if (ranking.length === 0) {
                    infoEmbed
                        .setTitle('📈 レベルランキング')
                        .setDescription('まだデータがありません。')
                        .setFields([])
                    return await interaction.editReply({ embeds: [infoEmbed] })
                }

                // ユーザー名を取得（キャッシュ優先）
                const lines = await Promise.all(
                    ranking.map(async (entry, i) => {
                        const member = await guild.members
                            .fetch(entry.user_id)
                            .catch(() => null)
                        const name =
                            member?.displayName ?? `<@${entry.user_id}>`
                        return `${rankLabel(i)} ${name} — Lv.**${entry.level}** \`${(entry.total_xp ?? 0).toLocaleString()} XP\``
                    })
                )

                infoEmbed
                    .setTitle(`📈 レベルランキング`)
                    .setDescription(lines.join('\n'))
                    .setFields([])
                    .setThumbnail(guild.iconURL())

                await interaction.editReply({ embeds: [infoEmbed] })
            }

            if (type === 'economy') {
                const ranking = await getEconomyRanking(guildId, 10)

                if (ranking.length === 0) {
                    infoEmbed
                        .setTitle('💰 所持金ランキング')
                        .setDescription('まだデータがありません。')
                        .setFields([])
                    return await interaction.editReply({ embeds: [infoEmbed] })
                }

                const emoji = settings.currency_emoji ?? '🪙'
                const name = settings.currency_name ?? 'コイン'

                const lines = await Promise.all(
                    ranking.map(async (entry, i) => {
                        const member = await guild.members
                            .fetch(entry.user_id)
                            .catch(() => null)
                        const displayName =
                            member?.displayName ?? `<@${entry.user_id}>`
                        return `${rankLabel(i)} ${displayName} — ${emoji} **${(entry.balance ?? 0).toLocaleString()}** ${name}`
                    })
                )

                infoEmbed
                    .setTitle(`💰 所持金ランキング`)
                    .setDescription(lines.join('\n'))
                    .setFields([])
                    .setThumbnail(guild.iconURL())

                await interaction.editReply({ embeds: [infoEmbed] })
            }

            if (type === 'messages') {
                const ranking = await getMessageRanking(guildId, 10)

                if (ranking.length === 0) {
                    infoEmbed
                        .setTitle('💬 メッセージランキング')
                        .setDescription('まだデータがありません。')
                        .setFields([])
                    return await interaction.editReply({ embeds: [infoEmbed] })
                }

                const minLen = settings.min_message_length ?? 5

                const lines = await Promise.all(
                    ranking.map(async (entry, i) => {
                        const member = await guild.members
                            .fetch(entry.user_id)
                            .catch(() => null)
                        const displayName =
                            member?.displayName ?? `<@${entry.user_id}>`
                        return `${rankLabel(i)} ${displayName} — 💬 **${(entry.message_count ?? 0).toLocaleString()}** メッセージ`
                    })
                )

                infoEmbed
                    .setTitle(`💬 メッセージランキング`)
                    .setDescription(lines.join('\n'))
                    .setFooter({
                        text: `※${minLen}文字以上のメッセージのみカウントされています。`,
                    })
                    .setThumbnail(guild.iconURL())

                await interaction.editReply({ embeds: [infoEmbed] })
            }
        } catch (error: any) {
            console.error(error)
            errorEmbed.setDescription(error.message)
            await interaction.editReply({ embeds: [errorEmbed] })
        }
    },
}
