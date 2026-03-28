import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import { createErrorEmbed, createSuccessEmbed } from '../../lib/embed'

export default {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('指定したメンバーをBAN')
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

            await targetMember.ban({ reason })
            const embed = createSuccessEmbed().setDescription(
                `${targetUser.tag} をBANしました。\n理由: ${reason}`
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
