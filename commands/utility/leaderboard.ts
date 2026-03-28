import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import { createErrorEmbed, createInfoEmbed } from '../../lib/embed'
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
        const type = interaction.options.getString('type') ?? 'level'
        const guildId = interaction.guildId!
        const guild = interaction.guild!

        await interaction.deferReply()

        const settings = await getGuildSettings(guildId)

        if (type === 'level') {
            const ranking = await getLevelRanking(guildId, 10)

            if (ranking.length === 0) {
                const embed = createInfoEmbed()
                    .setTitle('レベルランキング')
                    .setDescription('まだデータがありません。')
                return await interaction.editReply({
                    embeds: [embed],
                })
            }

            const lines = ranking.map((entry, i) => {
                return `${rankLabel(i)} <@${entry.user_id}> — Lv.**${entry.level}** \`${(entry.total_xp ?? 0).toLocaleString()} XP\``
            })

            const embed = createInfoEmbed()
                .setTitle(`レベルランキング`)
                .setDescription(lines.join('\n'))
                .setThumbnail(guild.iconURL())

            await interaction.editReply({ embeds: [embed] })
        } else if (type === 'economy') {
            const ranking = await getEconomyRanking(guildId, 10)

            if (ranking.length === 0) {
                const embed = createInfoEmbed()
                    .setTitle('所持金ランキング')
                    .setDescription('まだデータがありません。')
                return await interaction.editReply({ embeds: [embed] })
            }

            const emoji = settings.currency_emoji ?? '🪙'
            const name = settings.currency_name ?? 'コイン'

            const lines = ranking.map((entry, i) => {
                return `${rankLabel(i)} <@${entry.user_id}> — ${emoji} **${(entry.balance ?? 0).toLocaleString()}** ${name}`
            })

            const embed = createInfoEmbed()
                .setTitle(`所持金ランキング`)
                .setDescription(lines.join('\n'))
                .setThumbnail(guild.iconURL())

            await interaction.editReply({ embeds: [embed] })
        } else if (type === 'messages') {
            const ranking = await getMessageRanking(guildId, 10)

            if (ranking.length === 0) {
                const embed = createInfoEmbed()
                    .setTitle('メッセージランキング')
                    .setDescription('まだデータがありません。')
                return await interaction.editReply({ embeds: [embed] })
            }

            const minLen = settings.min_message_length ?? 5

            const lines = ranking.map((entry, i) => {
                return `${rankLabel(i)} <@${entry.user_id}> — **${(entry.message_count ?? 0).toLocaleString()}** メッセージ`
            })

            const embed = createInfoEmbed()
                .setTitle(`メッセージランキング`)
                .setDescription(lines.join('\n'))
                .setFooter({
                    text: `※${minLen}文字以上のメッセージのみカウントされています。`,
                })
                .setThumbnail(guild.iconURL())

            await interaction.editReply({ embeds: [embed] })
        }
    },
}
