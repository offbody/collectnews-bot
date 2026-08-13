export type NewsFeed = {
  name: string
  url: string
  enabled: boolean
  scope: "regional" | "federal"
  reliability: "primary" | "standard"
}

export type NewsItem = {
  id: string
  sourceName: string
  sourceScope: NewsFeed["scope"]
  title: string
  link: string
  summary?: string
  imageUrl?: string
  publishedAt?: string
  publishedTimestamp?: number
  score?: number
}

export type NewsSelection = {
  items: NewsItem[]
  selectedAt: string
  targetDate: string
  timezone: string
  reason: string
  stats: {
    totalFetched: number
    datedForTargetDay: number
    withImages: number
    excludedPublished: number
    selectedRegional: number
    selectedFederal: number
  }
}

export type PublishedNewsRecord = {
  link: string
  title: string
  sourceName: string
  sourceScope: NewsFeed["scope"]
  publishedAt?: string
  imageUrl?: string
  postedAt: string
  telegramMessageId?: number
}

export type PublishedNewsStore = {
  version: 1
  items: PublishedNewsRecord[]
}
