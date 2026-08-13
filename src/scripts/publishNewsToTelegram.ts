import { readFile } from "node:fs/promises"
import path from "node:path"
import { createNewsMessage } from "../publishing/createNewsMessage.js"
import { appendPublishedNews } from "../state/publishedNewsStore.js"
import {
  getTelegramChat,
  sendTelegramPhoto,
  sendTelegramMessage,
} from "../telegram/telegramClient.js"
import { loadTelegramConfig } from "../telegram/telegramConfig.js"
import type { NewsSelection } from "../types.js"

const args = parseArgs(process.argv.slice(2))
const messagePath = path.resolve(args.message ?? "output/news-message.txt")
const selectionPath = path.resolve(args.selection ?? "output/news-selection.json")
const statePath = path.resolve(args.state ?? "data/published-news.json")
const envPath = args.env ? path.resolve(args.env) : undefined
const dryRun = args["dry-run"] === "true" || args["dry-run"] === "1"

const [config, text, selection] = await Promise.all([
  loadTelegramConfig(envPath),
  readFile(messagePath, "utf8"),
  readSelection(selectionPath),
])
const chat = await getTelegramChat(config)
const item = selection.items[0]

if (!item) {
  throw new Error("No selected news item to publish.")
}

if (dryRun) {
  console.log(`Telegram dry-run target: ${formatChat(chat)}`)
  console.log(`Telegram dry-run message lines: ${text.trimEnd().split("\n").length}`)
  console.log(
    `Telegram dry-run mode: ${item.imageUrl ? "photo with caption" : "text message"}`,
  )
  process.exit(0)
}

const message = item.imageUrl
  ? await sendTelegramPhoto({
      config,
      photoUrl: item.imageUrl,
      caption: createNewsMessage(selection, {
        includeImageLink: false,
        maxSummaryLength: 260,
      }),
    })
  : await sendTelegramMessage({
      config,
      text: text.trimEnd(),
    })

await appendPublishedNews(statePath, item, {
  telegramMessageId: message.message_id,
})

console.log(
  `Published Telegram message ${message.message_id} to ${formatChat(message.chat)}`,
)

function formatChat(chat: {
  id: number
  title?: string
  username?: string
  type: string
}) {
  const label = chat.title ?? chat.username ?? String(chat.id)
  return `${label} (${chat.type})`
}

function parseArgs(rawArgs: string[]) {
  const parsed: Record<string, string> = {}

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]

    if (arg === "--") {
      continue
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const key = arg.slice(2)
    const value = rawArgs[index + 1]

    if (!value || value.startsWith("--")) {
      parsed[key] = "true"
      continue
    }

    parsed[key] = value
    index += 1
  }

  return parsed
}

async function readSelection(selectionPath: string) {
  const content = await readFile(selectionPath, "utf8")
  return JSON.parse(content) as NewsSelection
}
