import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    GuildMember,
} from 'discord.js'
import { errorEmbed, infoEmbed } from '../../lib/embed'
import {
    getUserLevel,
    getUserLevelRank,
    getGuildSettings,
    xpRequired,
} from '../../lib/db'

function buildProgressBar(percent: number, length = 12): string {
    const filled = Math.round((percent / 100) * length)
    const empty = length - filled
    return `${'█'.repeat(filled)}${'░'.repeat(empty)}`
}

export default {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('ユーザーのレベルとXPを表示')
        .addUserOption((opt) =>
            opt.setName('target').setDescription('対象ユーザー（省略時は自分）')
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const user =
                interaction.options.getUser('target') ?? interaction.user
            const guildId = interaction.guildId!

            const [data, rank] = await Promise.all([
                getUserLevel(user.id, guildId),
                getUserLevelRank(user.id, guildId),
            ])

            const xpNeeded = xpRequired(data.level)
            const percent = Math.min(
                100,
                Math.floor((data.xp / xpNeeded) * 100)
            )
            const bar = buildProgressBar(percent)

            infoEmbed
                .setTitle(`📊 ${user.username} のランク`)
                .setThumbnail(user.displayAvatarURL())
                .setFields([
                    {
                        name: 'サーバー順位',
                        value: `**#${rank}**`,
                        inline: true,
                    },
                    {
                        name: 'レベル',
                        value: `**Lv. ${data.level}**`,
                        inline: true,
                    },
                    {
                        name: '累計XP',
                        value: `${data.total_xp.toLocaleString()} XP`,
                        inline: true,
                    },
                    {
                        name: `進捗 ${percent}%`,
                        value: `\`${bar}\` ${data.xp} / ${xpNeeded} XP`,
                        inline: false,
                    },
                ])

            await interaction.reply({ embeds: [infoEmbed] })
        } catch (error: any) {
            console.error(error)
            errorEmbed.setDescription(error.message)
            await interaction.reply({
                embeds: [errorEmbed],
                flags: [MessageFlags.Ephemeral],
            })
        }
    },
}
