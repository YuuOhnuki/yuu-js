import { Pool, types } from 'pg'
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

// PostgresでBIGINTを数値として扱う（デフォルトは文字列）
types.setTypeParser(types.builtins.INT8, (val) => parseInt(val, 10))
types.setTypeParser(types.builtins.NUMERIC, (val) => parseFloat(val))

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

let _pool: Pool | null = null

function getDb(): Pool {
    if (!_pool) {
        const connectionString = process.env.DATABASE_URL
        if (!connectionString) {
            throw new Error('DATABASE_URL is not defined in .env')
        }
        _pool = new Pool({ connectionString })
    }
    return _pool
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
    const pool = getDb()

    // UPSERT でレコードを保証する
    await pool.query(
        `
            INSERT INTO guild_settings (guild_id)
            VALUES ($1)
            ON CONFLICT(guild_id) DO NOTHING
        `,
        [guildId]
    )

    const result = await pool.query(
        `SELECT * FROM guild_settings WHERE guild_id = $1`,
        [guildId]
    )

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
    const pool = getDb()

    const entries = Object.entries(patch)
    if (entries.length === 0) return getGuildSettings(guildId)

    // $1はguild_id, $2以降が更新値
    const setClauses = entries
        .map(([key], i) => `${key} = $${i + 2}`)
        .join(', ')
    const values = [guildId, ...entries.map(([, v]) => v)]

    await pool.query(
        `
            UPDATE guild_settings
            SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = $1
        `,
        values
    )

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
    const pool = getDb()

    await pool.query(
        `
            INSERT INTO user_levels (user_id, guild_id)
            VALUES ($1, $2)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        `,
        [userId, guildId]
    )

    const result = await pool.query(
        `SELECT * FROM user_levels WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
    )

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
    const pool = getDb()
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

    await pool.query(
        `
            UPDATE user_levels
            SET
                xp       = $1,
                level    = $2,
                total_xp = $3,
                last_xp_at = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $5 AND guild_id = $6
        `,
        [newXp, newLevel, newTotalXp, now, userId, guildId]
    )

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
    const pool = getDb()

    const result = await pool.query(
        `
            SELECT
                ROW_NUMBER() OVER (ORDER BY total_xp DESC) AS rank,
                user_id,
                total_xp,
                level,
                xp
            FROM user_levels
            WHERE guild_id = $1
            ORDER BY total_xp DESC
            LIMIT $2
        `,
        [guildId, limit]
    )

    return result.rows as unknown as RankingEntry[]
}

/**
 * サーバー内のユーザーのXPランク順位を取得する。
 */
export async function getUserLevelRank(
    userId: string,
    guildId: string
): Promise<number> {
    const pool = getDb()

    const result = await pool.query(
        `
            SELECT COUNT(*) + 1 AS rank
            FROM user_levels
            WHERE guild_id = $1
              AND total_xp > (
                  SELECT COALESCE(total_xp, 0)
                FROM user_levels
                WHERE user_id = $2 AND guild_id = $1
              )
        `,
        [guildId, userId]
    )

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
    const pool = getDb()

    await pool.query(
        `
            INSERT INTO user_economy (user_id, guild_id)
            VALUES ($1, $2)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        `,
        [userId, guildId]
    )

    const result = await pool.query(
        `SELECT * FROM user_economy WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
    )

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
    const pool = getDb()
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

    await pool.query(
        `
            UPDATE user_economy
            SET
                balance         = $1,
                total_earned    = total_earned + $2,
                last_daily_date = $3,
                updated_at      = CURRENT_TIMESTAMP
            WHERE user_id = $4 AND guild_id = $5
        `,
        [newBalance, amount, today, userId, guildId]
    )

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

    const pool = getDb()
    const sender = await getUserEconomy(fromUserId, guildId)

    if (sender.balance < amount) {
        return {
            success: false,
            error: 'insufficient_balance',
            senderBalance: sender.balance,
        }
    }

    await getUserEconomy(toUserId, guildId) // 受取人レコードを保証

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        // 送金元
        await client.query(
            `
            UPDATE user_economy
            SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2 AND guild_id = $3
            `,
            [amount, fromUserId, guildId]
        )

        // 送金先
        await client.query(
            `
            UPDATE user_economy
            SET balance = balance + $1, total_earned = total_earned + $1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2 AND guild_id = $3
            `,
            [amount, toUserId, guildId]
        )

        await client.query('COMMIT')
    } catch (e) {
        await client.query('ROLLBACK')
        throw e
    } finally {
        client.release()
    }

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
    const pool = getDb()
    await getUserEconomy(userId, guildId) // レコードを保証

    if (amount > 0) {
        await pool.query(
            `
                UPDATE user_economy
                SET balance = balance + $1, total_earned = total_earned + $1, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2 AND guild_id = $3
            `,
            [amount, userId, guildId]
        )
    } else {
        await pool.query(
            `
                UPDATE user_economy
                SET balance = GREATEST(0, balance + $1), updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2 AND guild_id = $3
            `,
            [amount, userId, guildId]
        )
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
    const pool = getDb()

    const result = await pool.query(
        `
            SELECT
                ROW_NUMBER() OVER (ORDER BY balance DESC) AS rank,
                user_id,
                balance
            FROM user_economy
            WHERE guild_id = $1
            ORDER BY balance DESC
            LIMIT $2
        `,
        [guildId, limit]
    )

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
    const pool = getDb()
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
    await pool.query(
        `
            INSERT INTO user_message_stats (user_id, guild_id)
            VALUES ($1, $2)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        `,
        [userId, guildId]
    )

    const statResult = await pool.query(
        `SELECT last_message_at FROM user_message_stats WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
    )

    const lastAt = Number(statResult.rows[0]?.last_message_at ?? 0)
    const now = Date.now()

    // クールダウン中はカウントしない
    if (now - lastAt < cooldownMs) return false

    await pool.query(
        `
            UPDATE user_message_stats
            SET
                message_count   = message_count + 1,
                last_message_at = $1,
                updated_at      = CURRENT_TIMESTAMP
            WHERE user_id = $2 AND guild_id = $3
        `,
        [now, userId, guildId]
    )

    return true
}

/**
 * ユーザーのメッセージ統計を取得する。
 */
export async function getUserMessageStat(
    userId: string,
    guildId: string
): Promise<UserMessageStatRow> {
    const pool = getDb()

    await pool.query(
        `
            INSERT INTO user_message_stats (user_id, guild_id)
            VALUES ($1, $2)
            ON CONFLICT(user_id, guild_id) DO NOTHING
        `,
        [userId, guildId]
    )

    const result = await pool.query(
        `SELECT * FROM user_message_stats WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
    )

    return result.rows[0] as unknown as UserMessageStatRow
}

/**
 * サーバーのメッセージ数ランキングを取得する（上位N件）。
 */
export async function getMessageRanking(
    guildId: string,
    limit = 10
): Promise<RankingEntry[]> {
    const pool = getDb()

    const result = await pool.query(
        `
            SELECT
                ROW_NUMBER() OVER (ORDER BY message_count DESC) AS rank,
                user_id,
                message_count
            FROM user_message_stats
            WHERE guild_id = $1
            ORDER BY message_count DESC
            LIMIT $2
        `,
        [guildId, limit]
    )

    return result.rows as unknown as RankingEntry[]
}

/**
 * サーバー内のメッセージ数ランク順位を取得する。
 */
export async function getUserMessageRank(
    userId: string,
    guildId: string
): Promise<number> {
    const pool = getDb()

    const result = await pool.query(
        `
            SELECT COUNT(*) + 1 AS rank
            FROM user_message_stats
            WHERE guild_id = $1
              AND message_count > (
                  SELECT COALESCE(message_count, 0)
                FROM user_message_stats
                WHERE user_id = $2 AND guild_id = $1
              )
        `,
        [guildId, userId]
    )

    return Number(result.rows[0]?.rank ?? 1)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 既存機能（Quotes） ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export async function getChannels(guildId: string): Promise<ChannelRow[]> {
    const pool = getDb()
    const result = await pool.query(
        `SELECT * FROM quote_channels WHERE guild_id = $1`,
        [guildId]
    )
    return result.rows as unknown as ChannelRow[]
}

export async function getChannel(
    channelId: string
): Promise<ChannelRow | null> {
    const pool = getDb()
    const result = await pool.query(
        `SELECT * FROM quote_channels WHERE channel_id = $1`,
        [channelId]
    )
    return (result.rows[0] as unknown as ChannelRow) ?? null
}

export async function addChannel(
    channelId: string,
    guildId: string,
    channelName: string,
    userId: string,
    username: string
): Promise<void> {
    const pool = getDb()
    await pool.query(
        `
            INSERT INTO quote_channels (channel_id, guild_id, channel_name, registered_by_user_id, registered_by_username)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(channel_id) DO UPDATE SET
                channel_name = $3,
                registered_by_user_id = $4,
                registered_by_username = $5
        `,
        [channelId, guildId, channelName, userId, username]
    )
}

export async function removeChannel(channelId: string): Promise<void> {
    const pool = getDb()
    await pool.query(`DELETE FROM quote_channels WHERE channel_id = $1`, [
        channelId,
    ])
}

export async function updateLastSentDate(
    channelId: string,
    date: string
): Promise<void> {
    const pool = getDb()
    await pool.query(
        `UPDATE quote_channels SET last_sent_date = $1 WHERE channel_id = $2`,
        [date, channelId]
    )
}

export async function getQuotes(): Promise<QuoteRow[]> {
    const pool = getDb()
    const result = await pool.query(`SELECT * FROM quotes ORDER BY RANDOM()`)
    return result.rows as unknown as QuoteRow[]
}

export async function addQuote(
    text: string,
    userId: string,
    username: string
): Promise<void> {
    const pool = getDb()
    await pool.query(
        `INSERT INTO quotes (text, registered_by_user_id, registered_by_username) VALUES ($1, $2, $3)`,
        [text, userId, username]
    )
}

export async function removeQuote(id: number): Promise<void> {
    const pool = getDb()
    await pool.query(`DELETE FROM quotes WHERE id = $1`, [id])
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
    const pool = getDb()

    await pool.query(
        `
            INSERT INTO ticket_panels (guild_id, channel_id)
            VALUES ($1, $2)
            ON CONFLICT(guild_id, channel_id) DO NOTHING
        `,
        [guildId, channelId]
    )

    const entries = Object.entries(patch)
    if (entries.length > 0) {
        const setClauses = entries
            .map(([k], i) => `${k} = $${i + 3}`)
            .join(', ')
        const values = [guildId, channelId, ...entries.map(([, v]) => v)]
        await pool.query(
            `UPDATE ticket_panels SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE guild_id = $1 AND channel_id = $2`,
            values
        )
    }

    const result = await pool.query(
        `SELECT * FROM ticket_panels WHERE guild_id = $1 AND channel_id = $2`,
        [guildId, channelId]
    )
    return result.rows[0] as unknown as TicketPanelRow
}

/** IDでチケットパネルを取得 */
export async function getTicketPanelById(
    panelId: number
): Promise<TicketPanelRow | null> {
    const pool = getDb()
    const result = await pool.query(
        `SELECT * FROM ticket_panels WHERE id = $1`,
        [panelId]
    )
    return result.rows[0] ? (result.rows[0] as unknown as TicketPanelRow) : null
}

/** ギルドのチケットパネル一覧 */
export async function getTicketPanelsByGuild(
    guildId: string
): Promise<TicketPanelRow[]> {
    const pool = getDb()
    const result = await pool.query(
        `SELECT * FROM ticket_panels WHERE guild_id = $1 ORDER BY id`,
        [guildId]
    )
    return result.rows as unknown as TicketPanelRow[]
}

/** パネルのmessage_idを更新 */
export async function updateTicketPanelMessageId(
    panelId: number,
    messageId: string
): Promise<void> {
    const pool = getDb()
    await pool.query(
        `UPDATE ticket_panels SET message_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [messageId, panelId]
    )
}

/** チケットパネルを削除 */
export async function deleteTicketPanel(panelId: number): Promise<void> {
    const pool = getDb()
    await pool.query(`DELETE FROM ticket_panels WHERE id = $1`, [panelId])
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
    const pool = getDb()
    const now = Date.now()
    const cooldownMs = cooldownSeconds * 1000

    let lastAt = 0
    try {
        const result = await pool.query(
            `SELECT last_created_at FROM ticket_cooldowns WHERE user_id = $1 AND guild_id = $2`,
            [userId, guildId]
        )
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
    const pool = getDb()
    await pool.query(
        `
            INSERT INTO ticket_cooldowns (user_id, guild_id, last_created_at)
            VALUES ($1, $2, $3)
            ON CONFLICT(user_id, guild_id) DO UPDATE SET last_created_at = $3
        `,
        [userId, guildId, Date.now()]
    )
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
    const pool = getDb()
    const result = await pool.query(
        `
            INSERT INTO role_panels (guild_id, channel_id, panel_title, panel_type)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `,
        [guildId, channelId, title, panelType]
    )
    return result.rows[0] as unknown as RolePanelRow
}

/** IDでロールパネルを取得 */
export async function getRolePanelById(
    panelId: number
): Promise<RolePanelRow | null> {
    const pool = getDb()
    const result = await pool.query(`SELECT * FROM role_panels WHERE id = $1`, [
        panelId,
    ])
    return result.rows[0] ? (result.rows[0] as unknown as RolePanelRow) : null
}

/** ギルドのロールパネル一覧 */
export async function getRolePanelsByGuild(
    guildId: string
): Promise<RolePanelRow[]> {
    const pool = getDb()
    const result = await pool.query(
        `SELECT * FROM role_panels WHERE guild_id = $1 ORDER BY id`,
        [guildId]
    )
    return result.rows as unknown as RolePanelRow[]
}

/** ロールパネルのmessage_idを更新 */
export async function updateRolePanelMessageId(
    panelId: number,
    messageId: string
): Promise<void> {
    const pool = getDb()
    await pool.query(
        `UPDATE role_panels SET message_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [messageId, panelId]
    )
}

/** ロールパネルを削除（アイテムも CASCADE で削除） */
export async function deleteRolePanel(panelId: number): Promise<void> {
    const pool = getDb()
    await pool.query(`DELETE FROM role_panels WHERE id = $1`, [panelId])
}

/** ロールパネルにロールを追加 */
export async function addRolePanelItem(
    panelId: number,
    roleId: string,
    label: string,
    emoji: string | null,
    description: string | null
): Promise<RolePanelItemRow> {
    const pool = getDb()
    // position = 現在の最大 + 1
    const posResult = await pool.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM role_panel_items WHERE panel_id = $1`,
        [panelId]
    )
    const position = Number(posResult.rows[0]?.next_pos ?? 0)

    const result = await pool.query(
        `
            INSERT INTO role_panel_items (panel_id, role_id, label, emoji, description, position)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(panel_id, role_id) DO UPDATE SET
                label = $3, emoji = $4, description = $5
            RETURNING *
        `,
        [panelId, roleId, label, emoji ?? null, description ?? null, position]
    )
    return result.rows[0] as unknown as RolePanelItemRow
}

/** ロールパネルからロールを削除 */
export async function removeRolePanelItem(
    panelId: number,
    roleId: string
): Promise<void> {
    const pool = getDb()
    await pool.query(
        `DELETE FROM role_panel_items WHERE panel_id = $1 AND role_id = $2`,
        [panelId, roleId]
    )
}

/** ロールパネルのアイテム一覧（position順） */
export async function getRolePanelItems(
    panelId: number
): Promise<RolePanelItemRow[]> {
    const pool = getDb()
    const result = await pool.query(
        `SELECT * FROM role_panel_items WHERE panel_id = $1 ORDER BY position`,
        [panelId]
    )
    return result.rows as unknown as RolePanelItemRow[]
}
