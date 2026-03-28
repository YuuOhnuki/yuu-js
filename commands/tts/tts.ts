import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    GuildMember,
} from 'discord.js'
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice'
import { setTtsSettings, deleteTtsSettings } from '../../lib/db'
import { createErrorEmbed, createSuccessEmbed } from '../../lib/embed'

export default {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('読み上げ機能の設定')
        .addSubcommand((sub) =>
            sub
                .setName('join')
                .setDescription(
                    '現在のボイスチャンネルに参加して読み上げを開始します'
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('leave')
                .setDescription(
                    'ボイスチャンネルから退出して読み上げを終了します'
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand()
        const guildId = interaction.guildId!
        const member = interaction.member as GuildMember

        if (sub === 'join') {
            const voiceChannel = member.voice.channel
            if (!voiceChannel) {
                return await interaction.reply({
                    embeds: [
                        createErrorEmbed(
                            '先にボイスチャンネルに参加してください。'
                        ),
                    ],
                    flags: [MessageFlags.Ephemeral],
                })
            }

            try {
                joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                })

                await setTtsSettings(
                    guildId,
                    interaction.channelId,
                    voiceChannel.id
                )

                const embed = createSuccessEmbed().setDescription(
                    `<#${interaction.channelId}>でのメッセージを\n<#${voiceChannel.id}>で読み上げます`
                )
                await interaction.reply({ embeds: [embed] })
            } catch (error: any) {
                console.error(error)
                await interaction.reply({
                    embeds: [createErrorEmbed('接続に失敗しました。')],
                    flags: [MessageFlags.Ephemeral],
                })
            }
        }

        if (sub === 'leave') {
            const connection = getVoiceConnection(guildId)
            if (connection) {
                connection.destroy()
            }
            await deleteTtsSettings(guildId)
            await interaction.reply({
                embeds: [
                    createSuccessEmbed().setDescription(
                        'ボイスチャンネルから退出しました。'
                    ),
                ],
            })
        }
    },
}
