import { Events, TextChannel, VoiceState } from 'discord.js'
import { getVoiceConnection } from '@discordjs/voice'
import type { ExtendedClient } from '../index'
import { getTtsSettings, deleteTtsSettings } from '../lib/db'

export default {
    name: Events.VoiceStateUpdate,
    async execute(
        oldState: VoiceState,
        newState: VoiceState,
        client: ExtendedClient
    ) {
        const guildId = oldState.guild.id
        const connection = getVoiceConnection(guildId)

        // ボットが参加していないサーバーなら無視
        if (!connection) return

        const botChannelId = connection.joinConfig.channelId
        if (!botChannelId) return

        // 「ボットと同じチャンネルから誰かがいなくなった」ときのみチェック
        if (
            oldState.channelId === botChannelId &&
            newState.channelId !== botChannelId
        ) {
            const channel = oldState.channel
            if (!channel) return

            // ボット以外のメンバー（人間）の数を集計
            const humanCount = channel.members.filter((m) => !m.user.bot).size

            if (humanCount === 0) {
                const ttsSettings = await getTtsSettings(guildId)

                // 読み上げ設定があれば通知を送信
                if (ttsSettings?.text_channel_id) {
                    try {
                        const textChannel = (await client.channels.fetch(
                            ttsSettings.text_channel_id
                        )) as TextChannel
                        if (textChannel?.isTextBased()) {
                            await textChannel.send(
                                `<#${botChannelId}> に誰もいなくなったため、読み上げを終了します。`
                            )
                        }
                    } catch (e) {
                        console.error('[Auto Leave Notification Error]', e)
                    }
                }

                connection.destroy()
                await deleteTtsSettings(guildId)
            }
        }
    },
}
