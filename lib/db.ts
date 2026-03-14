import { createClient, type Client, type InValue } from '@libsql/client'
import { initializeSchema } from './schema'
import type {
    ChannelRow,
    QuoteRow,
    GuildSettingsRow,
    UserLevelRow,
    UserEconomyRow,
    UserMessageStatRow,
    LevelUpResult,
    TransferResult,
    RankingEntry,
    TicketPanelRow,
    TicketCooldownRow,
    RolePanelRow,
    RolePanelItemRow,
} from '../types/db'

// ─── 再エクスポート ────────────────────────────────────────────────────────────
export type {
    ChannelRow,
    QuoteRow,
    GuildSettingsRow,
    UserLevelRow,
    UserEconomyRow,
    UserMessageStatRow,
    LevelUpResult,
    TransferResult,
    RankingEntry,
    TicketPanelRow,
    TicketCooldownRow,
    RolePanelRow,
    RolePanelItemRow,
}

// ─── ユーティリティ ───────────────────────────────────────────────────────────

const TIMEZONE = process.env.QUOTE_TIMEZONE ?? 'Asia/Tokyo'

export function getToday(): string {
    return new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE })
}

/** レベルに必要な累計XPを計算（レベル × 100） */
export function xpRequired(level: number): number {
    return level * 100
}

/** 累計XPからレベルを逆算 */
export function levelFromTotalXp(totalXp: number): {
    level: number
    xp: number
} {
    let level = 1
    let remaining = totalXp
    while (remaining >= xpRequired(level)) {
        remaining -= xpRequired(level)
        level++
    }
    return { level, xp: remaining }
}

// ─── DBクライアント ───────────────────────────────────────────────────────────

let _db: Client | null = null

function getDb(): Client {
    if (!_db) {
        const url = process.env.TURSO_DATABASE_URL
        const authToken = process.env.TURSO_AUTH_TOKEN
        if (
            url &&
            (url.startsWith('libsql://') || url.startsWith('https://'))
        ) {
            _db = createClient({ url, authToken: authToken || undefined })
        } else {
            _db = createClient({ url: 'file:./data/bot.db' })
        }
    }
    return _db
}

/**
 * スキーマを初期化する。
 * index.ts（bot起動時）で一度だけ呼び出すこと。
 *
 * @example
 * // index.ts
 * import { initDb } from './lib/db'
 * await initDb()
 */
export async function initDb(): Promise<void> {
    await initializeSchema(getDb())
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── サーバー設定 ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * サーバー設定を取得する。存在しない場合はデフォルト値で作成して返す。
 */
export async function getGuildSettings(
    guildId: string
): Promise<GuildSettingsRow> {
    const db = getDb()

    // UPSERT でレコードを保証する
    await db.execute({
        sql: `
            INSERT INTO guild_settings (guild_id)
            VALUES (:guild_id)
            ON CONFLICT(guild_id) DO NOTHING
        `,
        args: { guild_id: guildId },
    })

    const result = await db.execute({
        sql: `SELECT * FROM guild_settings WHERE guild_id = :guild_id`,
        args: { guild_id: guildId },
    })

    return result.rows[0] as unknown as GuildSettingsRow
}

/**
 * サーバー設定を部分的に更新する。
 * 更新したいフィールドだけを渡せばよい。
 *
 * @example
 * await updateGuildSettings(guildId, { support_role_id: '123456789' })
 */
export async function updateGuildSettings(
    guildId: string,
    patch: Partial<
        Omit<GuildSettingsRow, 'guild_id' | 'created_at' | 'updated_at'>
    >
): Promise<GuildSettingsRow> {
    const db = getDb()

    const entries = Object.entries(patch)
    if (entries.length === 0) return getGuildSettings(guildId)

    const setClauses = entries.map(([key]) => `${key} = :${key}`).join(', ')
    const args: Record<string, InValue> = { guild_id: guildId }
    for (const [key, value] of entries) {
        args[key] = value as InValue
    }

    await db.execute({
        sql: `
            UPDATE guild_settings
            SET ${setClauses}, updated_at = datetime('now')
            WHERE guild_id = :guild_id
        `,
        args,
    })

    return getGuildSettings(guildId)
}

/** XPブラックリストチャンネルを取得 */
export async function getXpBlacklistChannels(
    guildId: string
): Promise<string[]> {
    const settings = await getGuildSettings(guildId)
    try {
        return JSON.parse(settings.xp_blacklist_channels) as string[]
    } catch {
        return []
    }
}

/** XPブラックリストチャンネルを更新 */
export async function setXpBlacklistChannels(
    guildId: string,
    channelIds: string[]
): Promise<void> {
    await updateGuildSettings(guildId, {
        xp_blacklist_channels: JSON.stringify(channelIds),
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── レベリング ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ユーザーのレベルデータを取得する。存在しない場合は初期値で作成して返す。
 */
export async function getUserLevel(
    userId: string,
    guildId: string
): Promise<UserLevelRow> {
    const db = getDb()

    await db.execute({
        sql: `
            INSERT INTO user_levels (user_id, guild_id)
            VALUES (:user_id, :guild_id)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        `,
        args: { user_id: userId, guild_id: guildId },
    })

    const result = await db.execute({
        sql: `SELECT * FROM user_levels WHERE user_id = :user_id AND guild_id = :guild_id`,
        args: { user_id: userId, guild_id: guildId },
    })

    return result.rows[0] as unknown as UserLevelRow
}

/**
 * XPを追加する。クールダウン・レベルアップ判定も行う。
 *
 * メッセージイベントで呼び出す。
 * XP量はサーバー設定の xp_multiplier が適用される。
 *
 * @returns LevelUpResult — leveled が true のときはレベルアップ通知を出すこと
 *
 * @example
 * // messageCreate イベント内
 * const result = await addXp(message.author.id, message.guildId!, baseXp)
 * if (result.leveled) {
 *   await message.channel.send(`🎉 レベルアップ！ Lv.${result.newLevel}`)
 * }
 */
export async function addXp(
    userId: string,
    guildId: string,
    baseXp: number
): Promise<LevelUpResult> {
    const db = getDb()
    const settings = await getGuildSettings(guildId)
    const data = await getUserLevel(userId, guildId)

    const now = Date.now()
    const cooldownMs = (settings.message_cooldown_seconds ?? 60) * 1000

    // XPクールダウン中はスキップ（XP取得なし）
    if (now - data.last_xp_at < cooldownMs) {
        return {
            leveled: false,
            oldLevel: data.level,
            newLevel: data.level,
            currentXp: data.xp,
            xpForNext: xpRequired(data.level),
        }
    }

    const gainedXp = Math.round(baseXp * (settings.xp_multiplier ?? 1.0))
    const newTotalXp = data.total_xp + gainedXp
    const { level: newLevel, xp: newXp } = levelFromTotalXp(newTotalXp)
    const leveled = newLevel > data.level

    await db.execute({
        sql: `
            UPDATE user_levels
            SET
                xp       = :xp,
                level    = :level,
                total_xp = :total_xp,
                last_xp_at = :last_xp_at,
                updated_at = datetime('now')
            WHERE user_id = :user_id AND guild_id = :guild_id
        `,
        args: {
            xp: newXp,
            level: newLevel,
            total_xp: newTotalXp,
            last_xp_at: now,
            user_id: userId,
            guild_id: guildId,
        },
    })

    return {
        leveled,
        oldLevel: data.level,
        newLevel,
        currentXp: newXp,
        xpForNext: xpRequired(newLevel),
    }
}

/**
 * サーバーのXPランキングを取得する（上位N件）。
 */
export async function getLevelRanking(
    guildId: string,
    limit = 10
): Promise<RankingEntry[]> {
    const db = getDb()

    const result = await db.execute({
        sql: `
            SELECT
                ROW_NUMBER() OVER (ORDER BY total_xp DESC) AS rank,
                user_id,
                total_xp,
                level,
                xp
            FROM user_levels
            WHERE guild_id = :guild_id
            ORDER BY total_xp DESC
            LIMIT :limit
        `,
        args: { guild_id: guildId, limit },
    })

    return result.rows as unknown as RankingEntry[]
}

/**
 * サーバー内のユーザーのXPランク順位を取得する。
 */
export async function getUserLevelRank(
    userId: string,
    guildId: string
): Promise<number> {
    const db = getDb()

    const result = await db.execute({
        sql: `
            SELECT COUNT(*) + 1 AS rank
            FROM user_levels
            WHERE guild_id = :guild_id
              AND total_xp > (
                  SELECT COALESCE(total_xp, 0)
                  FROM user_levels
                  WHERE user_id = :user_id AND guild_id = :guild_id
              )
        `,
        args: { guild_id: guildId, user_id: userId },
    })

    return Number(result.rows[0]?.rank ?? 1)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 経済システム ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ユーザーの残高データを取得する。存在しない場合は初期値で作成して返す。
 */
export async function getUserEconomy(
    userId: string,
    guildId: string
): Promise<UserEconomyRow> {
    const db = getDb()

    await db.execute({
        sql: `
            INSERT INTO user_economy (user_id, guild_id)
            VALUES (:user_id, :guild_id)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        `,
        args: { user_id: userId, guild_id: guildId },
    })

    const result = await db.execute({
        sql: `SELECT * FROM user_economy WHERE user_id = :user_id AND guild_id = :guild_id`,
        args: { user_id: userId, guild_id: guildId },
    })

    return result.rows[0] as unknown as UserEconomyRow
}

/**
 * デイリーボーナスを受け取る。
 *
 * @returns
 *   - `{ success: true, amount, newBalance }` — 受け取り成功
 *   - `{ success: false, nextAvailableDate }` — クールダウン中
 */
export async function claimDaily(
    userId: string,
    guildId: string
): Promise<
    | { success: true; amount: number; newBalance: number }
    | { success: false; nextAvailableDate: string }
> {
    const db = getDb()
    const settings = await getGuildSettings(guildId)
    const data = await getUserEconomy(userId, guildId)
    const today = getToday()

    if (data.last_daily_date === today) {
        // 翌日の日付を返す（JST基準）
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const nextDate = tomorrow.toLocaleDateString('sv-SE', {
            timeZone: TIMEZONE,
        })
        return { success: false, nextAvailableDate: nextDate }
    }

    const amount = settings.daily_amount ?? 200
    const newBalance = data.balance + amount

    await db.execute({
        sql: `
            UPDATE user_economy
            SET
                balance         = :balance,
                total_earned    = total_earned + :amount,
                last_daily_date = :today,
                updated_at      = datetime('now')
            WHERE user_id = :user_id AND guild_id = :guild_id
        `,
        args: {
            balance: newBalance,
            amount,
            today,
            user_id: userId,
            guild_id: guildId,
        },
    })

    return { success: true, amount, newBalance }
}

/**
 * ユーザー間でコインを送金する。
 */
export async function transferBalance(
    fromUserId: string,
    toUserId: string,
    guildId: string,
    amount: number
): Promise<TransferResult> {
    if (fromUserId === toUserId) {
        return { success: false, error: 'self_transfer' }
    }

    const db = getDb()
    const sender = await getUserEconomy(fromUserId, guildId)

    if (sender.balance < amount) {
        return {
            success: false,
            error: 'insufficient_balance',
            senderBalance: sender.balance,
        }
    }

    await getUserEconomy(toUserId, guildId) // 受取人レコードを保証

    await db.batch([
        {
            sql: `
                UPDATE user_economy
                SET balance = balance - :amount, updated_at = datetime('now')
                WHERE user_id = :user_id AND guild_id = :guild_id
            `,
            args: { amount, user_id: fromUserId, guild_id: guildId },
        },
        {
            sql: `
                UPDATE user_economy
                SET balance = balance + :amount, total_earned = total_earned + :amount, updated_at = datetime('now')
                WHERE user_id = :user_id AND guild_id = :guild_id
            `,
            args: { amount, user_id: toUserId, guild_id: guildId },
        },
    ])

    const [updatedSender, updatedReceiver] = await Promise.all([
        getUserEconomy(fromUserId, guildId),
        getUserEconomy(toUserId, guildId),
    ])

    return {
        success: true,
        senderBalance: updatedSender.balance,
        receiverBalance: updatedReceiver.balance,
    }
}

/**
 * 残高を直接加算・減算する（管理者コマンド・報酬付与用）。
 * amount が負の場合は減算（残高が 0 未満にはならない）。
 */
export async function modifyBalance(
    userId: string,
    guildId: string,
    amount: number
): Promise<number> {
    const db = getDb()
    await getUserEconomy(userId, guildId) // レコードを保証

    if (amount > 0) {
        await db.execute({
            sql: `
                UPDATE user_economy
                SET balance = balance + :amount, total_earned = total_earned + :amount, updated_at = datetime('now')
                WHERE user_id = :user_id AND guild_id = :guild_id
            `,
            args: { amount, user_id: userId, guild_id: guildId },
        })
    } else {
        await db.execute({
            sql: `
                UPDATE user_economy
                SET balance = MAX(0, balance + :amount), updated_at = datetime('now')
                WHERE user_id = :user_id AND guild_id = :guild_id
            `,
            args: { amount, user_id: userId, guild_id: guildId },
        })
    }

    const updated = await getUserEconomy(userId, guildId)
    return updated.balance
}

/**
 * サーバーの経済ランキングを取得する（上位N件）。
 */
export async function getEconomyRanking(
    guildId: string,
    limit = 10
): Promise<RankingEntry[]> {
    const db = getDb()

    const result = await db.execute({
        sql: `
            SELECT
                ROW_NUMBER() OVER (ORDER BY balance DESC) AS rank,
                user_id,
                balance
            FROM user_economy
            WHERE guild_id = :guild_id
            ORDER BY balance DESC
            LIMIT :limit
        `,
        args: { guild_id: guildId, limit },
    })

    return result.rows as unknown as RankingEntry[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── メッセージ統計・ランキング ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * メッセージを1カウントする。
 *
 * 以下の条件を満たす場合のみカウント（スパム・ノイズを除外）：
 *  1. メッセージ長がサーバー設定の min_message_length 以上
 *  2. URLのみのメッセージでない
 *  3. 絵文字のみのメッセージでない
 *  4. 連続投稿クールダウン（message_cooldown_seconds）を経過している
 *
 * @returns カウントされた場合は true、スキップされた場合は false
 */
export async function recordMessage(
    userId: string,
    guildId: string,
    messageContent: string,
    channelId: string
): Promise<boolean> {
    const db = getDb()
    const settings = await getGuildSettings(guildId)

    // ─── フィルタリング ─────────────────────────────────────────────────────

    // XPブラックリストチャンネルはカウント対象外
    const blacklist = await getXpBlacklistChannels(guildId)
    if (blacklist.includes(channelId)) return false

    const minLen = settings.min_message_length ?? 5
    const cooldownMs = (settings.message_cooldown_seconds ?? 60) * 1000

    const cleaned = messageContent.trim()

    // 最小文字数チェック
    if (cleaned.length < minLen) return false

    // URLのみのメッセージを除外
    const urlOnly = /^(https?:\/\/\S+\s*)+$/.test(cleaned)
    if (urlOnly) return false

    // カスタム絵文字・Unicode絵文字のみを除外
    const withoutEmoji = cleaned
        .replace(/<a?:\w+:\d+>/g, '') // カスタム絵文字
        .replace(/\p{Emoji_Presentation}/gu, '') // Unicode絵文字
        .trim()
    if (withoutEmoji.length === 0) return false

    // ─── クールダウン＆カウント ─────────────────────────────────────────────

    // 現在のレコードを取得（存在保証）
    await db.execute({
        sql: `
            INSERT INTO user_message_stats (user_id, guild_id)
            VALUES (:user_id, :guild_id)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        `,
        args: { user_id: userId, guild_id: guildId },
    })

    const statResult = await db.execute({
        sql: `SELECT last_message_at FROM user_message_stats WHERE user_id = :user_id AND guild_id = :guild_id`,
        args: { user_id: userId, guild_id: guildId },
    })

    const lastAt = Number(statResult.rows[0]?.last_message_at ?? 0)
    const now = Date.now()

    // クールダウン中はカウントしない
    if (now - lastAt < cooldownMs) return false

    await db.execute({
        sql: `
            UPDATE user_message_stats
            SET
                message_count   = message_count + 1,
                last_message_at = :now,
                updated_at      = datetime('now')
            WHERE user_id = :user_id AND guild_id = :guild_id
        `,
        args: { now, user_id: userId, guild_id: guildId },
    })

    return true
}

/**
 * ユーザーのメッセージ統計を取得する。
 */
export async function getUserMessageStat(
    userId: string,
    guildId: string
): Promise<UserMessageStatRow> {
    const db = getDb()

    await db.execute({
        sql: `
            INSERT INTO user_message_stats (user_id, guild_id)
            VALUES (:user_id, :guild_id)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        `,
        args: { user_id: userId, guild_id: guildId },
    })

    const result = await db.execute({
        sql: `SELECT * FROM user_message_stats WHERE user_id = :user_id AND guild_id = :guild_id`,
        args: { user_id: userId, guild_id: guildId },
    })

    return result.rows[0] as unknown as UserMessageStatRow
}

/**
 * サーバーのメッセージ数ランキングを取得する（上位N件）。
 */
export async function getMessageRanking(
    guildId: string,
    limit = 10
): Promise<RankingEntry[]> {
    const db = getDb()

    const result = await db.execute({
        sql: `
            SELECT
                ROW_NUMBER() OVER (ORDER BY message_count DESC) AS rank,
                user_id,
                message_count
            FROM user_message_stats
            WHERE guild_id = :guild_id
            ORDER BY message_count DESC
            LIMIT :limit
        `,
        args: { guild_id: guildId, limit },
    })

    return result.rows as unknown as RankingEntry[]
}

/**
 * サーバー内のメッセージ数ランク順位を取得する。
 */
export async function getUserMessageRank(
    userId: string,
    guildId: string
): Promise<number> {
    const db = getDb()

    const result = await db.execute({
        sql: `
            SELECT COUNT(*) + 1 AS rank
            FROM user_message_stats
            WHERE guild_id = :guild_id
              AND message_count > (
                  SELECT COALESCE(message_count, 0)
                  FROM user_message_stats
                  WHERE user_id = :user_id AND guild_id = :guild_id
              )
        `,
        args: { guild_id: guildId, user_id: userId },
    })

    return Number(result.rows[0]?.rank ?? 1)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 既存機能（Quotes） ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export async function getChannels(guildId: string): Promise<ChannelRow[]> {
    const db = getDb()
    const result = await db.execute({
        sql: `SELECT * FROM quote_channels WHERE guild_id = :guild_id`,
        args: { guild_id: guildId },
    })
    return result.rows as unknown as ChannelRow[]
}

export async function getChannel(
    channelId: string
): Promise<ChannelRow | null> {
    const db = getDb()
    const result = await db.execute({
        sql: `SELECT * FROM quote_channels WHERE channel_id = :channel_id`,
        args: { channel_id: channelId },
    })
    return (result.rows[0] as unknown as ChannelRow) ?? null
}

export async function addChannel(
    channelId: string,
    guildId: string,
    channelName: string,
    userId: string,
    username: string
): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `
            INSERT INTO quote_channels (channel_id, guild_id, channel_name, registered_by_user_id, registered_by_username)
            VALUES (:channel_id, :guild_id, :channel_name, :user_id, :username)
            ON CONFLICT(channel_id) DO UPDATE SET
                channel_name = :channel_name,
                registered_by_user_id = :user_id,
                registered_by_username = :username
        `,
        args: {
            channel_id: channelId,
            guild_id: guildId,
            channel_name: channelName,
            user_id: userId,
            username,
        },
    })
}

export async function removeChannel(channelId: string): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `DELETE FROM quote_channels WHERE channel_id = :channel_id`,
        args: { channel_id: channelId },
    })
}

export async function updateLastSentDate(
    channelId: string,
    date: string
): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `UPDATE quote_channels SET last_sent_date = :date WHERE channel_id = :channel_id`,
        args: { date, channel_id: channelId },
    })
}

export async function getQuotes(): Promise<QuoteRow[]> {
    const db = getDb()
    const result = await db.execute(`SELECT * FROM quotes ORDER BY RANDOM()`)
    return result.rows as unknown as QuoteRow[]
}

export async function addQuote(
    text: string,
    userId: string,
    username: string
): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `INSERT INTO quotes (text, registered_by_user_id, registered_by_username) VALUES (:text, :user_id, :username)`,
        args: { text, user_id: userId, username },
    })
}

export async function removeQuote(id: number): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `DELETE FROM quotes WHERE id = :id`,
        args: { id },
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── チケット ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/** チケットパネルをUPSERTして返す */
export async function upsertTicketPanel(
    guildId: string,
    channelId: string,
    patch: Partial<
        Omit<
            TicketPanelRow,
            'id' | 'guild_id' | 'channel_id' | 'created_at' | 'updated_at'
        >
    >
): Promise<TicketPanelRow> {
    const db = getDb()

    await db.execute({
        sql: `
            INSERT INTO ticket_panels (guild_id, channel_id)
            VALUES (:guild_id, :channel_id)
            ON CONFLICT(guild_id, channel_id) DO NOTHING
        `,
        args: { guild_id: guildId, channel_id: channelId },
    })

    const entries = Object.entries(patch)
    if (entries.length > 0) {
        const setClauses = entries.map(([k]) => `${k} = :${k}`).join(', ')
        const args: Record<string, InValue> = {
            guild_id: guildId,
            channel_id: channelId,
        }
        for (const [k, v] of entries) args[k] = v as InValue
        await db.execute({
            sql: `UPDATE ticket_panels SET ${setClauses}, updated_at = datetime('now') WHERE guild_id = :guild_id AND channel_id = :channel_id`,
            args,
        })
    }

    const result = await db.execute({
        sql: `SELECT * FROM ticket_panels WHERE guild_id = :guild_id AND channel_id = :channel_id`,
        args: { guild_id: guildId, channel_id: channelId },
    })
    return result.rows[0] as unknown as TicketPanelRow
}

/** IDでチケットパネルを取得 */
export async function getTicketPanelById(
    panelId: number
): Promise<TicketPanelRow | null> {
    const db = getDb()
    const result = await db.execute({
        sql: `SELECT * FROM ticket_panels WHERE id = :id`,
        args: { id: panelId },
    })
    return result.rows[0] ? (result.rows[0] as unknown as TicketPanelRow) : null
}

/** ギルドのチケットパネル一覧 */
export async function getTicketPanelsByGuild(
    guildId: string
): Promise<TicketPanelRow[]> {
    const db = getDb()
    const result = await db.execute({
        sql: `SELECT * FROM ticket_panels WHERE guild_id = :guild_id ORDER BY id`,
        args: { guild_id: guildId },
    })
    return result.rows as unknown as TicketPanelRow[]
}

/** パネルのmessage_idを更新 */
export async function updateTicketPanelMessageId(
    panelId: number,
    messageId: string
): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `UPDATE ticket_panels SET message_id = :message_id, updated_at = datetime('now') WHERE id = :id`,
        args: { message_id: messageId, id: panelId },
    })
}

/** チケットパネルを削除 */
export async function deleteTicketPanel(panelId: number): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `DELETE FROM ticket_panels WHERE id = :id`,
        args: { id: panelId },
    })
}

/**
 * チケット作成クールダウンチェック。
 * @returns { allowed: true } or { allowed: false, remainingMs: number }
 */
export async function checkTicketCooldown(
    userId: string,
    guildId: string,
    cooldownSeconds: number
): Promise<{ allowed: boolean; remainingMs?: number }> {
    const db = getDb()
    const now = Date.now()
    const cooldownMs = cooldownSeconds * 1000

    let lastAt = 0
    try {
        const result = await db.execute({
            sql: `SELECT last_created_at FROM ticket_cooldowns WHERE user_id = :user_id AND guild_id = :guild_id`,
            args: { user_id: userId, guild_id: guildId },
        })
        if (result.rows[0]) lastAt = Number(result.rows[0].last_created_at)
    } catch {
        /* 行なし */
    }

    const diff = now - lastAt
    if (diff < cooldownMs)
        return { allowed: false, remainingMs: cooldownMs - diff }
    return { allowed: true }
}

/** チケットクールダウンを更新 */
export async function updateTicketCooldown(
    userId: string,
    guildId: string
): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `
            INSERT INTO ticket_cooldowns (user_id, guild_id, last_created_at)
            VALUES (:user_id, :guild_id, :now)
            ON CONFLICT(user_id, guild_id) DO UPDATE SET last_created_at = :now
        `,
        args: { user_id: userId, guild_id: guildId, now: Date.now() },
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ロールパネル ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/** ロールパネルを作成 */
export async function createRolePanel(
    guildId: string,
    channelId: string,
    title: string,
    panelType: 'button' | 'select'
): Promise<RolePanelRow> {
    const db = getDb()
    const result = await db.execute({
        sql: `
            INSERT INTO role_panels (guild_id, channel_id, panel_title, panel_type)
            VALUES (:guild_id, :channel_id, :title, :panel_type)
            RETURNING *
        `,
        args: {
            guild_id: guildId,
            channel_id: channelId,
            title,
            panel_type: panelType,
        },
    })
    return result.rows[0] as unknown as RolePanelRow
}

/** IDでロールパネルを取得 */
export async function getRolePanelById(
    panelId: number
): Promise<RolePanelRow | null> {
    const db = getDb()
    const result = await db.execute({
        sql: `SELECT * FROM role_panels WHERE id = :id`,
        args: { id: panelId },
    })
    return result.rows[0] ? (result.rows[0] as unknown as RolePanelRow) : null
}

/** ギルドのロールパネル一覧 */
export async function getRolePanelsByGuild(
    guildId: string
): Promise<RolePanelRow[]> {
    const db = getDb()
    const result = await db.execute({
        sql: `SELECT * FROM role_panels WHERE guild_id = :guild_id ORDER BY id`,
        args: { guild_id: guildId },
    })
    return result.rows as unknown as RolePanelRow[]
}

/** ロールパネルのmessage_idを更新 */
export async function updateRolePanelMessageId(
    panelId: number,
    messageId: string
): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `UPDATE role_panels SET message_id = :message_id, updated_at = datetime('now') WHERE id = :id`,
        args: { message_id: messageId, id: panelId },
    })
}

/** ロールパネルを削除（アイテムも CASCADE で削除） */
export async function deleteRolePanel(panelId: number): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `DELETE FROM role_panels WHERE id = :id`,
        args: { id: panelId },
    })
}

/** ロールパネルにロールを追加 */
export async function addRolePanelItem(
    panelId: number,
    roleId: string,
    label: string,
    emoji: string | null,
    description: string | null
): Promise<RolePanelItemRow> {
    const db = getDb()
    // position = 現在の最大 + 1
    const posResult = await db.execute({
        sql: `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM role_panel_items WHERE panel_id = :panel_id`,
        args: { panel_id: panelId },
    })
    const position = Number(posResult.rows[0]?.next_pos ?? 0)

    const result = await db.execute({
        sql: `
            INSERT INTO role_panel_items (panel_id, role_id, label, emoji, description, position)
            VALUES (:panel_id, :role_id, :label, :emoji, :description, :position)
            ON CONFLICT(panel_id, role_id) DO UPDATE SET
                label = :label, emoji = :emoji, description = :description, updated_at = datetime('now')
            RETURNING *
        `,
        args: {
            panel_id: panelId,
            role_id: roleId,
            label,
            emoji: emoji ?? null,
            description: description ?? null,
            position,
        },
    })
    return result.rows[0] as unknown as RolePanelItemRow
}

/** ロールパネルからロールを削除 */
export async function removeRolePanelItem(
    panelId: number,
    roleId: string
): Promise<void> {
    const db = getDb()
    await db.execute({
        sql: `DELETE FROM role_panel_items WHERE panel_id = :panel_id AND role_id = :role_id`,
        args: { panel_id: panelId, role_id: roleId },
    })
}

/** ロールパネルのアイテム一覧（position順） */
export async function getRolePanelItems(
    panelId: number
): Promise<RolePanelItemRow[]> {
    const db = getDb()
    const result = await db.execute({
        sql: `SELECT * FROM role_panel_items WHERE panel_id = :panel_id ORDER BY position`,
        args: { panel_id: panelId },
    })
    return result.rows as unknown as RolePanelItemRow[]
}
