# news-bot

Local draft project for automated regional news publishing.

The shape intentionally mirrors the existing publication pipeline:

```text
RSS source layer -> regional filter -> dedupe -> message formatter -> Telegram publish -> scheduled + jitter
```

## Current Scope

- Fetch enabled RSS feeds from `data/feeds.json`.
- Filter items by Yakutsk/Yakutia/Sakha keywords.
- Deduplicate by link/title.
- Select the latest matching item.
- Generate a Telegram HTML message.
- Publish as text-only Telegram post.
- Keep scheduled dry-run disabled and manual dry-run enabled.
- Apply deterministic scheduled jitter in the workflow draft.

This is not a finished editorial system yet. It is a structural duplicate of the palette/Awwwards pipeline, adapted for news sources.

## Local Usage

Install dependencies:

```bash
pnpm install
```

Run the pipeline check:

```bash
pnpm run test:news
```

Create a local preview:

```bash
pnpm run news:preview
```

Publish dry-run:

```bash
pnpm run news:publish:dry-run -- --env .secrets/news.env
```

Publish for real:

```bash
pnpm run news:publish -- --env .secrets/news.env
```

## Feed Config

Edit `data/feeds.json`:

```json
[
  {
    "name": "Source Name",
    "url": "https://example.com/rss.xml",
    "enabled": true
  }
]
```

## Secrets

Use a local `.secrets/news.env` file:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

`.secrets/` is ignored by git.

## Next Decisions

- Real RSS source list for Yakutsk and Yakutia.
- Posting frequency and daily slots.
- Whether to publish text-only, source image, or a custom rendered card.
- Deduplication storage: JSON file, GitHub artifact/cache, gist, or database.
- Editorial rules: official sources only, media sources, categories, blocked topics.
