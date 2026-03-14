import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type {
    ChatInputCommandInteraction,
    SlashCommandStringOption,
} from 'discord.js'
import type { ExtendedClient } from '../../index.ts'

async function executeHelp(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as ExtendedClient
    const helpEmbed = new EmbedBuilder().setColor('#89c3eb')

    const commands = client.slashCommands
        .map(
            (cmd: { data: { name: string; description?: string } }) => cmd.data
        )
        .sort((a, b) => a.name.localeCompare(b.name))

    helpEmbed
        .setTitle('📚 コマンドヘルプ')
        .setDescription('下のセレクトメニューからコマンドを選ぶと、詳細を表示')

    await interaction.reply({
        embeds: [helpEmbed],
        components: [
            {
                type: 1,
                components: [
                    {
                        type: 3,
                        custom_id: 'help_select',
                        placeholder: 'コマンドを選択してください',
                        options: commands.map((cmd) => ({
                            label: `/${cmd.name}`,
                            value: cmd.name,
                            description:
                                cmd.description?.slice(0, 100) ??
                                'ヘルプを表示します',
                        })),
                    },
                ],
            },
        ],
        flags: [MessageFlags.Ephemeral],
    })
}

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('コマンド情報をセレクトメニューで表示'),

    async execute(interaction: ChatInputCommandInteraction) {
        await executeHelp(interaction)
    },
}
