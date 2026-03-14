import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js'
import { errorEmbed, successEmbed } from '../../lib/embed'

export default {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('メッセージを一括削除')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addIntegerOption((opt) =>
            opt
                .setName('count')
                .setDescription('削除する件数 (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const amount = interaction.options.getInteger('count')!

            if (!interaction.channel || interaction.channel.isDMBased()) {
                throw new Error('サーバー内のチャンネルで実行してください。')
            }

            if ('bulkDelete' in interaction.channel) {
                const deleted = await interaction.channel.bulkDelete(
                    amount,
                    true
                )

                successEmbed.setDescription(
                    `${deleted.size} 件のメッセージを削除しました。`
                )

                await interaction.reply({
                    embeds: [successEmbed],
                    flags: [MessageFlags.Ephemeral],
                })
            }
        } catch (error: any) {
            errorEmbed.setDescription(error.message)
            await interaction.reply({
                embeds: [errorEmbed],
                flags: [MessageFlags.Ephemeral],
            })
        }
    },
}
