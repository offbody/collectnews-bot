import type { NewsSelection } from "../types.js"

export function createNewsMessage(selection: NewsSelection) {
  const { item } = selection
  const lines = [`<b>${escapeHtml(item.title)}</b>`]

  if (item.summary) {
    lines.push("")
    lines.push(escapeHtml(truncate(item.summary, 320)))
  }

  lines.push("")
  lines.push(`Источник: ${escapeHtml(item.sourceName)}`)

  if (item.link) {
    lines.push(`Ссылка: ${formatLink(item.link, "читать")}`)
  }

  return lines.join("\n")
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
