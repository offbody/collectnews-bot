# news-bot

Local draft project for automated regional news publishing.

The shape intentionally mirrors the existing publication pipeline:

```text
RSS source layer -> day filter -> image filter -> dedupe -> 70/30 scoring -> message formatter -> Telegram publish -> scheduled + jitter
```

## Current Scope

- Fetch enabled regional and federal RSS feeds from `data/feeds.json`.
- Keep only items published on the target day.
- Keep only items that include an image in `enclosure`, `media:content`,
  `media:thumbnail`, or the item HTML.
- Deduplicate by link/title.
- Score deterministically by publication timestamp, newest first.
- Select a daily batch with a target 70% regional / 30% federal ratio.
- Generate a Telegram HTML message for the next item and a digest preview.
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

Validate configured RSS feeds:

```bash
pnpm run feeds:validate
```

Create a local preview:

```bash
pnpm run news:preview
```

Create a preview for a concrete date and slot count:

```bash
pnpm run news:preview -- --date 2026-08-14 --limit 10
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
    "enabled": true,
    "scope": "regional",
    "reliability": "primary"
  }
]
```

`scope` controls the 70/30 regional/federal selection. `reliability` is a manual
marker for source quality and operational confidence; it does not currently
change scoring.

## Secrets

Use a local `.secrets/news.env` file:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

`.secrets/` is ignored by git.

## Next Decisions

- Posting frequency and daily slots.
- Whether to publish source image as Telegram photo or use a custom rendered card.
- Deduplication storage: JSON file, GitHub artifact/cache, gist, or database.
- Editorial rules: official sources only, media sources, categories, blocked topics.
