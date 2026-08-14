import { readFile } from "node:fs/promises"
import path from "node:path"
import { createNewsMessage } from "../publishing/createNewsMessage.js"
import { appendPublishedNews } from "../state/publishedNewsStore.js"
import {
  getTelegramChat,
  sendTelegramPhoto,
  sendTelegramPhotoFile,
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

const message = await publishSelection()

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

async function publishSelection() {
  if (!item.imageUrl) {
    return sendTelegramMessage({
      config,
      text: text.trimEnd(),
    })
  }

  try {
    return await sendTelegramPhoto({
      config,
      photoUrl: item.imageUrl,
      caption: createNewsMessage(selection, {
        includeImageLink: false,
        maxSummaryLength: 720,
        maxMessageLength: 1000,
      }),
    })
  } catch (error) {
    if (!isTelegramPhotoContentError(error)) {
      throw error
    }

    console.warn(
      "Telegram rejected the image URL as photo content; trying downloaded image file.",
    )

    return publishDownloadedImageOrText(item.imageUrl)
  }
}

async function publishDownloadedImageOrText(imageUrl: string) {
  try {
    const photo = await downloadTelegramPhoto(imageUrl)

    return await sendTelegramPhotoFile({
      config,
      photo: photo.blob,
      filename: photo.filename,
      caption: createNewsMessage(selection, {
        includeImageLink: false,
        maxSummaryLength: 720,
        maxMessageLength: 1000,
      }),
    })
  } catch (error) {
    console.warn(
      `Could not publish downloaded image; falling back to text message. ${formatError(error)}`,
    )

    return sendTelegramMessage({
      config,
      text: createNewsMessage(selection, {
        includeImageLink: true,
        maxSummaryLength: 720,
        maxMessageLength: 1600,
      }),
    })
  }
}

async function downloadTelegramPhoto(imageUrl: string) {
  const response = await fetch(imageUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "user-agent": "collectnews-bot/0.1 (+https://github.com/offbody/collectnews-bot)",
    },
  })

  if (!response.ok) {
    throw new Error(`image download failed with HTTP ${response.status}`)
  }

  const contentType = normalizeContentType(response.headers.get("content-type"))

  if (!contentType.startsWith("image/")) {
    throw new Error(`downloaded content is not an image: ${contentType || "unknown"}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const maxTelegramPhotoBytes = 10 * 1024 * 1024

  if (arrayBuffer.byteLength > maxTelegramPhotoBytes) {
    throw new Error(
      `downloaded image is too large for Telegram photo upload: ${arrayBuffer.byteLength} bytes`,
    )
  }

  return {
    blob: new Blob([arrayBuffer], { type: contentType }),
    filename: createImageFilename(imageUrl, contentType),
  }
}

function normalizeContentType(contentType: string | null) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? ""
}

function createImageFilename(imageUrl: string, contentType: string) {
  const extension =
    extensionFromContentType(contentType) ?? extensionFromUrl(imageUrl) ?? "jpg"

  return `news-image.${extension}`
}

function extensionFromContentType(contentType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }

  return extensions[contentType]
}

function extensionFromUrl(imageUrl: string) {
  try {
    const extension = path.extname(new URL(imageUrl).pathname).slice(1).toLowerCase()
    return extension || undefined
  } catch {
    return undefined
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isTelegramPhotoContentError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("wrong type of the web page content") ||
      error.message.includes("failed to get HTTP URL content") ||
      error.message.includes("wrong file identifier/HTTP URL specified"))
  )
}
