import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { NewsItem, PublishedNewsRecord, PublishedNewsStore } from "../types.js"

const EMPTY_STORE: PublishedNewsStore = {
  version: 1,
  items: [],
}

export async function loadPublishedNewsStore(storePath: string) {
  try {
    const content = await readFile(storePath, "utf8")
    const parsed = JSON.parse(content) as PublishedNewsStore

    if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
      throw new Error(`Unsupported published news store format: ${storePath}`)
    }

    return parsed
  } catch (error) {
    if (isNotFoundError(error)) {
      return EMPTY_STORE
    }

    throw error
  }
}

export function getPublishedLinks(store: PublishedNewsStore) {
  return new Set(store.items.map((item) => normalizeLink(item.link)))
}

export async function appendPublishedNews(
  storePath: string,
  item: NewsItem,
  options: {
    postedAt?: string
    telegramMessageId?: number
  } = {},
) {
  const store = await loadPublishedNewsStore(storePath)
  const publishedLinks = getPublishedLinks(store)
  const normalizedLink = normalizeLink(item.link)

  if (publishedLinks.has(normalizedLink)) {
    return store
  }

  const record: PublishedNewsRecord = {
    link: item.link,
    title: item.title,
    sourceName: item.sourceName,
    sourceScope: item.sourceScope,
    publishedAt: item.publishedAt,
    imageUrl: item.imageUrl,
    postedAt: options.postedAt ?? new Date().toISOString(),
    telegramMessageId: options.telegramMessageId,
  }
  const nextStore = {
    version: 1,
    items: [record, ...store.items].slice(0, 500),
  } satisfies PublishedNewsStore

  await mkdir(path.dirname(storePath), { recursive: true })
  await writeFile(storePath, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8")

  return nextStore
}

export function normalizeLink(link: string) {
  return link.toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "").trim()
}

function isNotFoundError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}
