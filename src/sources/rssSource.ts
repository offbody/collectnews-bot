import { readFile } from "node:fs/promises"
import type { NewsFeed, NewsItem } from "../types.js"

const REGION_KEYWORDS = [
  "якутск",
  "якутия",
  "саха",
  "yakutsk",
  "yakutia",
  "sakha",
]

export async function loadFeeds(path = "data/feeds.json") {
  const content = await readFile(path, "utf8")
  const feeds = JSON.parse(content) as NewsFeed[]

  return feeds.filter((feed) => feed.enabled)
}

export async function fetchRssNews(feeds: NewsFeed[]) {
  const feedItems = await Promise.all(
    feeds.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          "user-agent": "news-bot/0.1",
        },
      })

      if (!response.ok) {
        throw new Error(`Could not fetch ${feed.name}: ${response.status}`)
      }

      return parseRss(await response.text(), feed.name)
    }),
  )

  return feedItems.flat()
}

export function selectRegionalNews(items: NewsItem[]) {
  const seen = new Set<string>()

  return items
    .filter((item) => {
      const haystack = `${item.title}\n${item.summary ?? ""}`.toLowerCase()
      return REGION_KEYWORDS.some((keyword) => haystack.includes(keyword))
    })
    .filter((item) => {
      const key = normalizeDedupeKey(item)

      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
    .sort(compareByPublishedDate)
}

export function parseRss(xml: string, sourceName: string): NewsItem[] {
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(
    (match) => match[0],
  )

  return itemBlocks.map((block, index) => {
    const title = normalizeText(readTag(block, "title") ?? "Untitled")
    const link = normalizeText(readTag(block, "link") ?? "")
    const summary = normalizeText(
      readTag(block, "description") ?? readTag(block, "content:encoded") ?? "",
    )
    const guid = normalizeText(readTag(block, "guid") ?? link)
    const publishedAt = normalizeText(readTag(block, "pubDate") ?? "")

    return {
      id: guid || `${sourceName}:${index}:${title}`,
      sourceName,
      title,
      link,
      summary: summary || undefined,
      publishedAt: publishedAt || undefined,
    }
  })
}

function readTag(block: string, tagName: string) {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = block.match(
    new RegExp(`<${escapedTagName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTagName}>`, "i"),
  )

  return match?.[1]
}

function normalizeText(value: string) {
  return decodeXml(value)
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
}

function normalizeDedupeKey(item: NewsItem) {
  return (item.link || item.title).toLowerCase().replace(/\s+/g, " ").trim()
}

function compareByPublishedDate(left: NewsItem, right: NewsItem) {
  return parseDate(right.publishedAt) - parseDate(left.publishedAt)
}

function parseDate(value?: string) {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}
