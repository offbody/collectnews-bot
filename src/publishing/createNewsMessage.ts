import type { NewsSelection } from "../types.js"

export function createNewsMessage(selection: NewsSelection) {
  const item = selection.items[0]

  if (!item) {
    throw new Error("Cannot create a news message without selected items.")
  }

  const lines = [`<b>${escapeHtml(item.title)}</b>`]

  if (item.summary) {
    lines.push("")
    lines.push(escapeHtml(truncate(item.summary, 320)))
  }

  lines.push("")
  lines.push(`Источник: ${escapeHtml(item.sourceName)}`)

  if (item.imageUrl) {
    lines.push(`Изображение: ${formatLink(item.imageUrl, "открыть")}`)
  }

  if (item.link) {
    lines.push(`Ссылка: ${formatLink(item.link, "читать")}`)
  }

  return lines.join("\n")
}

export function createNewsDigest(selection: NewsSelection) {
  const lines = [
    `<b>Подборка новостей на ${escapeHtml(selection.targetDate)}</b>`,
    "",
  ]

  selection.items.forEach((item, index) => {
    lines.push(`${index + 1}. <b>${escapeHtml(item.title)}</b>`)
    lines.push(
      `${formatScope(item.sourceScope)} · ${escapeHtml(item.sourceName)} · ${formatPublishedAt(item.publishedAt)}`,
    )

    if (item.link) {
      lines.push(formatLink(item.link, "читать"))
    }

    if (item.imageUrl) {
      lines.push(formatLink(item.imageUrl, "изображение"))
    }

    lines.push("")
  })

  return lines.join("\n").trimEnd()
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`
}

function formatLink(url: string, label: string) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`
}

function formatScope(scope: "regional" | "federal") {
  return scope === "regional" ? "Регион" : "Россия"
}

function formatPublishedAt(value?: string) {
  if (!value) {
    return "без даты"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Yakutsk",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
