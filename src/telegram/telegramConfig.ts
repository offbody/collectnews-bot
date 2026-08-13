import { readFile } from "node:fs/promises"

export type TelegramConfig = {
  botToken: string
  chatId: string
}

export async function loadTelegramConfig(envPath?: string) {
  const fileEnv = envPath ? await readEnvFile(envPath) : {}
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? fileEnv.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID ?? fileEnv.TELEGRAM_CHAT_ID

  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.")
  }

  if (!chatId) {
    throw new Error("Missing TELEGRAM_CHAT_ID.")
  }

  return {
    botToken,
    chatId,
  } satisfies TelegramConfig
}

async function readEnvFile(envPath: string) {
  const content = await readFile(envPath, "utf8")
  const values: Record<string, string> = {}

  for (const line of content.split("\n")) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf("=")

    if (separatorIndex === -1) {
      continue
    }

    values[trimmedLine.slice(0, separatorIndex).trim()] = unquote(
      trimmedLine.slice(separatorIndex + 1).trim(),
    )
  }

  return values
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}
