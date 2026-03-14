import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'

async function executeInfo(interaction: ChatInputCommandInteraction) {
    const infoEmbed = new EmbedBuilder()
        .setColor('#89c3eb')
        .setTitle(interaction.client.user.displayName)
        .setThumbnail(
            interaction.client.user.displayAvatarURL({
                size: 4096,
            })
        )
        .setDescription(
            '**「もっとシンプルに、もっと使いやすく」**\nDiscord botです。'
        )

    await interaction.reply({
        embeds: [infoEmbed],
    })
}

async function executeInvite(interaction: ChatInputCommandInteraction) {
    const inviteEmbed = new EmbedBuilder()
        .setColor('#89c3eb')
        .setTitle(interaction.client.user.displayName)
        .setThumbnail(
            interaction.client.user.displayAvatarURL({
                size: 4096,
            })
        )
        .setDescription(
            '[招待リンク](https://discord.com/oauth2/authorize?client_id=1482240981377089546)'
        )

    await interaction.reply({
        embeds: [inviteEmbed],
    })
}

const handlers: Record<
    string,
    (interaction: ChatInputCommandInteraction) => Promise<void>
> = {
    me: executeInfo,
    invite: executeInvite,
}

export default {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('紹介や招待リンクを表示')
        .addSubcommand((s) =>
            s.setName('me').setDescription('ボットの紹介を表示')
        )
        .addSubcommand((s) =>
            s.setName('invite').setDescription('ボットの招待リンクを表示')
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand()
        const handler = handlers[sub]
        if (handler) {
            await handler(interaction)
        }
    },
}
