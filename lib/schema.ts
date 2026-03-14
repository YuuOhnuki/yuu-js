import type { Client } from '@libsql/client'

/**
 * 全テーブルを初期化する。
 * bot起動時に一度だけ呼び出すこと。
 */
export async function initializeSchema(db: Client): Promise<void> {
    // ─── サーバー設定 ─────────────────────────────────────────────────────────
    await db.execute(`
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id                TEXT PRIMARY KEY,
            support_role_id         TEXT,
            moderator_role_id       TEXT,
            log_channel_id          TEXT,
            welcome_channel_id      TEXT,
            levelup_channel_id      TEXT,
            xp_blacklist_channels   TEXT NOT NULL DEFAULT '[]',
            levelup_notification    INTEGER NOT NULL DEFAULT 1,
            currency_name           TEXT NOT NULL DEFAULT 'コイン',
            currency_emoji          TEXT NOT NULL DEFAULT '🪙',
            daily_amount            INTEGER NOT NULL DEFAULT 200,
            xp_multiplier           REAL NOT NULL DEFAULT 1.0,
            min_message_length      INTEGER NOT NULL DEFAULT 5,
            message_cooldown_seconds INTEGER NOT NULL DEFAULT 60,
            created_at              TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)

    // ─── レベリング ───────────────────────────────────────────────────────────
    await db.execute(`
        CREATE TABLE IF NOT EXISTS user_levels (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL,
            guild_id    TEXT NOT NULL,
            xp          INTEGER NOT NULL DEFAULT 0,
            level       INTEGER NOT NULL DEFAULT 1,
            total_xp    INTEGER NOT NULL DEFAULT 0,
            last_xp_at  INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, guild_id)
        )
    `)
    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_user_levels_guild
        ON user_levels(guild_id, total_xp DESC)
    `)

    // ─── 経済システム ─────────────────────────────────────────────────────────
    await db.execute(`
        CREATE TABLE IF NOT EXISTS user_economy (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL,
            guild_id        TEXT NOT NULL,
            balance         INTEGER NOT NULL DEFAULT 0,
            total_earned    INTEGER NOT NULL DEFAULT 0,
            last_daily_date TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, guild_id)
        )
    `)
    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_user_economy_guild
        ON user_economy(guild_id, balance DESC)
    `)

    // ─── メッセージ統計 ───────────────────────────────────────────────────────
    await db.execute(`
        CREATE TABLE IF NOT EXISTS user_message_stats (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL,
            guild_id        TEXT NOT NULL,
            message_count   INTEGER NOT NULL DEFAULT 0,
            last_message_at INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, guild_id)
        )
    `)
    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_user_message_stats_guild
        ON user_message_stats(guild_id, message_count DESC)
    `)

    // ─── チケット ─────────────────────────────────────────────────────────────
    await db.execute(`
        CREATE TABLE IF NOT EXISTS ticket_panels (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id            TEXT NOT NULL,
            channel_id          TEXT NOT NULL,
            message_id          TEXT,
            panel_title         TEXT NOT NULL DEFAULT 'サポートチケット',
            panel_description   TEXT NOT NULL DEFAULT 'ボタンをクリックしてチケットを作成してください。',
            button_label        TEXT NOT NULL DEFAULT '🎫 チケットを作成',
            ticket_category_id  TEXT,
            cooldown_seconds    INTEGER NOT NULL DEFAULT 300,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(guild_id, channel_id)
        )
    `)
    await db.execute(`
        CREATE TABLE IF NOT EXISTS ticket_cooldowns (
            user_id         TEXT NOT NULL,
            guild_id        TEXT NOT NULL,
            last_created_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, guild_id)
        )
    `)

    // ─── ロールパネル ─────────────────────────────────────────────────────────
    await db.execute(`
        CREATE TABLE IF NOT EXISTS role_panels (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id        TEXT NOT NULL,
            channel_id      TEXT NOT NULL,
            message_id      TEXT,
            panel_title     TEXT NOT NULL,
            panel_description TEXT,
            panel_type      TEXT NOT NULL DEFAULT 'button',
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_role_panels_guild
        ON role_panels(guild_id)
    `)
    await db.execute(`
        CREATE TABLE IF NOT EXISTS role_panel_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            panel_id    INTEGER NOT NULL REFERENCES role_panels(id) ON DELETE CASCADE,
            role_id     TEXT NOT NULL,
            label       TEXT NOT NULL,
            emoji       TEXT,
            description TEXT,
            position    INTEGER NOT NULL DEFAULT 0,
            UNIQUE(panel_id, role_id)
        )
    `)

    // ─── 既存テーブル（Quotes） ───────────────────────────────────────────────
    await db.execute(`
        CREATE TABLE IF NOT EXISTS quote_channels (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id              TEXT NOT NULL UNIQUE,
            guild_id                TEXT NOT NULL,
            channel_name            TEXT NOT NULL,
            registered_by_user_id   TEXT NOT NULL,
            registered_by_username  TEXT NOT NULL,
            last_sent_date          TEXT,
            created_at              TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await db.execute(`
        CREATE TABLE IF NOT EXISTS quotes (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            text                    TEXT NOT NULL,
            registered_by_user_id   TEXT NOT NULL,
            registered_by_username  TEXT NOT NULL,
            created_at              TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
}
