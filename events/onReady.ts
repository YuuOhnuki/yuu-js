import { Activity, ActivityType, Client, User } from 'discord.js'

export default {
    name: 'clientReady',

    async execute(
        client: Client & { user: User } & {
            setActivity: (activity: Activity) => void
        }
    ) {
        client.user.setActivity({
            type: ActivityType.Playing,
            name: '/help',
        })
    },
}
