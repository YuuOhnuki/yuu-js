import { Readable } from 'node:stream'
import { createAudioResource, AudioResource } from '@discordjs/voice'
import type {
    VoicevoxPreset,
    VoicevoxAudioQuery,
    VoicevoxUserDictWord,
} from '../types/voicevox'

const ENGINE_URL = process.env.VOICEVOX_ENGINE_URL ?? 'http://localhost:50021'

/**
 * VOICEVOX API Client
 */
export class VoicevoxClient {
    /**
     * 音声合成用のクエリを作成します
     */
    static async createAudioQuery(
        text: string,
        speakerId: number
    ): Promise<VoicevoxAudioQuery> {
        const res = await fetch(
            `${ENGINE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
            { method: 'POST' }
        )
        if (!res.ok)
            throw new Error(`VOICEVOX クエリ生成失敗: ${res.statusText}`)
        return (await res.json()) as VoicevoxAudioQuery
    }

    /**
     * プリセットを使用して音声合成用のクエリを作成します
     */
    static async createAudioQueryFromPreset(
        text: string,
        presetId: number
    ): Promise<VoicevoxAudioQuery> {
        const res = await fetch(
            `${ENGINE_URL}/audio_query_from_preset?text=${encodeURIComponent(text)}&preset_id=${presetId}`,
            { method: 'POST' }
        )
        if (!res.ok)
            throw new Error(
                `VOICEVOX プリセットクエリ生成失敗: ${res.statusText}`
            )
        return (await res.json()) as VoicevoxAudioQuery
    }

    /**
     * クエリから音声を合成します
     */
    static async synthesis(
        query: VoicevoxAudioQuery,
        speakerId: number
    ): Promise<ArrayBuffer> {
        const res = await fetch(
            `${ENGINE_URL}/synthesis?speaker=${speakerId}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(query),
            }
        )
        if (!res.ok) throw new Error(`VOICEVOX 音声合成失敗: ${res.statusText}`)
        return await res.arrayBuffer()
    }

    /**
     * ユーザー辞書の一覧を取得します
     */
    static async getUserDict(): Promise<Record<string, VoicevoxUserDictWord>> {
        const res = await fetch(`${ENGINE_URL}/user_dict`)
        if (!res.ok)
            throw new Error(`VOICEVOX ユーザー辞書取得失敗: ${res.statusText}`)
        return (await res.json()) as Record<string, VoicevoxUserDictWord>
    }

    /**
     * ユーザー辞書に単語を追加します
     */
    static async addUserDictWord(
        params: VoicevoxUserDictWord
    ): Promise<string> {
        const query = new URLSearchParams(params as any).toString()
        const res = await fetch(`${ENGINE_URL}/user_dict_word?${query}`, {
            method: 'POST',
        })
        if (!res.ok) throw new Error(`VOICEVOX 単語追加失敗: ${res.statusText}`)
        return (await res.text()) as string // word_uuid
    }

    /**
     * ユーザー辞書の単語を更新します
     */
    static async updateUserDictWord(
        wordUuid: string,
        params: VoicevoxUserDictWord
    ) {
        const query = new URLSearchParams(params as any).toString()
        const res = await fetch(
            `${ENGINE_URL}/user_dict_word/${wordUuid}?${query}`,
            { method: 'PUT' }
        )
        if (!res.ok) throw new Error(`VOICEVOX 単語更新失敗: ${res.statusText}`)
    }

    /**
     * ユーザー辞書の単語を削除します
     */
    static async deleteUserDictWord(wordUuid: string) {
        const res = await fetch(`${ENGINE_URL}/user_dict_word/${wordUuid}`, {
            method: 'DELETE',
        })
        if (!res.ok) throw new Error(`VOICEVOX 単語削除失敗: ${res.statusText}`)
    }

    /**
     * プリセットの一覧を取得します
     */
    static async getPresets(): Promise<VoicevoxPreset[]> {
        const res = await fetch(`${ENGINE_URL}/presets`)
        if (!res.ok)
            throw new Error(`VOICEVOX プリセット取得失敗: ${res.statusText}`)
        return (await res.json()) as VoicevoxPreset[]
    }

    /**
     * プリセットを追加します
     */
    static async addPreset(preset: VoicevoxPreset): Promise<number> {
        const res = await fetch(`${ENGINE_URL}/add_preset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preset),
        })
        if (!res.ok)
            throw new Error(`VOICEVOX プリセット追加失敗: ${res.statusText}`)
        return (await res.json()) as number // preset_id
    }

    /**
     * プリセットを更新します
     */
    static async updatePreset(preset: VoicevoxPreset): Promise<number> {
        const res = await fetch(`${ENGINE_URL}/update_preset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preset),
        })
        if (!res.ok)
            throw new Error(`VOICEVOX プリセット更新失敗: ${res.statusText}`)
        return (await res.json()) as number // preset_id
    }

    /**
     * プリセットを削除します
     */
    static async deletePreset(presetId: number) {
        const res = await fetch(`${ENGINE_URL}/delete_preset?id=${presetId}`, {
            method: 'POST',
        })
        if (!res.ok)
            throw new Error(`VOICEVOX プリセット削除失敗: ${res.statusText}`)
    }
}

/**
 * Discord用音声リソースを生成します
 */
export async function generateAudio(
    text: string,
    speakerId: number = 3,
    presetId?: number
): Promise<AudioResource> {
    let query: VoicevoxAudioQuery
    if (presetId) {
        try {
            query = await VoicevoxClient.createAudioQueryFromPreset(
                text,
                presetId
            )
        } catch (e) {
            console.error(
                `Failed to create query from preset ${presetId}, falling back to speaker ${speakerId}`,
                e
            )
            query = await VoicevoxClient.createAudioQuery(text, speakerId)
        }
    } else {
        query = await VoicevoxClient.createAudioQuery(text, speakerId)
    }
    const arrayBuffer = await VoicevoxClient.synthesis(query, speakerId)
    return createAudioResource(Readable.from(Buffer.from(arrayBuffer)))
}

export async function getSpeakerUuidByStyleId(
    styleId: number
): Promise<string> {
    const res = await fetch(`${ENGINE_URL}/speakers`)
    if (!res.ok) throw new Error(`VOICEVOX getSpeakers failed`)
    const speakers = (await res.json()) as any[]
    for (const s of speakers) {
        if (s.styles.some((st: any) => st.id === styleId)) {
            return s.speaker_uuid
        }
    }
    throw new Error(`Speaker UUID not found for style ID ${styleId}`)
}
