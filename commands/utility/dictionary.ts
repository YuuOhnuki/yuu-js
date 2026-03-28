import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js'
import { VoicevoxClient } from '../../lib/voicevox'
import { errorEmbed, infoEmbed, successEmbed } from '../../lib/embed'

const wordTypes = {
    PROPER_NOUN: '固有名詞',
    COMMON_NOUN: '普通名詞',
    VERB: '動詞',
    ADJECTIVE: '形容詞',
    SUFFIX: '語尾',
}

export default {
    data: new SlashCommandBuilder()
        .setName('dictionary')
        .setDescription('VOICEVOX ユーザー辞書の管理')
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('ユーザー辞書に単語を追加します')
                .addStringOption((opt) =>
                    opt
                        .setName('surface')
                        .setDescription('言葉の表層形')
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('pronunciation')
                        .setDescription('言葉の発音（カタカナ）')
                        .setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('accent_type')
                        .setDescription('アクセント型（音が下がる場所）')
                )
                .addStringOption((opt) =>
                    opt
                        .setName('word_type')
                        .setDescription('品詞')
                        .addChoices(
                            { name: '固有名詞', value: 'PROPER_NOUN' },
                            { name: '普通名詞', value: 'COMMON_NOUN' },
                            { name: '動詞', value: 'VERB' },
                            { name: '形容詞', value: 'ADJECTIVE' },
                            { name: '語尾', value: 'SUFFIX' }
                        )
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('priority')
                        .setDescription('優先度 (0-10)')
                        .setMinValue(0)
                        .setMaxValue(10)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('ユーザー辞書の単語一覧を表示します')
        )
        .addSubcommand((sub) =>
            sub
                .setName('delete')
                .setDescription('ユーザー辞書から単語を削除します')
                .addStringOption((opt) =>
                    opt
                        .setName('uuid')
                        .setDescription('削除する単語のUUID')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('update')
                .setDescription('ユーザー辞書の単語を更新します')
                .addStringOption((opt) =>
                    opt
                        .setName('uuid')
                        .setDescription('更新する単語のUUID')
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('surface')
                        .setDescription('言葉の表層形')
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('pronunciation')
                        .setDescription('言葉の発音（カタカナ）')
                        .setRequired(false)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('accent_type')
                        .setDescription('アクセント型（音が下がる場所）')
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('word_type')
                        .setDescription('品詞')
                        .addChoices(
                            { name: '固有名詞', value: 'PROPER_NOUN' },
                            { name: '普通名詞', value: 'COMMON_NOUN' },
                            { name: '動詞', value: 'VERB' },
                            { name: '形容詞', value: 'ADJECTIVE' },
                            { name: '語尾', value: 'SUFFIX' }
                        )
                        .setRequired(false)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('priority')
                        .setDescription('優先度 (0-10)')
                        .setMinValue(0)
                        .setMaxValue(10)
                        .setRequired(false)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        try {
            if (sub === 'add') {
                const surface = interaction.options.getString('surface', true)
                const pronunciation = interaction.options.getString(
                    'pronunciation',
                    true
                )
                const accent_type = interaction.options.getInteger(
                    'accent_type',
                    true
                )
                const word_type =
                    interaction.options.getString('word_type') ?? 'COMMON_NOUN'
                const priority = interaction.options.getInteger('priority') ?? 5

                const uuid = await VoicevoxClient.addUserDictWord({
                    surface,
                    pronunciation,
                    accent_type,
                    part_of_speech: word_type,
                    priority,
                })

                successEmbed.setDescription('単語を追加しました。')
                successEmbed.addFields(
                    {
                        name: 'UUID',
                        value: uuid.toString(),
                        inline: false,
                    },
                    {
                        name: '表層形',
                        value: surface.toString(),
                        inline: true,
                    },
                    {
                        name: '発音',
                        value: pronunciation.toString(),
                        inline: true,
                    },
                    {
                        name: 'アクセント型',
                        value: accent_type.toString(),
                        inline: true,
                    },
                    {
                        name: '品詞',
                        value:
                            wordTypes[word_type as keyof typeof wordTypes] ||
                            '',
                        inline: true,
                    },
                    {
                        name: '優先度',
                        value: priority.toString(),
                        inline: true,
                    }
                )
                await interaction.editReply({ embeds: [successEmbed] })
            } else if (sub === 'list') {
                const dict = await VoicevoxClient.getUserDict()
                const entries = Object.entries(dict)

                if (entries.length === 0) {
                    return await interaction.editReply({
                        content: 'ユーザー辞書は空です。',
                    })
                }

                infoEmbed.setTitle('VOICEVOX ユーザー辞書')

                const list = entries
                    .map(
                        ([uuid, word]: [string, any]) =>
                            `**${word.surface}** (${word.pronunciation})\n\`${uuid}\``
                    )
                    .join('\n\n')

                infoEmbed.setDescription(list.substring(0, 4096))
                await interaction.editReply({ embeds: [infoEmbed] })
            } else if (sub === 'update') {
                const uuid = interaction.options.getString('uuid', true)
                const surface = interaction.options.getString('surface')
                const pronunciation =
                    interaction.options.getString('pronunciation')
                const accent_type =
                    interaction.options.getInteger('accent_type')
                const word_type = interaction.options.getString('word_type')
                const priority = interaction.options.getInteger('priority')

                // 少なくとも1つのフィールドが指定されているか確認
                if (
                    !surface &&
                    !pronunciation &&
                    accent_type === undefined &&
                    !word_type &&
                    priority === undefined
                ) {
                    errorEmbed.setDescription(
                        '更新するフィールドを少なくとも1つ指定してください。'
                    )
                    return await interaction.editReply({
                        embeds: [errorEmbed],
                    })
                }

                // 既存の単語を取得
                const dict = await VoicevoxClient.getUserDict()
                const existing = dict[uuid]
                if (!existing) {
                    errorEmbed.setDescription(
                        `UUID \`${uuid}\` の単語が見つかりません。`
                    )
                    return await interaction.editReply({
                        embeds: [errorEmbed],
                    })
                }

                // マージ
                const merged = {
                    surface: surface ?? existing.surface,
                    pronunciation: pronunciation ?? existing.pronunciation,
                    accent_type: accent_type ?? existing.accent_type,
                    part_of_speech: word_type ?? existing.part_of_speech,
                    priority: priority ?? existing.priority,
                }

                await VoicevoxClient.updateUserDictWord(uuid, merged)

                successEmbed.setFields([])
                successEmbed.setDescription('単語を更新しました。')
                successEmbed.addFields(
                    {
                        name: 'UUID',
                        value: uuid,
                        inline: false,
                    },
                    {
                        name: '表層形',
                        value: merged.surface,
                        inline: true,
                    },
                    {
                        name: '発音',
                        value: merged.pronunciation,
                        inline: true,
                    },
                    {
                        name: 'アクセント型',
                        value: merged.accent_type.toString(),
                        inline: true,
                    },
                    {
                        name: '品詞',
                        value:
                            wordTypes[
                                merged.part_of_speech as keyof typeof wordTypes
                            ] || merged.part_of_speech,
                        inline: true,
                    },
                    {
                        name: '優先度',
                        value: merged.priority.toString(),
                        inline: true,
                    }
                )
                await interaction.editReply({ embeds: [successEmbed] })
            } else if (sub === 'delete') {
                const uuid = interaction.options.getString('uuid', true)
                await VoicevoxClient.deleteUserDictWord(uuid)
                successEmbed.setDescription(`単語を削除しました。\n\`${uuid}\``)
                await interaction.editReply({ embeds: [successEmbed] })
            }
        } catch (error: any) {
            console.error(error)
            errorEmbed.setDescription(`エラーが発生しました: ${error.message}`)
            await interaction.editReply({
                embeds: [errorEmbed],
            })
        }
    },
}
