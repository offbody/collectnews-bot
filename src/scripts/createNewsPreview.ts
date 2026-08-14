import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  createNewsDigest,
  createNewsMessage,
} from "../publishing/createNewsMessage.js"
import {
  fetchRssNews,
  getSelectionStats,
  loadFeeds,
  selectNewsForPublication,
} from "../sources/rssSource.js"
import { enrichNewsSummaries } from "../sources/articleSummary.js"
import {
  getPublishedLinks,
  loadPublishedNewsStore,
} from "../state/publishedNewsStore.js"
import type { NewsSelection } from "../types.js"

const args = parseArgs(process.argv.slice(2))
const feedsPath = args.feeds ?? "data/feeds.json"
const outputJsonPath = path.resolve(args.json ?? "output/news-selection.json")
const outputMessagePath = path.resolve(args.message ?? "output/news-message.txt")
const outputDigestPath = path.resolve(args.digest ?? "output/news-digest.txt")
const statePath = path.resolve(args.state ?? "data/published-news.json")
const limit = Number.parseInt(args.limit ?? "10", 10)
const timezone = args.timezone ?? "Asia/Yakutsk"
const targetDate = args.date ?? formatDateKey(new Date(), timezone)

const feeds = await loadFeeds(feedsPath)
const publishedStore = await loadPublishedNewsStore(statePath)
const excludedLinks = getPublishedLinks(publishedStore)
const items = await fetchRssNews(feeds)
const selectedItems = promoteInformativeItem(
  await enrichNewsSummaries(
    selectNewsForPublication(items, {
      limit,
      targetDate,
      timezone,
      requireImage: true,
      regionalRatio: 0.7,
      excludedLinks,
    }),
  ),
)

if (!selectedItems.length) {
  throw new Error(`No matching news items found for ${targetDate}.`)
}

const selection = {
  items: selectedItems,
  selectedAt: new Date().toISOString(),
  targetDate,
  timezone,
  reason: "latest dated RSS items with images, deduped and balanced by 70/30 regional/federal ratio",
  stats: getSelectionStats(items, selectedItems, {
    targetDate,
    timezone,
    requireImage: true,
    excludedLinks,
  }),
} satisfies NewsSelection

const message = createNewsMessage(selection)
const digest = createNewsDigest(selection)

await Promise.all([
  mkdir(path.dirname(outputJsonPath), { recursive: true }),
  mkdir(path.dirname(outputMessagePath), { recursive: true }),
  mkdir(path.dirname(outputDigestPath), { recursive: true }),
])
await Promise.all([
  writeFile(outputJsonPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8"),
  writeFile(outputMessagePath, `${message}\n`, "utf8"),
  writeFile(outputDigestPath, `${digest}\n`, "utf8"),
])

console.log(
  `Selected ${selection.items.length} items: ${selection.stats.selectedRegional} regional, ${selection.stats.selectedFederal} federal.`,
)
console.log(`Message ${path.relative(process.cwd(), outputMessagePath)}`)
console.log(`Digest ${path.relative(process.cwd(), outputDigestPath)}`)

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

function promoteInformativeItem<T extends { summary?: string }>(items: T[]) {
  const informativeIndex = items.findIndex(
    (item) => (item.summary?.length ?? 0) >= 220,
  )

  if (informativeIndex <= 0) {
    return items
  }

  return [
    items[informativeIndex]!,
    ...items.slice(0, informativeIndex),
    ...items.slice(informativeIndex + 1),
  ]
}
