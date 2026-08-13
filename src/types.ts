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
    selectedRegional: number
    selectedFederal: number
  }
}
