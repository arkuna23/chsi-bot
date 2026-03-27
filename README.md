# chsi-bot

`chsi-bot` is a TypeScript bot that monitors the CHSI postgraduate adjustment intention system and sends updates to OneBot11 group chats.

It uses the live CHSI HTTP interface instead of browser-driven scraping for scheduled polling. Playwright is kept only as an optional helper for manual login and session bootstrap.

## Features

- Poll CHSI adjustment intention listings by major prefix such as `08`, `0812`, or `0854`
- Use the live CHSI interface `POST /sytj/stu/tjyxqexxcx.action`
- Reuse CHSI authentication from a cookie header, a cookie file, or Playwright `storageState`
- Optionally auto re-login with CHSI username/password when the session expires
- Persist subscriptions, seen listings, checkpoints, and notification logs in SQLite via Node built-in `node:sqlite`
- Connect to OneBot11 through forward WebSocket
- Send only new listing notifications
- Support optional region filters for school-level detail messages
- Throttle crawler requests with a configurable interval to reduce account risk

## Requirements

- Node.js with built-in `node:sqlite` support
- `pnpm`
- A running OneBot11 implementation, for example NapCat or LLOneBot, exposing a forward WebSocket endpoint
- A valid CHSI session

## Quick Start

1. Copy `.env.example` to `.env`
2. Install dependencies:

```bash
pnpm install
```

3. Provide CHSI authentication using one of the following methods:
   - Set `CHSI_COOKIE_HEADER`
   - Set `CHSI_COOKIE_FILE`
   - Run `pnpm login:chsi` and save Playwright `storageState`
   - Optionally set `CHSI_LOGIN_USERNAME` and `CHSI_LOGIN_PASSWORD` for automatic re-login
4. Optionally verify the interface:

```bash
pnpm discover:api
```

5. Start the bot in development mode:

```bash
pnpm dev
```

For production:

```bash
pnpm build
node dist/src/app/main.js
```

## CHSI Authentication

The crawler does not require `cookies.txt` specifically.

Authentication is resolved in this order:

1. `CHSI_COOKIE_HEADER`
2. `CHSI_COOKIE_FILE`
3. `CHSI_STORAGE_STATE_PATH`

This means the project is not coupled to a repository-local cookie file. `cookies.txt` is ignored by Git.

If the CHSI session expires and both `CHSI_LOGIN_USERNAME` and `CHSI_LOGIN_PASSWORD` are configured, the bot will launch a headful Chrome window, attempt automatic re-login once, persist the refreshed `storageState`, and retry the interrupted polling run once.

## How Crawling Works

The crawler is interface-based and paginated.

- Endpoint: `https://yz.chsi.com.cn/sytj/stu/tjyxqexxcx.action`
- Method: `POST`
- Content type: `application/x-www-form-urlencoded`
- Major filter field: `mldm2`
- Pagination field: `start`
- Page size field: `pageSize`

Default request settings:

- `pageSize=100`
- `CHSI_REQUEST_INTERVAL_MS=1500`

For a prefix such as `08`, the crawler:

1. Sends the first request with `start=0`
2. Reads `pagenation.startOfNextPage`
3. Continues until `nextPageAvailable=false`

If multiple prefixes are subscribed, each prefix is crawled separately, and every page request is rate-limited.

## Group Commands

All commands are short English commands designed for group chats:

- `/on`
  Enable monitoring for the current group
- `/off`
  Disable monitoring for the current group
- `/sub <prefix>`
  Subscribe a major prefix, for example `/sub 08`
- `/unsub <prefix>`
  Remove a prefix subscription
- `/ls`
  Show the current group status and subscriptions
- `/region <prefix> <province...>`
  Restrict detail notifications for a prefix to specific provinces
- `/unregion <prefix>`
  Remove region filtering for a prefix
- `/check`
  Trigger an immediate check for the current group
- `/help`
  Show command help

## Notification Behavior

The bot only notifies on newly discovered listings.

Summary messages are grouped by subscribed prefix and list the affected provinces.

If a region filter is enabled for a prefix, the bot also sends school-level details for matching provinces, including which majors were added.

The matching rule prefers the longest subscribed prefix. For example, if a group subscribes both `08` and `0854`, a listing with major code `085400` is treated as part of `0854`.

## Environment Variables

See [.env.example](/home/naraku/Repo/chsi-bot/.env.example).

Main variables:

- `ONEBOT_WS_URL`
  Forward WebSocket endpoint of the OneBot11 implementation
- `ONEBOT_ACCESS_TOKEN`
  Optional access token for OneBot11
- `SQLITE_PATH`
  SQLite database file path
- `CHSI_STORAGE_STATE_PATH`
  Playwright storage state path
- `CHSI_COOKIE_FILE`
  Optional cookie file path
- `CHSI_COOKIE_HEADER`
  Optional raw `Cookie:` header value
- `CHSI_LOGIN_USERNAME`
  Optional CHSI account username for automatic re-login
- `CHSI_LOGIN_PASSWORD`
  Optional CHSI account password for automatic re-login
- `CHSI_API_CONFIG_PATH`
  Optional API configuration file path
- `CHSI_PAGE_SIZE`
  Default `100`
- `CHSI_REQUEST_INTERVAL_MS`
  Default `1500`
- `POLL_INTERVAL_MINUTES`
  Default `60`
- `ADMIN_GROUP_IDS`
  Comma-separated admin group IDs for alerts

## Useful Scripts

- `pnpm dev`
  Start the bot with `tsx`
- `pnpm build`
  Compile TypeScript
- `pnpm test`
  Run unit tests
- `pnpm login:chsi`
  Open a browser and save Playwright `storageState`
- `pnpm discover:api`
  Validate the live CHSI interface and write API metadata
- `pnpm run:once -- <prefix...>`
  Run a single crawler pass without starting the bot

## Project Structure

```text
src/
  app/            app config and entrypoint
  bot/            OneBot11 client and command handling
  crawler/        CHSI cookie loading, API client, crawler service
  scheduler/      polling coordinator
  shared/         helpers
  storage/        SQLite persistence
  subscription/   subscriptions, diffs, notifications
  types/          shared domain types
scripts/          helper entrypoints
tests/            unit tests
data/             runtime files
```

## Notes

- This project currently targets the CHSI adjustment intention system, not the later adjustment service system.
- Scheduled crawling uses HTTP requests, not Playwright page automation.
- If CHSI changes request parameters or response shapes, update the crawler configuration or mapping logic in [chsi-api-client.ts](/home/naraku/Repo/chsi-bot/src/crawler/chsi-api-client.ts).
