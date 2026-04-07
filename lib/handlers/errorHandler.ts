import {
    ChatInputCommandInteraction,
    MessageFlags,
    DiscordAPIError,
    type ButtonInteraction,
    type StringSelectMenuInteraction,
} from 'discord.js'
import { createErrorEmbed } from '../embed.ts'

/**
 * Discord API エラーコード一覧
 */
export enum DiscordErrorCode {
    MissingPermissions = 50013,
    MissingAccess = 50001,
    MissingRequiredScopes = 50034,
    BotProhibitedFromTakingAction = 20015,
}

/**
 * エラーメッセージ生成関数
 * Discord API エラーを判定してユーザーフレンドリーなメッセージを返す
 *
 * @param error - キャッチされたエラーオブジェクト
 * @param context - エラーの文脈（例：「ロール付与」「メッセージ削除」）
 * @returns ユーザーに表示するエラーメッセージ
 */
export function getErrorMessage(error: unknown, context: string = '操作'): string {
    if (error instanceof DiscordAPIError) {
        // Discord API エラーコード 50013: Missing Permissions
        if (error.code === DiscordErrorCode.MissingPermissions) {
            return `❌ Botが必要な権限を持っていません。\nサーバー設定でBotに「${context}」に必要な権限があることを確認してください。`
        }

        // コード 50001: Missing Access
        if (error.code === DiscordErrorCode.MissingAccess) {
            return `❌ ボットがこのサーバーにアクセスできません。`
        }

        // コード 50034: Missing Required Scopes
        if (error.code === DiscordErrorCode.MissingRequiredScopes) {
            return `❌ ボットに必要なスコープが不足しています。再度招待してください。`
        }

        // コード 20015: Bot Prohibited From Taking Action
        if (error.code === DiscordErrorCode.BotProhibitedFromTakingAction) {
            return `❌ ボットはこの操作を実行できません。ボットのロール位置またはサーバーの設定を確認してください。`
        }

        // その他の Discord API エラー
        if (error.message) {
            return `❌ エラー: ${error.message}`
        }
    }

    // 一般的なエラー
    if (error instanceof Error && error.message) {
        return `❌ エラー: ${error.message}`
    }

    return `❌ ${context}に失敗しました。Botの権限を確認してください。`
}

/**
 * 一般的なエラーシナリオを判別して適切なメッセージを返す
 * @param error - エラーオブジェクト
 * @returns ユーザーに表示するメッセージ
 */
export function getDetailedErrorMessage(error: unknown): string {
    // Discord API エラー
    if (error instanceof DiscordAPIError) {
        return getErrorMessage(error)
    }

    // タイムアウトエラー
    if (error instanceof Error) {
        if (
            error.message.includes('timeout') ||
            error.message.includes('ETIMEDOUT')
        ) {
            return '❌ リクエストがタイムアウトしました。しばらく待ってからもう一度お試しください。'
        }

        // データベースエラー
        if (error.message.includes('database') || error.message.includes('SQLITE')) {
            return '❌ データベース操作に失敗しました。サーバー管理者に報告してください。'
        }

        // 権限関連
        if (
            error.message.includes('permission') ||
            error.message.includes('unauthorized')
        ) {
            return '❌ 権限がありません。サーバー管理者に確認してください。'
        }

        // 一般的なエラーメッセージ
        return `❌ エラーが発生しました: ${error.message.slice(0, 100)}`
    }

    return '❌ 予期しないエラーが発生しました。時間をおいてもう一度お試しください。'
}

/**
 * インタラクションにおけるエラーを共通で処理するハンドラ
 * ChatInputCommandInteraction 用
 */
export async function handleInteractionError(
    interaction: ChatInputCommandInteraction,
    error: any
) {
    console.error(`[Command Error] /${interaction.commandName}:`, error)

    const errorMessage = getErrorMessage(error, 'コマンド実行')
    const embed = createErrorEmbed(errorMessage)

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                embeds: [embed],
                components: [],
            })
        } else {
            await interaction.reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral],
            })
        }
    } catch (e) {
        console.error('[Fatal Error] Failed to send error feedback:', e)
    }
}

/**
 * ボタンインタラクションでのエラー処理
 *
 * @param interaction - ボタンインタラクション
 * @param error - エラーオブジェクト
 * @param context - エラーの文脈
 */
export async function handleButtonError(
    interaction: ButtonInteraction,
    error: any,
    context: string = 'ボタン操作'
) {
    console.error('[Button Error]', error)

    const errorMessage = getErrorMessage(error, context)

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: errorMessage,
                components: [],
            })
        } else {
            await interaction.reply({
                content: errorMessage,
                flags: [MessageFlags.Ephemeral],
            })
        }
    } catch (e) {
        console.error('[Fatal Error] Failed to send button error feedback:', e)
    }
}

/**
 * セレクトメニューインタラクションでのエラー処理
 *
 * @param interaction - セレクトメニューインタラクション
 * @param error - エラーオブジェクト
 * @param context - エラーの文脈
 */
export async function handleSelectMenuError(
    interaction: StringSelectMenuInteraction,
    error: any,
    context: string = 'セレクトメニュー操作'
) {
    console.error('[SelectMenu Error]', error)

    const errorMessage = getErrorMessage(error, context)

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: errorMessage,
                components: [],
            })
        } else {
            await interaction.reply({
                content: errorMessage,
                flags: [MessageFlags.Ephemeral],
            })
        }
    } catch (e) {
        console.error('[Fatal Error] Failed to send select menu error feedback:', e)
    }
}

/**
 * 汎用的なインタラクションエラーハンドラー
 * 自動でエラーログとユーザー通知を処理
 *
 * @param interaction - インタラクション（ButtonInteraction または StringSelectMenuInteraction）
 * @param error - エラーオブジェクト
 * @param logPrefix - ログに付与するプレフィックス
 */
export async function handleGenericInteractionError(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    error: any,
    logPrefix: string = '[Interaction Error]'
) {
    console.error(logPrefix, error)

    const errorMessage = getDetailedErrorMessage(error)

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: errorMessage,
                components: [],
            })
        } else {
            await interaction.reply({
                content: errorMessage,
                flags: [MessageFlags.Ephemeral],
            })
        }
    } catch (e) {
        console.error('[Fatal Error] Failed to send error feedback:', e)
    }
}
