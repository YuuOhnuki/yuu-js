import {
    Client,
    Collection,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
} from 'discord.js'
import { Glob } from 'bun'
import path from 'node:path'
import { initDb } from './lib/db'

export interface ExtendedClient extends Client {
    commands: Collection<string, any>
    slashCommands: Collection<string, any>
    buttonCommands: Collection<string, any>
    selectCommands: Collection<string, any>
    contextCommands: Collection<string, any>
    modalCommands: Collection<string, any>
    cooldowns: Collection<string, Collection<string, number>>
    autocompleteInteractions: Collection<string, any>
    triggers: Collection<string, any>
}
const client = new Client({
    intents: Object.values(GatewayIntentBits) as number[],
    partials: [
        Partials.User,
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.Reaction,
        Partials.GuildScheduledEvent,
        Partials.ThreadMember,
    ],
}) as ExtendedClient

// collections
const collections = [
    'commands',
    'slashCommands',
    'buttonCommands',
    'selectCommands',
    'contextCommands',
    'modalCommands',
    'cooldowns',
    'autocompleteInteractions',
    'triggers',
]
collections.forEach((c) => ((client as any)[c] = new Collection()))

// handlers
// events
const eventFiles = new Glob('events/*.ts').scanSync('.')
for (const file of eventFiles) {
    const event = (await import(path.join(import.meta.dir, file))).default
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client))
    } else {
        client.on(event.name, (...args) => event.execute(...args, client))
    }
}

// slash commands
const slashFiles = new Glob('commands/**/*.ts').scanSync('.')
for (const file of slashFiles) {
    const command = (await import(path.join(import.meta.dir, file))).default
    if (command && command.data && command.data.name) {
        client.slashCommands.set(command.data.name, command)
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN!)

const commandJsonData = [
    ...Array.from(client.slashCommands.values()).map((c) => c.data.toJSON()),
    ...Array.from(client.contextCommands.values()).map((c) => c.data),
]

const startBot = async () => {
    try {
        console.log('コマンド読み込み中')
        const clientId = process.env.CLIENT_ID!

        if (process.env.NODE_ENV === 'production') {
            await rest.put(Routes.applicationCommands(clientId), {
                body: commandJsonData,
            })
            console.log(
                `アプリケーションコマンドを登録: ${commandJsonData.length} `
            )
        } else {
            const guildId = process.env.GUILD_ID!
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
                body: commandJsonData,
            })
            console.log(`サーバーコマンドを登録: ${commandJsonData.length} `)
        }

        await client.login(process.env.TOKEN)
        console.log(`[ログイン完了] ${client.user?.tag}`)
    } catch (error) {
        console.error('ボット起動に失敗', error)
    }
}

startBot()
await initDb()
