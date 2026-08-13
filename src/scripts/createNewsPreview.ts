import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createNewsMessage } from "../publishing/createNewsMessage.js"
import {
  fetchRssNews,
  loadFeeds,
  selectRegionalNews,
} from "../sources/rssSource.js"
import type { NewsSelection } from "../types.js"

const args = parseArgs(process.argv.slice(2))
const feedsPath = args.feeds ?? "data/feeds.json"
const outputJsonPath = path.resolve(args.json ?? "output/news-selection.json")
const outputMessagePath = path.resolve(args.message ?? "output/news-message.txt")

const feeds = await loadFeeds(feedsPath)
const items = await fetchRssNews(feeds)
const regionalItems = selectRegionalNews(items)
const selectedItem = regionalItems[0]

if (!selectedItem) {
  throw new Error("No matching regional news item found.")
}

const selection = {
  item: selectedItem,
  selectedAt: new Date().toISOString(),
  reason: "latest regional RSS item after keyword filtering",
} satisfies NewsSelection

const message = createNewsMessage(selection)

await Promise.all([
  mkdir(path.dirname(outputJsonPath), { recursive: true }),
  mkdir(path.dirname(outputMessagePath), { recursive: true }),
])
await Promise.all([
  writeFile(outputJsonPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8"),
  writeFile(outputMessagePath, `${message}\n`, "utf8"),
])

console.log(`Selected ${selection.item.title}`)
console.log(`Message ${path.relative(process.cwd(), outputMessagePath)}`)

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
