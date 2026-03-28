import { EmbedBuilder } from 'discord.js'

export const createErrorEmbed = (description?: string) =>
    new EmbedBuilder()
        .setColor('#e2041b')
        .setTitle('実行失敗')
        .setDescription(description ?? null)
        .setTimestamp()

export const createSuccessEmbed = () =>
    new EmbedBuilder().setColor('#98d98e').setTitle('実行成功').setTimestamp()

export const createInfoEmbed = () =>
    new EmbedBuilder().setColor('#89c3eb').setTimestamp()
