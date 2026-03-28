import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    ChannelType,
} from 'discord.js'
import { createInfoEmbed } from '../../lib/embed'

export default {
    data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('サーバーの詳細情報を表示'),

    async execute(interaction: ChatInputCommandInteraction) {
        const { guild } = interaction
        if (!guild) return

        const channels = guild.channels.cache
        const textCount = channels.filter(
            (c) => c.type === ChannelType.GuildText
        ).size
        const voiceCount = channels.filter(
            (c) => c.type === ChannelType.GuildVoice
        ).size
        const categoryCount = channels.filter(
            (c) => c.type === ChannelType.GuildCategory
        ).size

        const embed = createInfoEmbed()
            .setTitle(`${guild.name} の情報`)
            .setThumbnail(guild.iconURL())
            .addFields(
                {
                    name: '🆔 サーバーID',
                    value: `\`${guild.id}\``,
                    inline: false,
                },
                {
                    name: '👑 オーナー',
                    value: `<@${guild.ownerId}>`,
                    inline: true,
                },
                {
                    name: '📅 作成日',
                    value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
                    inline: true,
                },
                {
                    name: '🌍 地域/優先言語',
                    value: `${guild.preferredLocale}`,
                    inline: true,
                },

                {
                    name: '👥 メンバー構成',
                    value: `総数: **${guild.memberCount}**`,
                    inline: true,
                },
                {
                    name: '💎 ブースト',
                    value: `レベル: **${guild.premiumTier}**\n回数: ${guild.premiumSubscriptionCount || 0}`,
                    inline: true,
                },
                {
                    name: '🛡️ 認証レベル',
                    value: `Lv. ${guild.verificationLevel}`,
                    inline: true,
                },

                {
                    name: '💬 チャンネル内訳',
                    value: `総数: ${channels.size}\n└ 📝 テキスト: ${textCount}\n└ 🔊 ボイス: ${voiceCount}\n└ 📁 カテゴリ: ${categoryCount}`,
                    inline: false,
                },
                {
                    name: '🎨 絵文字・ステッカー',
                    value: `通常: ${guild.emojis.cache.size}\nステッカー: ${guild.stickers.cache.size}`,
                    inline: true,
                },
                {
                    name: '🔗 カスタムURL',
                    value: guild.vanityURLCode
                        ? `discord.gg/${guild.vanityURLCode}`
                        : 'なし',
                    inline: true,
                }
            )
            .setTimestamp()

        await interaction.reply({ embeds: [embed] })
    },
}
