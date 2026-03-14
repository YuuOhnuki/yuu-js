import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    GuildMember,
    type APIEmbedField,
} from 'discord.js'
import { errorEmbed, infoEmbed } from '../../lib/embed'

export default {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('ユーザーの詳細情報を表示')
        .addUserOption((opt) =>
            opt.setName('target').setDescription('対象ユーザー')
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const user =
                interaction.options.getUser('target') ?? interaction.user
            const member = interaction.options.getMember(
                'target'
            ) as GuildMember | null

            infoEmbed.setTitle(`${user.username} の情報`).setFields([])
            infoEmbed.setThumbnail(user.displayAvatarURL())

            const fields: APIEmbedField[] = [
                { name: '名前', value: `${user.tag}`, inline: true },
                { name: 'ID', value: `\`${user.id}\``, inline: true },
                {
                    name: 'アカウント作成',
                    value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`,
                    inline: false,
                },
            ]

            if (member) {
                const roles = member.roles.cache
                    .filter((r) => r.id !== interaction.guildId)
                    .sort((a, b) => b.position - a.position)
                    .map((r) => r.toString())

                const rolesDisplay =
                    roles.length > 10
                        ? `${roles.slice(0, 10).join(', ')} ...他 ${roles.length - 10} 個`
                        : roles.join(', ') || 'なし'

                fields.push(
                    {
                        name: 'サーバー参加',
                        value: member.joinedTimestamp
                            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
                            : '不明',
                        inline: true,
                    },
                    {
                        name: '最上位役職',
                        value: `${member.roles.highest}`,
                        inline: false,
                    },
                    {
                        name: `役職一覧 (${roles.length})`,
                        value: rolesDisplay,
                        inline: false,
                    }
                )
            } else {
                fields.push({
                    name: 'ステータス',
                    value: 'このサーバーには参加していません。',
                    inline: false,
                })
            }

            infoEmbed.setFields(fields)

            await interaction.reply({ embeds: [infoEmbed] })
        } catch (error: any) {
            console.error(error)
            errorEmbed.setDescription(error.message)
            await interaction.reply({
                embeds: [errorEmbed],
                flags: [MessageFlags.Ephemeral],
            })
        }
    },
}
