import { Events, Message, TextChannel } from 'discord.js'
import { createInfoEmbed } from '../lib/embed'
import {
    addXp,
    recordMessage,
    getGuildSettings,
    getTtsSettings,
    getUserTtsPresets,
} from '../lib/db'
import {
    getVoiceConnection,
    createAudioPlayer,
    NoSubscriberBehavior,
    AudioPlayerStatus,
    AudioResource,
} from '@discordjs/voice'
import { generateAudio } from '../lib/voicevox'

/** メッセージ1件あたりの基本XP量（ランダム性を持たせる） */
function randomXp(min = 15, max = 25): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

// ─── TTS キュー管理 ──────────────────────────────────────────────────

interface QueuedText {
    text: string
    userId: string
}

interface QueuedResource {
    text: string
    resource: AudioResource
}

interface TTSState {
    player: ReturnType<typeof createAudioPlayer>
    textQueue: QueuedText[]
    resourceQueue: QueuedResource[]
    isProcessing: boolean
}

const ttsStates = new Map<string, TTSState>()
const MAX_TEXT_LENGTH = 100

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
                let state = ttsStates.get(guildId)
                if (!state) {
                    const player = createAudioPlayer({
                        behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
                    })
                    state = {
                        player,
                        textQueue: [],
                        resourceQueue: [],
                        isProcessing: false,
                    }
                    connection.subscribe(player)
                    ttsStates.set(guildId, state)

                    player.on(AudioPlayerStatus.Idle, () => {
                        playNext(guildId)
                    })
                }

                const cleanText = content
                    .replace(/<a?:\w+:\d+>/g, '')
                    .replace(/https?:\/\/[\s\S]+/g, 'URL')
                    .trim()

                if (cleanText.length > 0) {
                    const chunks = splitText(cleanText, MAX_TEXT_LENGTH)
                    state.textQueue.push(
                        ...chunks.map((chunk) => ({ text: chunk, userId }))
                    )

                    if (!state.isProcessing) {
                        fillResourceQueue(guildId)
                    }
                }
            } else {
                // 接続がない場合は状態をクリア
                ttsStates.delete(guildId)
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

            const embed = createInfoEmbed()
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
                .send({ embeds: [embed] })
                .catch(console.error)
        }
    },
}

function splitText(text: string, maxLength: number): string[] {
    const regex = new RegExp(`.{1,${maxLength}}`, 'g')
    return text.match(regex) || [text]
}

async function fillResourceQueue(guildId: string) {
    const state = ttsStates.get(guildId)
    if (!state || state.textQueue.length === 0) {
        if (state) state.isProcessing = false
        return
    }

    state.isProcessing = true
    const item = state.textQueue.shift()

    try {
        if (item) {
            // ユーザー個別のプリセットを取得
            const userPreset = await getUserTtsPresets(item.userId)
            // VOICEVOXのpreset_idは32bit整数である必要があるため、巨大な数値（Snowflake等）は無視する
            const validPresetId =
                userPreset?.preset_id &&
                Number(userPreset.preset_id) < 2147483647
                    ? Number(userPreset.preset_id)
                    : undefined

            const resource = await generateAudio(
                item.text,
                userPreset?.style_id ?? 3, // 設定がなければデフォルト(ずんだもん)
                validPresetId
            )
            state.resourceQueue.push({ text: item.text, resource })

            // 再生中でなければ開始
            if (state.player.state.status === AudioPlayerStatus.Idle) {
                playNext(guildId)
            }
        }
    } catch (error) {
        console.error('[TTS Prefetch Error]', error)
    }

    // 再帰的に次のテキストを処理（プリフェッチ）
    if (state.textQueue.length > 0) {
        fillResourceQueue(guildId)
    } else {
        state.isProcessing = false
    }
}

function playNext(guildId: string) {
    const state = ttsStates.get(guildId)
    if (!state || state.resourceQueue.length === 0) return

    // プレイヤーが既に何かを再生中の場合は Idle イベントを待つ
    if (state.player.state.status !== AudioPlayerStatus.Idle) return

    const item = state.resourceQueue.shift()
    if (item) {
        state.player.play(item.resource)
    }
}
