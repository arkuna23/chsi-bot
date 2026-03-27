# chsi-bot

TypeScript bot for CHSI adjustment monitoring with:

- CHSI login bootstrap via Playwright
- HTTP interface crawling with saved cookies
- OneBot11 group subscriptions
- SQLite persistence

## Commands

- `/on`
- `/off`
- `/sub 08`
- `/unsub 08`
- `/ls`
- `/region 08 Jiangsu Beijing`
- `/unregion 08`
- `/check`
- `/help`

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies with `pnpm install`
3. Provide auth by either setting `CHSI_COOKIE_HEADER`, setting `CHSI_COOKIE_FILE`, or running `pnpm login:chsi` to save `storageState`
4. Run `pnpm discover:api` once to verify the listing interface
5. Start the bot with `pnpm dev`

Defaults:

- `CHSI_PAGE_SIZE=100`
- `CHSI_REQUEST_INTERVAL_MS=1500`
