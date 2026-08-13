export type NewsFeed = {
  name: string
  url: string
  enabled: boolean
}

export type NewsItem = {
  id: string
  sourceName: string
  title: string
  link: string
  summary?: string
  publishedAt?: string
}

export type NewsSelection = {
  item: NewsItem
  selectedAt: string
  reason: string
}
