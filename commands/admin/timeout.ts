import {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import { errorEmbed, successEmbed } from '../../lib/embed'

export default {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('指定したメンバーをタイムアウト')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((opt) =>
            opt.setName('target').setDescription('対象者').setRequired(true)
        )
        .addIntegerOption((opt) =>
            opt
                .setName('duration')
                .setDescription('期間')
                .setRequired(true)
                .addChoices(
                    { name: '1分', value: 1 },
                    { name: '10分', value: 10 },
                    { name: '1時間', value: 60 },
                    { name: '1日', value: 1440 },
                    { name: '1週間', value: 10080 }
                )
        )
        .addStringOption((opt) => opt.setName('reason').setDescription('理由')),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const targetUser = interaction.options.getUser('target')!
            const targetMember = await interaction.guild?.members.fetch(
                targetUser.id
            )
            const reason =
                interaction.options.getString('reason') ??
                '理由は指定されていません'

            if (!targetMember)
                throw new Error('ユーザーが見つかりませんでした。')
            if (!targetMember.manageable)
                throw new Error(
                    'ボットの権限が不足しているか、対象の役職がボットより高いです。'
                )

            const duration = interaction.options.getInteger('duration')!
            await targetMember.timeout(duration * 60 * 1000, reason)
            successEmbed.setDescription(
                `${targetUser.tag} を ${duration} 分間停止させました。\n理由: ${reason}`
            )

            await interaction.reply({ embeds: [successEmbed] })
        } catch (error: any) {
            errorEmbed.setDescription(error.message)
            await interaction.reply({
                embeds: [errorEmbed],
                flags: [MessageFlags.Ephemeral],
            })
        }
    },
}
