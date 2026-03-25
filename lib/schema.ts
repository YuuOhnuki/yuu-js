import type { Pool } from 'pg'

/**
 * 全テーブルを初期化する。
 * bot起動時に一度だけ呼び出すこと。
 */
export async function initializeSchema(db: Pool): Promise<void> {
    const client = await db.connect()
    try {
        await client.query('BEGIN')

        // ─── サーバー設定 ─────────────────────────────────────────────────────────
        await client.query(`
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
            created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `)

        // ─── レベリング ───────────────────────────────────────────────────────────
        await client.query(`
        CREATE TABLE IF NOT EXISTS user_levels (
            id          SERIAL PRIMARY KEY,
            user_id     TEXT NOT NULL,
            guild_id    TEXT NOT NULL,
            xp          INTEGER NOT NULL DEFAULT 0,
            level       INTEGER NOT NULL DEFAULT 1,
            total_xp    BIGINT NOT NULL DEFAULT 0,
            last_xp_at  BIGINT NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, guild_id)
        )
    `)
        await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_levels_guild
        ON user_levels(guild_id, total_xp DESC)
    `)

        // ─── 経済システム ─────────────────────────────────────────────────────────
        await client.query(`
        CREATE TABLE IF NOT EXISTS user_economy (
            id              SERIAL PRIMARY KEY,
            user_id         TEXT NOT NULL,
            guild_id        TEXT NOT NULL,
            balance         BIGINT NOT NULL DEFAULT 0,
            total_earned    BIGINT NOT NULL DEFAULT 0,
            last_daily_date TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, guild_id)
        )
    `)
        await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_economy_guild
        ON user_economy(guild_id, balance DESC)
    `)

        // ─── メッセージ統計 ───────────────────────────────────────────────────────
        await client.query(`
        CREATE TABLE IF NOT EXISTS user_message_stats (
            id              SERIAL PRIMARY KEY,
            user_id         TEXT NOT NULL,
            guild_id        TEXT NOT NULL,
            message_count   INTEGER NOT NULL DEFAULT 0,
            last_message_at BIGINT NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, guild_id)
        )
    `)
        await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_message_stats_guild
        ON user_message_stats(guild_id, message_count DESC)
    `)

        // ─── チケット ─────────────────────────────────────────────────────────────
        await client.query(`
        CREATE TABLE IF NOT EXISTS ticket_panels (
            id                  SERIAL PRIMARY KEY,
            guild_id            TEXT NOT NULL,
            channel_id          TEXT NOT NULL,
            message_id          TEXT,
            panel_title         TEXT NOT NULL DEFAULT 'サポートチケット',
            panel_description   TEXT NOT NULL DEFAULT 'ボタンをクリックしてチケットを作成してください。',
            button_label        TEXT NOT NULL DEFAULT '🎫 チケットを作成',
            ticket_category_id  TEXT,
            cooldown_seconds    INTEGER NOT NULL DEFAULT 300,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guild_id, channel_id)
        )
    `)
        await client.query(`
        CREATE TABLE IF NOT EXISTS ticket_cooldowns (
            user_id         TEXT NOT NULL,
            guild_id        TEXT NOT NULL,
            last_created_at BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, guild_id)
        )
    `)

        // ─── ロールパネル ─────────────────────────────────────────────────────────
        await client.query(`
        CREATE TABLE IF NOT EXISTS role_panels (
            id              SERIAL PRIMARY KEY,
            guild_id        TEXT NOT NULL,
            channel_id      TEXT NOT NULL,
            message_id      TEXT,
            panel_title     TEXT NOT NULL,
            panel_description TEXT,
            panel_type      TEXT NOT NULL DEFAULT 'button',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `)
        await client.query(`
        CREATE INDEX IF NOT EXISTS idx_role_panels_guild
        ON role_panels(guild_id)
    `)
        await client.query(`
        CREATE TABLE IF NOT EXISTS role_panel_items (
            id          SERIAL PRIMARY KEY,
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
        await client.query(`
        CREATE TABLE IF NOT EXISTS quote_channels (
            id                      SERIAL PRIMARY KEY,
            channel_id              TEXT NOT NULL UNIQUE,
            guild_id                TEXT NOT NULL,
            channel_name            TEXT NOT NULL,
            registered_by_user_id   TEXT NOT NULL,
            registered_by_username  TEXT NOT NULL,
            last_sent_date          TEXT,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `)
        await client.query(`
        CREATE TABLE IF NOT EXISTS quotes (
            id                      SERIAL PRIMARY KEY,
            text                    TEXT NOT NULL,
            registered_by_user_id   TEXT NOT NULL,
            registered_by_username  TEXT NOT NULL,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `)

        // ─── TTS ─────────────────────────────────────────────────────────────
        await client.query(`
        CREATE TABLE IF NOT EXISTS tts_settings (
            guild_id        TEXT PRIMARY KEY,
            text_channel_id TEXT NOT NULL,
            voice_channel_id TEXT NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `)
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
    }
}
