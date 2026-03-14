import { EmbedBuilder } from 'discord.js'

export const errorEmbed = new EmbedBuilder()
    .setColor('#e2041b')
    .setTitle('実行失敗')
    .setTimestamp()

export const successEmbed = new EmbedBuilder()
    .setColor('#98d98e')
    .setTitle('実行成功')
    .setTimestamp()

export const infoEmbed = new EmbedBuilder().setColor('#89c3eb').setTimestamp()
