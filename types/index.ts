import type {
    ChatInputCommandInteraction,
    Collection,
    SlashCommandBuilder,
} from 'discord.js'

export interface Command {
    data: SlashCommandBuilder
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>
}

declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>
    }
}
