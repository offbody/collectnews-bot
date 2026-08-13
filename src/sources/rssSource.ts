import { readFile } from "node:fs/promises"
import type { NewsFeed, NewsItem } from "../types.js"

const DEFAULT_TIMEZONE = "Asia/Yakutsk"
const DEFAULT_REGIONAL_RATIO = 0.7

export async function loadFeeds(path = "data/feeds.json") {
  const content = await readFile(path, "utf8")
  const feeds = JSON.parse(content) as NewsFeed[]

  return feeds.filter((feed) => feed.enabled)
}

export async function fetchRssNews(feeds: NewsFeed[]) {
  const feedResults = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          "user-agent": "news-bot/0.1",
        },
      })

      if (!response.ok) {
        throw new Error(`Could not fetch ${feed.name}: ${response.status}`)
      }

      return parseRss(await response.text(), feed)
    }),
  )

  return feedResults.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return result.value
    }

    console.warn(`Skipped ${feeds[index]?.name}: ${result.reason}`)
    return []
  })
}

export function selectNewsForPublication(
  items: NewsItem[],
  options: {
    limit?: number
    now?: Date
    targetDate?: string
    timezone?: string
    regionalRatio?: number
    requireImage?: boolean
    excludedLinks?: Set<string>
  } = {},
) {
  const timezone = options.timezone ?? DEFAULT_TIMEZONE
  const targetDate =
    options.targetDate ?? formatDateKey(options.now ?? new Date(), timezone)
  const limit = options.limit ?? 10
  const regionalLimit = Math.round(limit * (options.regionalRatio ?? DEFAULT_REGIONAL_RATIO))
  const federalLimit = Math.max(0, limit - regionalLimit)

  const datedForTargetDay = items.filter((item) =>
    isSameDateKey(item.publishedTimestamp, targetDate, timezone),
  )
  const withImages = datedForTargetDay.filter((item) =>
    options.requireImage === false ? true : Boolean(item.imageUrl),
  )
  const withoutPublished = filterPublishedItems(withImages, options.excludedLinks)
  const ranked = dedupeNews(withoutPublished)
    .map((item) => ({
      ...item,
      score: scoreNewsItem(item),
    }))
    .sort(compareByScore)

  const regionalItems = ranked
    .filter((item) => item.sourceScope === "regional")
    .slice(0, regionalLimit)
  const federalItems = ranked
    .filter((item) => item.sourceScope === "federal")
    .slice(0, federalLimit)
  const selected = [...regionalItems, ...federalItems]

  if (selected.length < limit) {
    const selectedKeys = new Set(selected.map(normalizeDedupeKey))
    const backfill = ranked
      .filter((item) => !selectedKeys.has(normalizeDedupeKey(item)))
      .slice(0, limit - selected.length)

    selected.push(...backfill)
  }

  return selected.sort(compareByScore)
}

export function getSelectionStats(
  items: NewsItem[],
  selectedItems: NewsItem[],
  options: {
    targetDate: string
    timezone?: string
    requireImage?: boolean
    excludedLinks?: Set<string>
  },
) {
  const timezone = options.timezone ?? DEFAULT_TIMEZONE
  const datedForTargetDay = items.filter((item) =>
    isSameDateKey(item.publishedTimestamp, options.targetDate, timezone),
  )
  const withImages = datedForTargetDay.filter((item) =>
    options.requireImage === false ? true : Boolean(item.imageUrl),
  )
  const withoutPublished = filterPublishedItems(withImages, options.excludedLinks)

  return {
    totalFetched: items.length,
    datedForTargetDay: datedForTargetDay.length,
    withImages: withImages.length,
    excludedPublished: withImages.length - withoutPublished.length,
    selectedRegional: selectedItems.filter((item) => item.sourceScope === "regional").length,
    selectedFederal: selectedItems.filter((item) => item.sourceScope === "federal").length,
  }
}

export function parseRss(xml: string, feed: NewsFeed | string): NewsItem[] {
  const sourceName = typeof feed === "string" ? feed : feed.name
  const sourceScope = typeof feed === "string" ? "regional" : feed.scope
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
    const imageUrl = extractImageUrl(block)
    const publishedTimestamp = parseDate(publishedAt)

    return {
      id: guid || `${sourceName}:${index}:${title}`,
      sourceName,
      sourceScope,
      title,
      link,
      summary: summary || undefined,
      imageUrl,
      publishedAt: publishedAt || undefined,
      publishedTimestamp: publishedTimestamp || undefined,
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
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
}

function extractImageUrl(block: string) {
  const enclosure = readAttribute(readSelfClosingTag(block, "enclosure"), "url")
  const mediaContent = readAttribute(readSelfClosingTag(block, "media:content"), "url")
  const mediaThumbnail = readAttribute(readSelfClosingTag(block, "media:thumbnail"), "url")
  const descriptionImage = block.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
  const imageUrl = enclosure ?? mediaContent ?? mediaThumbnail ?? descriptionImage

  return imageUrl ? decodeXml(imageUrl) : undefined
}

function readSelfClosingTag(block: string, tagName: string) {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return block.match(new RegExp(`<${escapedTagName}\\b[^>]*\\/?>`, "i"))?.[0]
}

function readAttribute(tag: string | undefined, attributeName: string) {
  if (!tag) {
    return undefined
  }

  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return tag.match(
    new RegExp(`${escapedAttributeName}=["']([^"']+)["']`, "i"),
  )?.[1]
}

function dedupeNews(items: NewsItem[]) {
  const seen = new Set<string>()

  return items.filter((item) => {
    const key = normalizeDedupeKey(item)

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function filterPublishedItems(items: NewsItem[], excludedLinks?: Set<string>) {
  if (!excludedLinks?.size) {
    return items
  }

  return items.filter((item) => !excludedLinks.has(normalizePublishedLink(item.link)))
}

function normalizeDedupeKey(item: NewsItem) {
  return (item.link || item.title).toLowerCase().replace(/\s+/g, " ").trim()
}

function normalizePublishedLink(link: string) {
  return link.toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "").trim()
}

function scoreNewsItem(item: NewsItem) {
  return item.publishedTimestamp ?? parseDate(item.publishedAt)
}

function compareByScore(left: NewsItem, right: NewsItem) {
  return (right.score ?? 0) - (left.score ?? 0)
}

function parseDate(value?: string) {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function isSameDateKey(
  timestamp: number | undefined,
  targetDate: string,
  timezone: string,
) {
  if (!timestamp) {
    return false
  }

  return formatDateKey(new Date(timestamp), timezone) === targetDate
}

function formatDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`
}
