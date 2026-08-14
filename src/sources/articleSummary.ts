import type { NewsItem } from "../types.js"

const SUMMARY_MIN_LENGTH = 180

export async function enrichNewsSummaries(items: NewsItem[]) {
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      if ((item.summary?.length ?? 0) >= SUMMARY_MIN_LENGTH) {
        return {
          ...item,
          summary: cleanSummary(item.summary ?? ""),
        }
      }

      const summary = await fetchArticleSummary(item.link)

      return {
        ...item,
        summary: cleanSummary(summary ?? item.summary ?? ""),
      }
    }),
  )

  return enrichedItems
}

async function fetchArticleSummary(url: string) {
  if (!url) {
    return undefined
  }

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "news-bot/0.1 article summary",
      },
    })

    if (!response.ok) {
      return undefined
    }

    const html = await response.text()

    const metaSummary =
      readMetaContent(html, "og:description") ??
      readMetaContent(html, "description") ??
      readMetaContent(html, "twitter:description")

    if ((metaSummary?.length ?? 0) >= SUMMARY_MIN_LENGTH) {
      return metaSummary
    }

    return joinArticleParagraphs([metaSummary, ...extractArticleParagraphs(html)])
  } catch {
    return undefined
  }
}

function readMetaContent(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const directMatch = html.match(
    new RegExp(
      `<meta\\b[^>]*(?:property|name)=["']${escapedName}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`,
      "i",
    ),
  )
  const reversedMatch = html.match(
    new RegExp(
      `<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*(?:property|name)=["']${escapedName}["'][^>]*>`,
      "i",
    ),
  )

  return decodeHtml(directMatch?.[1] ?? reversedMatch?.[1] ?? "").trim() || undefined
}

function cleanSummary(value: string) {
  return dedupeSentences(decodeHtml(value)
    .replace(/\s*Сообщение .+? появились сначала .+$/i, "")
    .replace(/\s*Запись .+? впервые появилась .+$/i, "")
    .replace(/\s*Читайте также:.*$/i, "")
    .replace(/\s+/g, " ")
    .trim())
}

function extractArticleParagraphs(html: string) {
  const candidates = [
    ...readBlocksByClass(html, "article__text"),
    ...readBlocksByClass(html, "entry-content"),
    ...readBlocksByClass(html, "post-content"),
    ...readBlocksByClass(html, "td-post-content"),
    ...[...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(
      (match) => match[1] ?? "",
    ),
  ]
  const paragraphs = candidates.flatMap((candidate) =>
    [...candidate.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) =>
      htmlToText(match[1] ?? ""),
    ),
  )

  return paragraphs
    .map(cleanSummary)
    .filter((paragraph) => isUsefulParagraph(paragraph))
    .slice(0, 3)
}

function readBlocksByClass(html: string, className: string) {
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  return [...html.matchAll(
    new RegExp(
      `<(?:div|section)\\b[^>]*class=["'][^"']*${escapedClassName}[^"']*["'][^>]*>([\\s\\S]*?)<\\/(?:div|section)>`,
      "gi",
    ),
  )].map((match) => match[1] ?? "")
}

function joinArticleParagraphs(values: Array<string | undefined>) {
  const seen = new Set<string>()
  const summary = values
    .map((value) => cleanSummary(value ?? ""))
    .filter((value) => value && !seen.has(normalizeSummaryKey(value)))
    .filter((value) => {
      seen.add(normalizeSummaryKey(value))
      return true
    })
    .map(ensureSentenceEnd)
    .join(" ")

  return summary || undefined
}

function htmlToText(value: string) {
  return decodeHtml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
}

function isUsefulParagraph(value: string) {
  return (
    value.length >= 60 &&
    !/^(фото|источник|поделиться|читать|подписывайтесь)\b/i.test(value)
  )
}

function normalizeSummaryKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").slice(0, 120)
}

function dedupeSentences(value: string) {
  const seen = new Set<string>()
  const sentences = value.match(/[^.!?。]+[.!?。]?/g) ?? [value]

  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => {
      const key = normalizeSentenceKey(sentence)

      if (
        Array.from(seen).some(
          (seenKey) => seenKey.includes(key) || key.includes(seenKey),
        )
      ) {
        return false
      }

      seen.add(key)
      return true
    })
    .join(" ")
}

function normalizeSentenceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}

function ensureSentenceEnd(value: string) {
  return /[.!?。]$/.test(value) ? value : `${value}.`
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#171;", "«")
    .replaceAll("&#187;", "»")
    .replaceAll("&#8212;", "—")
    .replaceAll("&#8230;", "...")
    .replaceAll("&#39;", "'")
}
