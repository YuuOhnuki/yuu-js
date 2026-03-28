import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
} from 'discord.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInfoEmbed } from '../../lib/embed'

export default {
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('ボットのバージョン情報を表示します'),

    async execute(interaction: ChatInputCommandInteraction) {
        // package.json からバージョンを読み取る
        const packageJson = JSON.parse(
            readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
        )
        const version = packageJson.version || '不明'

        // Git コミットハッシュを取得（可能なら）
        let commitHash = '不明'
        try {
            const { execSync } = require('node:child_process')
            commitHash = execSync('git rev-parse --short HEAD', {
                encoding: 'utf-8',
            }).trim()
        } catch {
            // Git が利用できない場合は無視
        }

        // 最新のアップデート情報（固定メッセージまたは外部ファイルから読み込み）
        const updates = [
            '• ユーザー辞書管理コマンドの追加',
            '• プリセット管理機能の改善',
            '• バージョンコマンドの追加',
            '• バグ修正とパフォーマンス改善',
        ]

        const embed = createInfoEmbed()
            .setTitle(`${interaction.client.user.displayName} バージョン`)
            .addFields(
                { name: 'バージョン', value: `v${version}`, inline: true },
                { name: 'コミット', value: `\`${commitHash}\``, inline: true },
                { name: '最新のアップデート', value: updates.join('\n') }
            )
            .setTimestamp()

        await interaction.reply({ embeds: [embed] })
    },
}
