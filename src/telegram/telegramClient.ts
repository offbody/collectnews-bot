import type { TelegramConfig } from "./telegramConfig.js"

type TelegramApiResponse<T> =
  | {
      ok: true
      result: T
    }
  | {
      ok: false
      description?: string
    }

export type TelegramChat = {
  id: number
  title?: string
  username?: string
  type: string
}

export type TelegramMessage = {
  message_id: number
  chat: TelegramChat
}

export async function getTelegramChat(config: TelegramConfig) {
  const formData = new FormData()
  formData.set("chat_id", config.chatId)

  return callTelegramApi<TelegramChat>(config, "getChat", formData)
}

export async function sendTelegramMessage(options: {
  config: TelegramConfig
  text: string
}) {
  const formData = new FormData()

  formData.set("chat_id", options.config.chatId)
  formData.set("text", options.text)
  formData.set("parse_mode", "HTML")
  formData.set("disable_web_page_preview", "false")

  return callTelegramApi<TelegramMessage>(
    options.config,
    "sendMessage",
    formData,
  )
}

async function callTelegramApi<T>(
  config: TelegramConfig,
  method: string,
  body: FormData,
) {
  const response = await fetch(
    `https://api.telegram.org/bot${config.botToken}/${method}`,
    {
      method: "POST",
      body,
    },
  )
  const payload = (await response.json()) as TelegramApiResponse<T>

  if (!payload.ok) {
    throw new Error(
      `Telegram ${method} failed: ${payload.description ?? response.statusText}`,
    )
  }

  return payload.result
}
