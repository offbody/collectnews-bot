import { createNewsMessage } from "../publishing/createNewsMessage.js"
import { parseRss, selectRegionalNews } from "../sources/rssSource.js"

const rss = `
<rss>
  <channel>
    <item>
      <title>В Якутске открыли новый общественный проект</title>
      <link>https://example.com/yakutsk-project</link>
      <description><![CDATA[Короткое описание новости про город.]]></description>
      <pubDate>Fri, 14 Aug 2026 08:00:00 GMT</pubDate>
      <guid>yakutsk-project</guid>
    </item>
    <item>
      <title>Федеральная новость без регионального контекста</title>
      <link>https://example.com/federal</link>
      <description>Описание без нужных ключевых слов.</description>
      <pubDate>Fri, 14 Aug 2026 07:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`

const items = parseRss(rss, "Example")
const regionalItems = selectRegionalNews(items)

if (regionalItems.length !== 1) {
  throw new Error(`Expected one regional item; received ${regionalItems.length}.`)
}

const message = createNewsMessage({
  item: regionalItems[0]!,
  selectedAt: new Date("2026-08-14T08:00:00Z").toISOString(),
  reason: "test",
})

if (!message.includes("<b>В Якутске открыли новый общественный проект</b>")) {
  throw new Error(`Unexpected news message: ${message}`)
}

if (!message.includes("Источник: Example")) {
  throw new Error(`Missing source line: ${message}`)
}

console.log(`News pipeline check: ${regionalItems.length} regional item.`)
