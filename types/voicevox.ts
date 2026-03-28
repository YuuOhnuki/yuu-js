export interface VoicevoxSpeaker {
    name: string
    speaker_uuid: string
    styles: Array<{
        name: string
        id: number
        type: string
    }>
    version: string
    supported_features: {
        permitted_synthesis_morphing: string
    }
}

export interface VoicevoxPreset {
    id: number
    name: string
    speaker_uuid: string
    style_id: number
    speedScale: number
    pitchScale: number
    intonationScale: number
    volumeScale: number
    prePhonemeLength: number
    postPhonemeLength: number
    pauseLength: number
    pauseLengthScale: number
}

export interface VoicevoxUserDictWord {
    surface: string
    priority: number
    context_id?: number
    part_of_speech: string
    part_of_speech_detail_1?: string
    part_of_speech_detail_2?: string
    part_of_speech_detail_3?: string
    inflectional_type?: string
    inflectional_form?: string
    stem?: string
    yomi?: string
    pronunciation: string
    accent_type: number
    mora_count?: number
    accent_associative_rule?: string
}

export interface VoicevoxAudioQuery {
    accent_phrases: any[]
    speedScale: number
    pitchScale: number
    intonationScale: number
    volumeScale: number
    prePhonemeLength: number
    postPhonemeLength: number
    pauseLength: number | null
    pauseLengthScale: number
    outputSamplingRate: number
    outputStereo: boolean
    kana?: string
}
