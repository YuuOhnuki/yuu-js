import { Events, Message, TextChannel } from 'discord.js'
import { infoEmbed } from '../lib/embed'
import { addXp, recordMessage, getGuildSettings } from '../lib/db'

/** メッセージ1件あたりの基本XP量（ランダム性を持たせる） */
function randomXp(min = 15, max = 25): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

export default {
    name: Events.MessageCreate,
    async execute(message: Message) {
        // Bot・DM・システムメッセージを除外
        if (message.author.bot) return
        if (!message.guild) return
        if (!message.channel.isTextBased()) return

        const userId = message.author.id
        const guildId = message.guild.id
        const content = message.content

        // ─── 並列処理：メッセージカウント＆XP付与 ──────────────────────────
        const [, xpResult] = await Promise.all([
            // メッセージカウント（内部でフィルタリング・クールダウン判定）
            recordMessage(userId, guildId, content, message.channelId),

            // XP付与（内部でクールダウン判定）
            addXp(userId, guildId, randomXp()),
        ])

        // ─── レベルアップ通知 ────────────────────────────────────────────────
        if (xpResult.leveled) {
            const settings = await getGuildSettings(guildId)

            if (!settings.levelup_notification) return

            const notifChannelId = settings.levelup_channel_id
            const targetChannel = notifChannelId
                ? (message.guild.channels.cache.get(notifChannelId) as
                      | TextChannel
                      | undefined)
                : (message.channel as TextChannel)

            if (!targetChannel?.isTextBased()) return

            infoEmbed
                .setTitle('🎉 レベルアップ！')
                .setDescription(
                    `<@${userId}> さんが **Lv.${xpResult.newLevel}** になりました！`
                )
                .setThumbnail(message.author.displayAvatarURL())
                .setFields([
                    {
                        name: 'レベル',
                        value: `${xpResult.oldLevel} → **${xpResult.newLevel}**`,
                        inline: true,
                    },
                    {
                        name: '次のレベルまで',
                        value: `${xpResult.xpForNext} XP`,
                        inline: true,
                    },
                ])

            await targetChannel
                .send({ embeds: [infoEmbed] })
                .catch(console.error)
        }
    },
}
