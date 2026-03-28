import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js'
import { getSpeakerUuidByStyleId, VoicevoxClient } from '../../lib/voicevox'
import { errorEmbed, successEmbed } from '../../lib/embed'
import { getUserTtsPresets, updateUserTtsPresets } from '../../lib/db'

export default {
    data: new SlashCommandBuilder()
        .setName('preset')
        .setDescription('VOICEVOX プリセットの管理')
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('自身のプリセットを設定します')
                .addIntegerOption((opt) =>
                    opt
                        .setName('speaker')
                        .setDescription('スピーカーを選択')
                        .setRequired(true)
                        .addChoices(
                            { name: '四国めたん', value: 2 },
                            { name: 'ずんだもん', value: 3 },
                            { name: '春日部つむぎ', value: 8 },
                            { name: '雨晴はう', value: 10 },
                            { name: '波音リツ', value: 9 },
                            { name: '玄野武宏', value: 11 },
                            { name: '白上虎太郎', value: 12 },
                            { name: '青山龍星', value: 13 },
                            { name: '冥鳴ひまり', value: 14 },
                            { name: '九州そら', value: 16 },
                            { name: 'もち子さん', value: 20 },
                            { name: '剣崎雌雄', value: 21 },
                            { name: 'WhiteCUL', value: 23 },
                            { name: '後鬼', value: 27 },
                            { name: 'No.7', value: 29 },
                            { name: 'ちび式じい', value: 42 },
                            { name: '櫻歌ミコ', value: 43 },
                            { name: '小夜/SAYO', value: 46 },
                            { name: 'ナースロボ＿タイプＴ', value: 47 },
                            { name: '†聖騎士 紅桜†', value: 51 },
                            { name: '雀松朱司', value: 52 },
                            { name: '麒ヶ島宗麟', value: 53 },
                            { name: '春歌ナナ', value: 54 },
                            { name: '猫使アル', value: 55 },
                            { name: '猫使ビィ', value: 58 }
                        )
                )
                .addNumberOption((opt) =>
                    opt
                        .setName('speed')
                        .setDescription('話速')
                        .addChoices(
                            { name: '遅い (0.5)', value: 0.5 },
                            { name: 'やや遅い (0.75)', value: 0.75 },
                            { name: '普通 (1.0)', value: 1.0 },
                            { name: 'やや速い (1.25)', value: 1.25 },
                            { name: '速い (1.5)', value: 1.5 },
                            { name: 'とても速い (2.0)', value: 2.0 }
                        )
                        .setRequired(false)
                )
                .addNumberOption((opt) =>
                    opt
                        .setName('pitch')
                        .setDescription('音高')
                        .addChoices(
                            { name: '低い (-0.15)', value: -0.15 },
                            { name: 'やや低い (-0.07)', value: -0.07 },
                            { name: '普通 (0.0)', value: 0.0 },
                            { name: 'やや高い (0.07)', value: 0.07 },
                            { name: '高い (0.15)', value: 0.15 }
                        )
                        .setRequired(false)
                )
                .addNumberOption((opt) =>
                    opt
                        .setName('intonation')
                        .setDescription('抑揚')
                        .addChoices(
                            { name: '弱い (0.5)', value: 0.5 },
                            { name: '普通 (1.0)', value: 1.0 },
                            { name: '強い (1.5)', value: 1.5 },
                            { name: 'とても強い (2.0)', value: 2.0 }
                        )
                        .setRequired(false)
                )
                .addNumberOption((opt) =>
                    opt
                        .setName('volume')
                        .setDescription('音量')
                        .addChoices(
                            { name: '小さい (0.5)', value: 0.5 },
                            { name: 'やや小さい (0.75)', value: 0.75 },
                            { name: '普通 (1.0)', value: 1.0 },
                            { name: 'やや大きい (1.25)', value: 1.25 },
                            { name: '大きい (1.5)', value: 1.5 },
                            { name: 'とても大きい (2.0)', value: 2.0 }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('show').setDescription('現在のプリセットを表示します')
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        if (sub === 'set') {
            const speaker = interaction.options.getInteger('speaker', true)
            const speedScale = interaction.options.getNumber('speed') ?? 1.0
            const pitchScale = interaction.options.getNumber('pitch') ?? 0.0
            const intonationScale =
                interaction.options.getNumber('intonation') ?? 1.0
            const volumeScale = interaction.options.getNumber('volume') ?? 1.0

            const uuid = await getSpeakerUuidByStyleId(speaker)

            const voicevoxPreset = {
                id: 0,
                name: interaction.user.username,
                speaker_uuid: uuid,
                style_id: speaker,
                speedScale,
                pitchScale,
                intonationScale,
                volumeScale,
                prePhonemeLength: 0.1,
                postPhonemeLength: 0.1,
                pauseLength: 0,
                pauseLengthScale: 1.0,
            }

            try {
                // DBから現在の設定（エンジン側のpreset_idを含む）を取得
                const current = await getUserTtsPresets(interaction.user.id)
                let enginePresetId: number

                if (current?.preset_id) {
                    // エンジン側のプリセットを更新
                    voicevoxPreset.id = current.preset_id
                    enginePresetId =
                        (await VoicevoxClient.updatePreset(voicevoxPreset)) || 0
                } else {
                    // エンジン側に新規追加し、割り当てられたIDを取得
                    enginePresetId =
                        (await VoicevoxClient.addPreset(voicevoxPreset)) || 0
                }

                // DBに保存（エンジン側のプリセットIDと各パラメータを同期）
                await updateUserTtsPresets(interaction.user.id, {
                    preset_id: enginePresetId,
                    speaker_uuid: uuid,
                    style_id: speaker,
                    speedScale,
                    pitchScale,
                    intonationScale,
                    volumeScale,
                    prePhonemeLength: 0.1,
                    postPhonemeLength: 0.1,
                    pauseLength: 0,
                    pauseLengthScale: 1.0,
                })

                successEmbed.setFields([]) // 前回の表示内容をクリア
                successEmbed.addFields(
                    {
                        name: 'スピーカー',
                        value: speaker.toString(),
                        inline: true,
                    },
                    {
                        name: '話速',
                        value: speedScale.toString(),
                        inline: true,
                    },
                    {
                        name: 'ピッチ',
                        value: pitchScale.toString(),
                        inline: true,
                    },
                    {
                        name: '抑揚',
                        value: intonationScale.toString(),
                        inline: true,
                    },
                    {
                        name: '音量',
                        value: volumeScale.toString(),
                        inline: true,
                    }
                )
                await interaction.editReply({ embeds: [successEmbed] })
            } catch (error: any) {
                console.error(error)
                errorEmbed.setDescription(error.message)
                await interaction.editReply({
                    embeds: [errorEmbed],
                })
            }
        } else if (sub === 'show') {
            const s = await getUserTtsPresets(interaction.user.id)
            if (!s || !s.preset_id) {
                errorEmbed.setDescription('プリセットが存在しません。')
                return await interaction.editReply({ embeds: [errorEmbed] })
            }

            const presets = await VoicevoxClient.getPresets()
            const presetDetails = presets.find((p) => p.id === s.preset_id)

            if (!presetDetails) {
                errorEmbed.setDescription(
                    'エンジン側にプリセットが見つかりませんでした。'
                )
            } else {
                const display = {
                    speaker: presetDetails.style_id,
                    speed: presetDetails.speedScale,
                    pitch: presetDetails.pitchScale,
                    intonation: presetDetails.intonationScale,
                    volume: presetDetails.volumeScale,
                }

                const embed = new EmbedBuilder()
                    .setTitle('読み上げ設定')
                    .setColor(0x4a488e)
                    .addFields(
                        {
                            name: 'スピーカー',
                            value: String(display.speaker),
                            inline: true,
                        },
                        {
                            name: '話速',
                            value: String(display.speed),
                            inline: true,
                        },
                        {
                            name: 'ピッチ',
                            value: String(display.pitch),
                            inline: true,
                        },
                        {
                            name: '抑揚',
                            value: String(display.intonation),
                            inline: true,
                        },
                        {
                            name: '音量',
                            value: String(display.volume),
                            inline: true,
                        }
                    )

                await interaction.editReply({
                    embeds: [embed],
                })
            }
        }
    },
}
