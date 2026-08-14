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
- Exclude links already recorded in `data/published-news.json`.
- Deduplicate by link/title.
- Score deterministically by publication timestamp, newest first.
- Select a daily batch with a target 70% regional / 30% federal ratio.
- Generate a Telegram HTML message for the next item and a digest preview.
- Publish as a Telegram photo with HTML caption when an image URL is available.
- Record successfully published links back to `data/published-news.json`.
- Support manual dry-run/real publish and scheduled real publish through GitHub Actions.
- Apply deterministic scheduled jitter in the workflow.

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

## Published State

Published links are stored in `data/published-news.json`. The file contains only
public metadata: source, title, link, image URL, source publication date, local
posted date, and Telegram message id. Scheduled GitHub Actions runs commit this
file back to the repository after successful publication so later slots do not
repeat the same link.

## GitHub Actions

The `Publish News` workflow runs every 30 minutes from 07:00 to 21:30 Yakutsk
time, targeting about 30 automated posts per day.

The schedule intentionally keeps the night quiet while making the daytime feed
feel active for new readers. Scheduled runs use a small deterministic jitter of
up to 5 minutes so GitHub Actions load does not cluster exactly on the half-hour
mark.

Manual workflow dispatch supports:

- `dry_run=true` to validate RSS, create preview, and check Telegram chat access.
- `dry_run=false` to publish one selected item and update `data/published-news.json`.
- `limit` to control the candidate batch size before picking the first item.

Required repository secrets:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
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

- Whether to publish source image as Telegram photo or use a custom rendered card.
- Editorial rules: official sources only, media sources, categories, blocked topics.
