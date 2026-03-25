// ─── 既存の型 ────────────────────────────────────────────────────────────────

export interface ChannelRow {
    id: number
    channel_id: string
    guild_id: string
    channel_name: string
    registered_by_user_id: string
    registered_by_username: string
    last_sent_date: string | null
    created_at: string
}

export interface QuoteRow {
    id: number
    text: string
    registered_by_user_id: string
    registered_by_username: string
    created_at: string
}

// ─── サーバー設定 ─────────────────────────────────────────────────────────────

export interface GuildSettingsRow {
    guild_id: string
    /** サポートロールのID（チケット等で使用） */
    support_role_id: string | null
    /** モデレーターロールのID */
    moderator_role_id: string | null
    /** ログチャンネルID（モデレーションログ等） */
    log_channel_id: string | null
    /** ウェルカムチャンネルID */
    welcome_channel_id: string | null
    /** レベルアップ通知チャンネルID（nullの場合はメッセージ送信チャンネル） */
    levelup_channel_id: string | null
    /** XP取得を無効にするチャンネルIDのJSON配列 */
    xp_blacklist_channels: string
    /** レベルアップ通知を有効にするか */
    levelup_notification: number
    /** 経済システムの通貨名 */
    currency_name: string
    /** 経済システムの通貨絵文字 */
    currency_emoji: string
    /** デイリーボーナス金額 */
    daily_amount: number
    /** XP倍率（BoostやPremiumサーバー向け） */
    xp_multiplier: number
    /** メッセージカウントの最小文字数（これ未満は無視） */
    min_message_length: number
    /** メッセージカウントのクールダウン（秒） */
    message_cooldown_seconds: number
    created_at: string
    updated_at: string
}

// ─── レベリング ───────────────────────────────────────────────────────────────

export interface UserLevelRow {
    id: number
    user_id: string
    guild_id: string
    xp: number
    level: number
    total_xp: number
    /** 最後にXPを獲得した時刻（UNIXミリ秒、クールダウン管理用） */
    last_xp_at: number
    created_at: string
    updated_at: string
}

export interface LevelUpResult {
    leveled: boolean
    oldLevel: number
    newLevel: number
    currentXp: number
    xpForNext: number
}

// ─── 経済システム ─────────────────────────────────────────────────────────────

export interface UserEconomyRow {
    id: number
    user_id: string
    guild_id: string
    balance: number
    total_earned: number
    /** 最後にデイリーを受け取った日（YYYY-MM-DD） */
    last_daily_date: string | null
    created_at: string
    updated_at: string
}

export interface TransferResult {
    success: boolean
    error?: 'insufficient_balance' | 'self_transfer'
    senderBalance?: number
    receiverBalance?: number
}

// ─── メッセージ統計・ランキング ────────────────────────────────────────────────

export interface UserMessageStatRow {
    id: number
    user_id: string
    guild_id: string
    message_count: number
    /** 最後にメッセージカウントが更新された時刻（クールダウン管理用） */
    last_message_at: number
    created_at: string
    updated_at: string
}

export interface RankingEntry {
    rank: number
    user_id: string
    /** レベリングランキング用 */
    total_xp?: number
    level?: number
    xp?: number
    /** メッセージランキング用 */
    message_count?: number
    /** 経済ランキング用 */
    balance?: number
}

export interface ChannelRow {
    id: number
    channel_id: string
    guild_id: string
    channel_name: string
    registered_by_user_id: string
    registered_by_username: string
    last_sent_date: string | null
    created_at: string
}

export interface QuoteRow {
    id: number
    text: string
    registered_by_user_id: string
    registered_by_username: string
    created_at: string
}

// ─── サーバー設定 ─────────────────────────────────────────────────────────────

export interface GuildSettingsRow {
    guild_id: string
    /** サポートロールのID（チケット等で使用） */
    support_role_id: string | null
    /** モデレーターロールのID */
    moderator_role_id: string | null
    /** ログチャンネルID（モデレーションログ等） */
    log_channel_id: string | null
    /** ウェルカムチャンネルID */
    welcome_channel_id: string | null
    /** レベルアップ通知チャンネルID（nullの場合はメッセージ送信チャンネル） */
    levelup_channel_id: string | null
    /** XP取得を無効にするチャンネルIDのJSON配列 */
    xp_blacklist_channels: string
    /** レベルアップ通知を有効にするか */
    levelup_notification: number
    /** 経済システムの通貨名 */
    currency_name: string
    /** 経済システムの通貨絵文字 */
    currency_emoji: string
    /** デイリーボーナス金額 */
    daily_amount: number
    /** XP倍率（BoostやPremiumサーバー向け） */
    xp_multiplier: number
    /** メッセージカウントの最小文字数（これ未満は無視） */
    min_message_length: number
    /** メッセージカウントのクールダウン（秒） */
    message_cooldown_seconds: number
    created_at: string
    updated_at: string
}

// ─── レベリング ───────────────────────────────────────────────────────────────

export interface UserLevelRow {
    id: number
    user_id: string
    guild_id: string
    xp: number
    level: number
    total_xp: number
    /** 最後にXPを獲得した時刻（UNIXミリ秒、クールダウン管理用） */
    last_xp_at: number
    created_at: string
    updated_at: string
}

export interface LevelUpResult {
    leveled: boolean
    oldLevel: number
    newLevel: number
    currentXp: number
    xpForNext: number
}

// ─── 経済システム ─────────────────────────────────────────────────────────────

export interface UserEconomyRow {
    id: number
    user_id: string
    guild_id: string
    balance: number
    total_earned: number
    /** 最後にデイリーを受け取った日（YYYY-MM-DD） */
    last_daily_date: string | null
    created_at: string
    updated_at: string
}

export interface TransferResult {
    success: boolean
    error?: 'insufficient_balance' | 'self_transfer'
    senderBalance?: number
    receiverBalance?: number
}

// ─── メッセージ統計・ランキング ────────────────────────────────────────────────

export interface UserMessageStatRow {
    id: number
    user_id: string
    guild_id: string
    message_count: number
    /** 最後にメッセージカウントが更新された時刻（クールダウン管理用） */
    last_message_at: number
    created_at: string
    updated_at: string
}

export interface RankingEntry {
    rank: number
    user_id: string
    /** レベリングランキング用 */
    total_xp?: number
    level?: number
    xp?: number
    /** メッセージランキング用 */
    message_count?: number
    /** 経済ランキング用 */
    balance?: number
}

// ─── チケット ─────────────────────────────────────────────────────────────────

export interface TicketPanelRow {
    id: number
    guild_id: string
    /** パネルを設置するチャンネル */
    channel_id: string
    /** 投稿済みパネルのメッセージID */
    message_id: string | null
    panel_title: string
    panel_description: string
    button_label: string
    /** チケットチャンネルを作成するカテゴリID（任意） */
    ticket_category_id: string | null
    /** チケット作成クールダウン（秒） */
    cooldown_seconds: number
    created_at: string
    updated_at: string
}

export interface TicketCooldownRow {
    user_id: string
    guild_id: string
    last_created_at: number
}

// ─── ロールパネル ─────────────────────────────────────────────────────────────

export interface RolePanelRow {
    id: number
    guild_id: string
    channel_id: string
    message_id: string | null
    panel_title: string
    panel_description: string | null
    /** 'button' | 'select' */
    panel_type: string
    created_at: string
    updated_at: string
}

export interface RolePanelItemRow {
    id: number
    panel_id: number
    role_id: string
    label: string
    emoji: string | null
    /** セレクトメニュー用の説明文 */
    description: string | null
    position: number
}

// ─── TTS ──────────────────────────────────────────────────────────────────
export interface TtsSettingsRow {
    guild_id: string
    text_channel_id: string
    voice_channel_id: string
    created_at: string
}
