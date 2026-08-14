import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  dispatchWorkflow,
  upsertRepositoryVariable,
} from "../github/githubActionsClient.js"

type ControlBotConfig = {
  botToken: string
  adminUserIds: Set<number>
  githubToken: string
  githubRepository: string
  githubWorkflowId: string
  githubRef: string
}

type PublishDraft = {
  dryRun: boolean
  limit: number
}

type ScheduleDraft = {
  enabled: boolean
  limit: number
}

type MenuView = "main" | "schedule"

type ActionResult = {
  notice?: string
  view: MenuView
}

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    text?: string
    chat: {
      id: number
    }
    from?: {
      id: number
    }
  }
  callback_query?: {
    id: string
    data?: string
    from: {
      id: number
    }
    message?: {
      message_id: number
      chat: {
        id: number
      }
    }
  }
}

type TelegramApiResponse<T> =
  | {
      ok: true
      result: T
    }
  | {
      ok: false
      description?: string
    }

const args = parseArgs(process.argv.slice(2))
const envPath = path.resolve(args.env ?? ".secrets/control.env")
const config = await loadControlBotConfig(envPath)
const publishDrafts = new Map<number, PublishDraft>()
const scheduleDrafts = new Map<number, ScheduleDraft>()

let offset = 0
console.log("News Telegram control bot started.")

while (true) {
  const updates = await getUpdates(config.botToken, offset)

  for (const update of updates) {
    offset = update.update_id + 1

    try {
      await handleUpdate(config, publishDrafts, scheduleDrafts, update)
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Update failed.")
    }
  }
}

async function handleUpdate(
  config: ControlBotConfig,
  publishDrafts: Map<number, PublishDraft>,
  scheduleDrafts: Map<number, ScheduleDraft>,
  update: TelegramUpdate,
) {
  if (update.message) {
    await handleMessage(config, publishDrafts, scheduleDrafts, update.message)
    return
  }

  if (update.callback_query) {
    await handleCallbackQuery(
      config,
      publishDrafts,
      scheduleDrafts,
      update.callback_query,
    )
  }
}

async function handleMessage(
  config: ControlBotConfig,
  publishDrafts: Map<number, PublishDraft>,
  scheduleDrafts: Map<number, ScheduleDraft>,
  message: NonNullable<TelegramUpdate["message"]>,
) {
  const userId = message.from?.id

  if (userId === undefined || !isAdmin(config, userId)) {
    await sendMessage(config.botToken, {
      chatId: message.chat.id,
      text: `Access denied.${userId === undefined ? "" : ` Your user id: ${userId}`}`,
    })
    return
  }

  if (message.text === "/start" || message.text === "/publish") {
    await sendControlMenu(
      config.botToken,
      message.chat.id,
      getPublishDraft(publishDrafts, userId),
      getScheduleDraft(scheduleDrafts, userId),
      "main",
    )
    return
  }

  if (message.text === "/schedule") {
    await sendControlMenu(
      config.botToken,
      message.chat.id,
      getPublishDraft(publishDrafts, userId),
      getScheduleDraft(scheduleDrafts, userId),
      "schedule",
    )
    return
  }

  await sendMessage(config.botToken, {
    chatId: message.chat.id,
    text: "Use /publish to open news publishing controls or /schedule to open scheduled publishing controls.",
  })
}

async function handleCallbackQuery(
  config: ControlBotConfig,
  publishDrafts: Map<number, PublishDraft>,
  scheduleDrafts: Map<number, ScheduleDraft>,
  callbackQuery: NonNullable<TelegramUpdate["callback_query"]>,
) {
  const message = callbackQuery.message

  if (!message) {
    await answerCallbackQuery(config.botToken, callbackQuery.id)
    return
  }

  if (!isAdmin(config, callbackQuery.from.id)) {
    await answerCallbackQuery(config.botToken, callbackQuery.id, "Access denied.")
    return
  }

  const publishDraft = getPublishDraft(publishDrafts, callbackQuery.from.id)
  const scheduleDraft = getScheduleDraft(scheduleDrafts, callbackQuery.from.id)
  const data = callbackQuery.data ?? ""
  let view: MenuView = "main"
  let notice: string | undefined

  try {
    const result = await applyAction(config, publishDraft, scheduleDraft, data)
    view = result.view
    notice = result.notice
    await answerCallbackQuery(config.botToken, callbackQuery.id, result.notice)
  } catch (error) {
    notice = error instanceof Error ? error.message : "Action failed."
    await answerCallbackQuery(config.botToken, callbackQuery.id, notice)
  }

  await editControlMenu(
    config.botToken,
    message.chat.id,
    message.message_id,
    publishDraft,
    scheduleDraft,
    view,
    notice,
  )
}

async function applyAction(
  config: ControlBotConfig,
  publishDraft: PublishDraft,
  scheduleDraft: ScheduleDraft,
  data: string,
): Promise<ActionResult> {
  if (data.startsWith("view:")) {
    return { view: parseMenuView(data.slice("view:".length)) }
  }

  if (data === "publish:toggle_dry_run") {
    publishDraft.dryRun = !publishDraft.dryRun
    return { view: "main" }
  }

  if (data === "publish:limit:-") {
    publishDraft.limit = Math.max(1, publishDraft.limit - 5)
    return { view: "main" }
  }

  if (data === "publish:limit:+") {
    publishDraft.limit = Math.min(50, publishDraft.limit + 5)
    return { view: "main" }
  }

  if (data === "publish:run") {
    await dispatchWorkflow({
      token: config.githubToken,
      repository: config.githubRepository,
      workflowId: config.githubWorkflowId,
      ref: config.githubRef,
      inputs: {
        dry_run: String(publishDraft.dryRun),
        limit: String(publishDraft.limit),
      },
    })

    return {
      notice: publishDraft.dryRun
        ? "Dry-run workflow dispatched."
        : "Live publish workflow dispatched.",
      view: "main",
    }
  }

  if (data === "schedule:toggle_enabled") {
    scheduleDraft.enabled = !scheduleDraft.enabled
    return { view: "schedule" }
  }

  if (data === "schedule:limit:-") {
    scheduleDraft.limit = Math.max(1, scheduleDraft.limit - 5)
    return { view: "schedule" }
  }

  if (data === "schedule:limit:+") {
    scheduleDraft.limit = Math.min(50, scheduleDraft.limit + 5)
    return { view: "schedule" }
  }

  if (data === "schedule:save") {
    await Promise.all([
      upsertRepositoryVariable({
        token: config.githubToken,
        repository: config.githubRepository,
        name: "SCHEDULE_ENABLED",
        value: String(scheduleDraft.enabled),
      }),
      upsertRepositoryVariable({
        token: config.githubToken,
        repository: config.githubRepository,
        name: "SCHEDULE_LIMIT",
        value: String(scheduleDraft.limit),
      }),
    ])

    return {
      notice: "Scheduled settings saved to GitHub.",
      view: "schedule",
    }
  }

  throw new Error("Unknown action.")
}

async function sendControlMenu(
  botToken: string,
  chatId: number,
  publishDraft: PublishDraft,
  scheduleDraft: ScheduleDraft,
  view: MenuView,
  notice?: string,
) {
  await sendMessage(botToken, {
    chatId,
    text: renderMenu(publishDraft, scheduleDraft, view, notice),
    replyMarkup: createKeyboard(publishDraft, scheduleDraft, view),
  })
}

async function editControlMenu(
  botToken: string,
  chatId: number,
  messageId: number,
  publishDraft: PublishDraft,
  scheduleDraft: ScheduleDraft,
  view: MenuView,
  notice?: string,
) {
  try {
    await callTelegramApi(botToken, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: renderMenu(publishDraft, scheduleDraft, view, notice),
      reply_markup: createKeyboard(publishDraft, scheduleDraft, view),
    })
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return
    }

    throw error
  }
}

function renderMenu(
  publishDraft: PublishDraft,
  scheduleDraft: ScheduleDraft,
  view: MenuView,
  notice?: string,
) {
  if (view === "schedule") {
    return withNotice(
      [
        "News schedule control",
        "",
        `Scheduled publish: ${scheduleDraft.enabled ? "enabled" : "disabled"}`,
        `Selection limit: ${scheduleDraft.limit}`,
        "",
        "The GitHub workflow keeps the 30 daily candidate slots. These settings tell scheduled runs whether to publish and how large the candidate batch should be.",
      ],
      notice,
    )
  }

  return withNotice(
    [
      "News publish control",
      "",
      `Mode: ${publishDraft.dryRun ? "dry run" : "live publish"}`,
      `Selection limit: ${publishDraft.limit}`,
      "",
      "Run Publish dispatches the GitHub Actions workflow. Live publish posts one selected item and records it in published state.",
    ],
    notice,
  )
}

function createKeyboard(
  publishDraft: PublishDraft,
  scheduleDraft: ScheduleDraft,
  view: MenuView,
) {
  if (view === "schedule") {
    return {
      inline_keyboard: [
        [
          {
            text: `scheduled: ${scheduleDraft.enabled ? "on" : "off"}`,
            callback_data: "schedule:toggle_enabled",
          },
        ],
        [
          { text: "- limit", callback_data: "schedule:limit:-" },
          { text: `${scheduleDraft.limit}`, callback_data: "view:schedule" },
          { text: "+ limit", callback_data: "schedule:limit:+" },
        ],
        [{ text: "Save Schedule", callback_data: "schedule:save" }],
        [{ text: "Back to Publish", callback_data: "view:main" }],
      ],
    }
  }

  return {
    inline_keyboard: [
      [
        {
          text: `dry_run: ${publishDraft.dryRun ? "on" : "off"}`,
          callback_data: "publish:toggle_dry_run",
        },
      ],
      [
        { text: "- limit", callback_data: "publish:limit:-" },
        { text: `${publishDraft.limit}`, callback_data: "view:main" },
        { text: "+ limit", callback_data: "publish:limit:+" },
      ],
      [{ text: "Schedule", callback_data: "view:schedule" }],
      [{ text: "Run Publish", callback_data: "publish:run" }],
    ],
  }
}

function getPublishDraft(drafts: Map<number, PublishDraft>, userId: number) {
  const existingDraft = drafts.get(userId)

  if (existingDraft) {
    return existingDraft
  }

  const draft = {
    dryRun: true,
    limit: 10,
  } satisfies PublishDraft
  drafts.set(userId, draft)

  return draft
}

function getScheduleDraft(drafts: Map<number, ScheduleDraft>, userId: number) {
  const existingDraft = drafts.get(userId)

  if (existingDraft) {
    return existingDraft
  }

  const draft = {
    enabled: true,
    limit: 10,
  } satisfies ScheduleDraft
  drafts.set(userId, draft)

  return draft
}

async function getUpdates(botToken: string, offset: number) {
  return callTelegramApi<TelegramUpdate[]>(botToken, "getUpdates", {
    offset,
    timeout: 30,
    allowed_updates: ["message", "callback_query"],
  })
}

async function sendMessage(
  botToken: string,
  options: {
    chatId: number
    text: string
    replyMarkup?: unknown
  },
) {
  await callTelegramApi(botToken, "sendMessage", {
    chat_id: options.chatId,
    text: options.text,
    reply_markup: options.replyMarkup,
  })
}

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
) {
  await callTelegramApi(botToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  })
}

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as TelegramApiResponse<T>

  if (!payload.ok) {
    throw new Error(
      `Telegram ${method} failed: ${payload.description ?? response.statusText}`,
    )
  }

  return payload.result
}

function isMessageNotModifiedError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("message is not modified")
  )
}

async function loadControlBotConfig(envPath: string) {
  const fileEnv = await readOptionalEnvFile(envPath)
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? fileEnv.TELEGRAM_BOT_TOKEN
  const adminUserIds =
    process.env.TELEGRAM_ADMIN_USER_IDS ?? fileEnv.TELEGRAM_ADMIN_USER_IDS
  const githubToken = process.env.GITHUB_TOKEN ?? fileEnv.GITHUB_TOKEN
  const githubRepository =
    process.env.GITHUB_REPOSITORY ??
    fileEnv.GITHUB_REPOSITORY ??
    "offbody/collectnews-bot"
  const githubWorkflowId =
    process.env.GITHUB_WORKFLOW_ID ??
    fileEnv.GITHUB_WORKFLOW_ID ??
    "publish-news.yml"
  const githubRef = process.env.GITHUB_REF ?? fileEnv.GITHUB_REF ?? "main"

  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.")
  }

  if (!adminUserIds) {
    throw new Error("Missing TELEGRAM_ADMIN_USER_IDS.")
  }

  if (!githubToken) {
    throw new Error("Missing GITHUB_TOKEN.")
  }

  return {
    botToken,
    adminUserIds: parseAdminUserIds(adminUserIds),
    githubToken,
    githubRepository,
    githubWorkflowId,
    githubRef,
  } satisfies ControlBotConfig
}

async function readOptionalEnvFile(envPath: string) {
  try {
    return await readEnvFile(envPath)
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return {}
      }
    }

    throw error
  }
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

function parseAdminUserIds(value: string) {
  const adminUserIds = new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Number.parseInt(part, 10)),
  )

  if (
    adminUserIds.size === 0 ||
    Array.from(adminUserIds).some((userId) => !Number.isInteger(userId))
  ) {
    throw new Error("TELEGRAM_ADMIN_USER_IDS must contain Telegram numeric user ids.")
  }

  return adminUserIds
}

function parseMenuView(value: string): MenuView {
  if (value === "main" || value === "schedule") {
    return value
  }

  throw new Error(`Unknown menu view: ${value}`)
}

function isAdmin(config: ControlBotConfig, userId: number) {
  return config.adminUserIds.has(userId)
}

function withNotice(lines: string[], notice?: string) {
  if (!notice) {
    return lines.join("\n")
  }

  return [`Status: ${notice}`, "", ...lines].join("\n")
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
