import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import { createErrorEmbed, createSuccessEmbed } from '../../lib/embed'

export default {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('指定したメンバーをKICK')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((opt) =>
            opt.setName('target').setDescription('対象者').setRequired(true)
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

            await targetMember.kick(reason)
            const embed = createSuccessEmbed().setDescription(
                `${targetUser.tag} をKICKしました。\n理由: ${reason}`
            )

            await interaction.reply({ embeds: [embed] })
        } catch (error: any) {
            console.error(error)
            await interaction.editReply({
                embeds: [createErrorEmbed(error.message)],
            })
        }
    },
}
