import { createNewsDigest, createNewsMessage } from "../publishing/createNewsMessage.js"
import {
  getSelectionStats,
  parseRss,
  selectNewsForPublication,
} from "../sources/rssSource.js"

const regionalRss = `
<rss>
  <channel>
    <item>
      <title>В Якутске открыли новый общественный проект</title>
      <link>https://example.com/yakutsk-project</link>
      <description><![CDATA[Короткое описание новости про город.]]></description>
      <pubDate>Fri, 14 Aug 2026 08:00:00 GMT</pubDate>
      <guid>yakutsk-project</guid>
      <enclosure url="https://example.com/yakutsk-project.jpg" type="image/jpeg" />
    </item>
    <item>
      <title>Старая новость Якутии</title>
      <link>https://example.com/old-yakutia</link>
      <description>Не должна попасть в подборку за текущий день.</description>
      <pubDate>Thu, 13 Aug 2026 07:00:00 GMT</pubDate>
      <enclosure url="https://example.com/old-yakutia.jpg" type="image/jpeg" />
    </item>
    <item>
      <title>Уже опубликованная новость Якутии</title>
      <link>https://example.com/already-published</link>
      <description>Не должна повториться.</description>
      <pubDate>Fri, 14 Aug 2026 09:00:00 GMT</pubDate>
      <enclosure url="https://example.com/already-published.jpg" type="image/jpeg" />
    </item>
  </channel>
</rss>
`

const federalRss = `
<rss>
  <channel>
    <item>
      <title>Федеральная новость дня</title>
      <link>https://example.com/federal</link>
      <description>Важная новость из страны.</description>
      <pubDate>Fri, 14 Aug 2026 07:00:00 GMT</pubDate>
      <media:content url="https://example.com/federal.jpg" medium="image" />
    </item>
  </channel>
</rss>
`

const items = [
  ...parseRss(regionalRss, {
    name: "Example Yakutia",
    url: "https://example.com/regional.xml",
    enabled: true,
    scope: "regional",
    reliability: "standard",
  }),
  ...parseRss(federalRss, {
    name: "Example Russia",
    url: "https://example.com/federal.xml",
    enabled: true,
    scope: "federal",
    reliability: "standard",
  }),
]
const selectedItems = selectNewsForPublication(items, {
  limit: 2,
  targetDate: "2026-08-14",
  timezone: "UTC",
  requireImage: true,
  excludedLinks: new Set(["https://example.com/already-published"]),
})

if (selectedItems.length !== 2) {
  throw new Error(`Expected two selected items; received ${selectedItems.length}.`)
}

if (selectedItems[0]?.title !== "В Якутске открыли новый общественный проект") {
  throw new Error(`Unexpected first item: ${selectedItems[0]?.title}`)
}

if (selectedItems.some((item) => item.link === "https://example.com/already-published")) {
  throw new Error("Published item should not be selected again.")
}

const selection = {
  items: selectedItems,
  selectedAt: new Date("2026-08-14T08:00:00Z").toISOString(),
  targetDate: "2026-08-14",
  timezone: "UTC",
  reason: "test",
  stats: getSelectionStats(items, selectedItems, {
    targetDate: "2026-08-14",
    timezone: "UTC",
    requireImage: true,
    excludedLinks: new Set(["https://example.com/already-published"]),
  }),
}
const message = createNewsMessage(selection)
const digest = createNewsDigest(selection)

if (!message.includes("<b>В Якутске открыли новый общественный проект</b>")) {
  throw new Error(`Unexpected news message: ${message}`)
}

if (!message.includes("Источник: Example Yakutia")) {
  throw new Error(`Missing source line: ${message}`)
}

if (!digest.includes("Федеральная новость дня")) {
  throw new Error(`Missing federal item in digest: ${digest}`)
}

if (selection.stats.excludedPublished !== 1) {
  throw new Error(`Expected one excluded published item; received ${selection.stats.excludedPublished}.`)
}

console.log(
  `News pipeline check: ${selection.stats.selectedRegional} regional and ${selection.stats.selectedFederal} federal items.`,
)
