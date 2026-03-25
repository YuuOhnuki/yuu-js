import { Readable } from 'node:stream'
import { Events, Message, TextChannel } from 'discord.js'
import { infoEmbed } from '../lib/embed'
import {
    addXp,
    recordMessage,
    getGuildSettings,
    getTtsSettings,
} from '../lib/db'
import {
    getVoiceConnection,
    createAudioPlayer,
    createAudioResource,
} from '@discordjs/voice'

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

        // ─── TTS 読み上げ ─────────────────────────────────────────────────────
        const ttsSettings = await getTtsSettings(guildId)
        if (ttsSettings && ttsSettings.text_channel_id === message.channelId) {
            const connection = getVoiceConnection(guildId)
            if (connection) {
                // google-tts-api は 200文字制限があるため切り詰め
                const text = content
                    .replace(/<a?:\w+:\d+>/g, '')
                    .slice(0, 200)
                    .trim()

                if (text.length > 0) {
                    try {
                        const speakerId = 3 // デフォルト: ずんだもん
                        const engineUrl = 'http://localhost:50021'

                        // 1. 音声合成用のクエリを作成
                        const queryRes = await fetch(
                            `${engineUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
                            { method: 'POST' }
                        )
                        if (!queryRes.ok) return
                        const query = await queryRes.json()

                        // 2. 音声波形データを生成
                        const synthRes = await fetch(
                            `${engineUrl}/synthesis?speaker=${speakerId}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(query),
                            }
                        )
                        if (!synthRes.ok) return

                        const arrayBuffer = await synthRes.arrayBuffer()
                        const resource = createAudioResource(
                            Readable.from(Buffer.from(arrayBuffer))
                        )

                        const player = createAudioPlayer()
                        player.play(resource)
                        connection.subscribe(player)
                    } catch (error) {
                        console.error('[VOICEVOX TTS Error]', error)
                    }
                }
            }
        }

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
