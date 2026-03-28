import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { createErrorEmbed } from './embed'

/**
 * インタラクションにおけるエラーを共通で処理するハンドラ
 */
export async function handleInteractionError(
    interaction: ChatInputCommandInteraction,
    error: any
) {
    console.error(`[Command Error] /${interaction.commandName}:`, error)

    const embed = createErrorEmbed(
        error.message || '予期せぬエラーが発生しました。'
    )

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                embeds: [embed],
                components: [],
            })
        } else {
            await interaction.reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral],
            })
        }
    } catch (e) {
        console.error('[Fatal Error] Failed to send error feedback:', e)
    }
}
