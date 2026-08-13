import { loadFeeds } from "../sources/rssSource.js"

const args = parseArgs(process.argv.slice(2))
const feedsPath = args.feeds ?? "data/feeds.json"

const feeds = await loadFeeds(feedsPath)
const results = await Promise.all(
  feeds.map(async (feed) => {
    try {
      const response = await fetch(feed.url, {
        headers: {
          "user-agent": "news-bot/0.1 RSS validation",
        },
      })
      const xml = await response.text()
      const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(
        (match) => match[0],
      )
      const imageCount = items.filter(hasImage).length
      const dates = items
        .map((item) => readTag(item, "pubDate") ?? readTag(item, "dc:date"))
        .filter(Boolean)
      const latestDate = dates
        .map((value) => Date.parse(value))
        .filter((timestamp) => !Number.isNaN(timestamp))
        .sort((left, right) => right - left)[0]

      return {
        name: feed.name,
        scope: feed.scope,
        status: response.status,
        ok: response.ok,
        items: items.length,
        imageItems: imageCount,
        latestAt: latestDate ? new Date(latestDate).toISOString() : undefined,
      }
    } catch (error) {
      return {
        name: feed.name,
        scope: feed.scope,
        status: 0,
        ok: false,
        items: 0,
        imageItems: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }),
)

for (const result of results) {
  const marker = result.ok && result.items > 0 && result.imageItems > 0 ? "OK" : "WARN"
  console.log(
    [
      marker,
      result.scope,
      result.name,
      `status=${result.status}`,
      `items=${result.items}`,
      `images=${result.imageItems}`,
      result.latestAt ? `latest=${result.latestAt}` : undefined,
      result.error ? `error=${result.error}` : undefined,
    ]
      .filter(Boolean)
      .join(" | "),
  )
}

const healthyFeeds = results.filter(
  (result) => result.ok && result.items > 0 && result.imageItems > 0,
)

if (healthyFeeds.length < 10) {
  throw new Error(`Expected at least 10 healthy feeds; received ${healthyFeeds.length}.`)
}

function readTag(block: string, tagName: string) {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return normalizeText(
    block.match(
      new RegExp(`<${escapedTagName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTagName}>`, "i"),
    )?.[1] ?? "",
  )
}

function normalizeText(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function hasImage(item: string) {
  return (
    /<enclosure\b[^>]*\burl=["'][^"']+["'][^>]*>/i.test(item) ||
    /<media:content\b[^>]*\burl=["'][^"']+["'][^>]*>/i.test(item) ||
    /<media:thumbnail\b[^>]*\burl=["'][^"']+["'][^>]*>/i.test(item) ||
    /<img\b[^>]*\bsrc=["'][^"']+["']/i.test(item)
  )
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
