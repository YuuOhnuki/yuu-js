/**
 * events/guildAuditLogEntryCreate.ts
 *
 * Discord の監査ログエントリが作成されるたびに発火し、
 * guild_settings.log_channel_id に設定されたチャンネルへ Embed を送信する。
 *
 * 必要な Intent: GuildModeration
 * 必要な権限:   ViewAuditLog
 */

import {
    Events,
    GuildAuditLogsEntry,
    AuditLogEvent,
    EmbedBuilder,
    Colors,
    Guild,
    type TextChannel,
} from 'discord.js'
import { getGuildSettings } from '../lib/db'

// ─── アクションマッピング ─────────────────────────────────────────────────────

interface ActionMeta {
    label: string
    color: number
    emoji: string
}

const ACTION_MAP: Partial<Record<AuditLogEvent, ActionMeta>> = {
    // ── メンバー ──────────────────────────────────────────────────────────────
    [AuditLogEvent.MemberBanAdd]: {
        label: 'メンバーBAN',
        color: Colors.Red,
        emoji: '🔨',
    },
    [AuditLogEvent.MemberBanRemove]: {
        label: 'BAN解除',
        color: Colors.Green,
        emoji: '🔓',
    },
    [AuditLogEvent.MemberKick]: {
        label: 'メンバーキック',
        color: Colors.Orange,
        emoji: '👢',
    },
    [AuditLogEvent.MemberUpdate]: {
        label: 'メンバー情報更新',
        color: Colors.Yellow,
        emoji: '✏️',
    },
    [AuditLogEvent.MemberRoleUpdate]: {
        label: 'メンバーロール変更',
        color: Colors.Blurple,
        emoji: '🎭',
    },
    [AuditLogEvent.MemberMove]: {
        label: 'メンバーVCを移動',
        color: Colors.DarkBlue,
        emoji: '🔄',
    },
    [AuditLogEvent.MemberDisconnect]: {
        label: 'メンバーVCを切断',
        color: Colors.DarkGrey,
        emoji: '🔌',
    },
    // ── チャンネル ────────────────────────────────────────────────────────────
    [AuditLogEvent.ChannelCreate]: {
        label: 'チャンネル作成',
        color: Colors.Green,
        emoji: '📝',
    },
    [AuditLogEvent.ChannelUpdate]: {
        label: 'チャンネル更新',
        color: Colors.Yellow,
        emoji: '📝',
    },
    [AuditLogEvent.ChannelDelete]: {
        label: 'チャンネル削除',
        color: Colors.Red,
        emoji: '🗑️',
    },
    [AuditLogEvent.ChannelOverwriteCreate]: {
        label: 'チャンネル権限設定追加',
        color: Colors.Blurple,
        emoji: '🔐',
    },
    [AuditLogEvent.ChannelOverwriteUpdate]: {
        label: 'チャンネル権限設定変更',
        color: Colors.Yellow,
        emoji: '🔐',
    },
    [AuditLogEvent.ChannelOverwriteDelete]: {
        label: 'チャンネル権限設定削除',
        color: Colors.Red,
        emoji: '🔐',
    },
    // ── ロール ────────────────────────────────────────────────────────────────
    [AuditLogEvent.RoleCreate]: {
        label: 'ロール作成',
        color: Colors.Green,
        emoji: '🎨',
    },
    [AuditLogEvent.RoleUpdate]: {
        label: 'ロール更新',
        color: Colors.Yellow,
        emoji: '🎨',
    },
    [AuditLogEvent.RoleDelete]: {
        label: 'ロール削除',
        color: Colors.Red,
        emoji: '🗑️',
    },
    // ── メッセージ ────────────────────────────────────────────────────────────
    [AuditLogEvent.MessageDelete]: {
        label: 'メッセージ削除',
        color: Colors.DarkRed,
        emoji: '🗑️',
    },
    [AuditLogEvent.MessageBulkDelete]: {
        label: 'メッセージ一括削除',
        color: Colors.DarkRed,
        emoji: '🗑️',
    },
    [AuditLogEvent.MessagePin]: {
        label: 'メッセージをピン留め',
        color: Colors.Gold,
        emoji: '📌',
    },
    [AuditLogEvent.MessageUnpin]: {
        label: 'ピン留めを解除',
        color: Colors.DarkGold,
        emoji: '📌',
    },
    // ── サーバー ──────────────────────────────────────────────────────────────
    [AuditLogEvent.GuildUpdate]: {
        label: 'サーバー設定変更',
        color: Colors.Yellow,
        emoji: '⚙️',
    },
    // ── 招待 ──────────────────────────────────────────────────────────────────
    [AuditLogEvent.InviteCreate]: {
        label: '招待リンク作成',
        color: Colors.Green,
        emoji: '🔗',
    },
    [AuditLogEvent.InviteDelete]: {
        label: '招待リンク削除',
        color: Colors.Red,
        emoji: '🔗',
    },
    // ── Webhook ───────────────────────────────────────────────────────────────
    [AuditLogEvent.WebhookCreate]: {
        label: 'Webhook 作成',
        color: Colors.Green,
        emoji: '🌐',
    },
    [AuditLogEvent.WebhookUpdate]: {
        label: 'Webhook 更新',
        color: Colors.Yellow,
        emoji: '🌐',
    },
    [AuditLogEvent.WebhookDelete]: {
        label: 'Webhook 削除',
        color: Colors.Red,
        emoji: '🌐',
    },
    // ── 絵文字 / スタンプ ─────────────────────────────────────────────────────
    [AuditLogEvent.EmojiCreate]: {
        label: '絵文字追加',
        color: Colors.Green,
        emoji: '😀',
    },
    [AuditLogEvent.EmojiUpdate]: {
        label: '絵文字更新',
        color: Colors.Yellow,
        emoji: '😀',
    },
    [AuditLogEvent.EmojiDelete]: {
        label: '絵文字削除',
        color: Colors.Red,
        emoji: '😀',
    },
    [AuditLogEvent.StickerCreate]: {
        label: 'スタンプ追加',
        color: Colors.Green,
        emoji: '🎫',
    },
    [AuditLogEvent.StickerUpdate]: {
        label: 'スタンプ更新',
        color: Colors.Yellow,
        emoji: '🎫',
    },
    [AuditLogEvent.StickerDelete]: {
        label: 'スタンプ削除',
        color: Colors.Red,
        emoji: '🎫',
    },
    // ── スレッド ──────────────────────────────────────────────────────────────
    [AuditLogEvent.ThreadCreate]: {
        label: 'スレッド作成',
        color: Colors.Green,
        emoji: '🧵',
    },
    [AuditLogEvent.ThreadUpdate]: {
        label: 'スレッド更新',
        color: Colors.Yellow,
        emoji: '🧵',
    },
    [AuditLogEvent.ThreadDelete]: {
        label: 'スレッド削除',
        color: Colors.Red,
        emoji: '🧵',
    },
    // ── タイムアウト（MemberUpdate の中に含まれるが独自ログでも検出） ──────────
    [AuditLogEvent.AutoModerationBlockMessage]: {
        label: 'AutoMod: メッセージブロック',
        color: Colors.Orange,
        emoji: '🤖',
    },
    [AuditLogEvent.AutoModerationFlagToChannel]: {
        label: 'AutoMod: チャンネルフラグ',
        color: Colors.Orange,
        emoji: '🤖',
    },
    [AuditLogEvent.AutoModerationUserCommunicationDisabled]: {
        label: 'AutoMod: ユーザーをタイムアウト',
        color: Colors.Red,
        emoji: '🤖',
    },
}

// ─── 変更フィールドのフォーマット ─────────────────────────────────────────────

function formatChange(key: string, oldVal: unknown, newVal: unknown): string {
    const fmt = (v: unknown): string => {
        if (v === null || v === undefined) return '_なし_'
        if (typeof v === 'boolean') return v ? '✅' : '❌'
        if (typeof v === 'object')
            return `\`${JSON.stringify(v).slice(0, 80)}\``
        return `\`${String(v).slice(0, 80)}\``
    }
    return `**${key}**: ${fmt(oldVal)} → ${fmt(newVal)}`
}

// ─── イベントハンドラー ───────────────────────────────────────────────────────

export default {
    name: Events.GuildAuditLogEntryCreate,

    async execute(entry: GuildAuditLogsEntry, guild: Guild) {
        try {
            const settings = await getGuildSettings(guild.id)
            if (!settings.log_channel_id) return

            const logChannel = guild.channels.cache.get(
                settings.log_channel_id
            ) as TextChannel | undefined
            if (!logChannel?.isTextBased()) return

            const meta = ACTION_MAP[entry.action as AuditLogEvent]
            // マッピングにないアクションはスキップ
            if (!meta) return

            // ── Embed 構築 ──────────────────────────────────────────────────
            const embed = new EmbedBuilder()
                .setColor(meta.color)
                .setTitle(`${meta.emoji} ${meta.label}`)
                .setTimestamp(entry.createdAt)

            // 実行者
            const executor = entry.executor
            if (executor) {
                embed.setAuthor({
                    name: executor.tag || '',
                    iconURL: executor.displayAvatarURL(),
                })
                embed.addFields({
                    name: '実行者',
                    value: `<@${executor.id}> (${executor.tag})`,
                    inline: true,
                })
            }

            // ターゲット（ユーザー・チャンネル・ロールなど）
            const target = entry.target
            if (target) {
                let targetDisplay = ''

                if ('tag' in target && typeof target.tag === 'string') {
                    // User
                    targetDisplay = `<@${'id' in target ? target.id : ''}> (${target.tag})`
                } else if (
                    'name' in target &&
                    typeof target.name === 'string'
                ) {
                    // Role / Channel / Guild
                    const id = 'id' in target ? target.id : ''
                    if ('color' in target) {
                        // Role
                        targetDisplay = `<@&${id}> (${target.name})`
                    } else if (
                        'type' in target &&
                        typeof (target as { type: unknown }).type === 'number'
                    ) {
                        // Channel
                        targetDisplay = `<#${id}> (${target.name})`
                    } else {
                        targetDisplay = `${target.name}`
                    }
                }

                if (targetDisplay) {
                    embed.addFields({
                        name: '対象',
                        value: targetDisplay,
                        inline: true,
                    })
                }
            }

            // 理由
            if (entry.reason) {
                embed.addFields({
                    name: '理由',
                    value: entry.reason,
                    inline: false,
                })
            }

            // 変更内容（最大 5 件）
            if (entry.changes && entry.changes.length > 0) {
                const changeLines = entry.changes
                    .slice(0, 5)
                    .map((c) => formatChange(c.key, c.old, c.new))

                embed.addFields({
                    name: `変更内容 (${entry.changes.length}件)`,
                    value: changeLines.join('\n') || '_情報なし_',
                    inline: false,
                })
            }

            // 追加情報（count など）
            const extra = entry.extra
            if (extra && typeof extra === 'object') {
                const extraStr = Object.entries(extra)
                    .filter(([, v]) => v !== null && v !== undefined)
                    .map(([k, v]) => `**${k}**: ${String(v).slice(0, 50)}`)
                    .join(', ')
                if (extraStr) {
                    embed.addFields({
                        name: '追加情報',
                        value: extraStr,
                        inline: false,
                    })
                }
            }

            embed.setFooter({ text: `Action ID: ${entry.id}` })

            await logChannel.send({ embeds: [embed] })
        } catch (err) {
            console.error('[guildAuditLogEntryCreate]', err)
        }
    },
}
