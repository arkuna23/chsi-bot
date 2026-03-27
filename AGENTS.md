# Repository Guidelines

## Project Structure & Module Organization

Core code lives in `src/`:
- `src/app`: config and process entrypoint
- `src/bot`: OneBot11 client, command parsing, reply formatting
- `src/crawler`: CHSI auth loading and HTTP crawler
- `src/scheduler`: polling coordination
- `src/storage`: SQLite persistence
- `src/subscription`: subscription, diff, and notification logic
- `src/shared` and `src/types`: shared helpers and interfaces

Helper scripts are in `scripts/`. Unit tests live in `tests/`. Runtime files such as SQLite DBs and Playwright storage state are written under `data/`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies
- `pnpm dev`: run the bot with `tsx` in development
- `pnpm build`: compile TypeScript to `dist/`
- `pnpm start`: run the compiled app
- `pnpm test`: run Vitest unit tests
- `pnpm login:chsi`: open Chrome for CHSI login and save `storageState`
- `pnpm discover:api`: verify CHSI API parameters
- `pnpm run:once -- 08 0854`: run one crawler pass for specific prefixes

Run `pnpm build` and `pnpm test` before opening a PR.

## Coding Style & Naming Conventions

Use TypeScript only. Prefer interfaces and explicit types over `any`. Follow the existing style: 2-space indentation, semicolons, single quotes, and small focused modules. Use:
- `camelCase` for functions and variables
- `PascalCase` for classes and types
- `kebab-case` for filenames such as `chsi-api-client.ts`

Keep logic simple, avoid mutation when a copied object or array is clearer, and preserve the repository’s concise logging style.

## Testing Guidelines

Tests use `vitest` and live in `tests/*.test.ts`. Match the source area in the filename, for example `notification-service.test.ts`. Add or update tests whenever changing crawler filtering, command parsing, notification formatting, or scheduling behavior.

## Commit & Pull Request Guidelines

Commit messages in this repo are short, imperative, and sentence-style, for example `Set default polling interval to 1 hour`. Keep each commit scoped to one logical change.

PRs should include:
- a short summary of behavior changes
- any env/config updates
- test evidence such as `pnpm test`
- sample command or notification output for user-facing changes

## Security & Configuration Tips

Do not commit `.env`, `cookies.txt`, CHSI cookie headers, Playwright storage state, or runtime DB files. Use `.env.example` as the source of default config values.
