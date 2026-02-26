# CLAUDE.md — TT Tracker

## Workflow Rules

1. **Read before editing.** Always read a file before modifying it. Understand the surrounding code.
2. **Test after every change.** Run `npm test` after each logical step — not just at the end. Fix failures before moving on.
3. **Run the right Node version.** Use `nvm use 22` before running tests — better-sqlite3 native bindings require Node 22.
4. **Verify, don't assume.** After implementing something, confirm it works. Don't mark a task done until tests pass.
5. **Keep changes minimal.** Only change what's needed. Don't refactor adjacent code, add comments to untouched code, or "improve" things that weren't asked for.
6. **Don't commit unless asked.** Never auto-commit. Wait for explicit instructions.
7. **Update tests for new features.** Every new endpoint, helper, or behavior change needs corresponding tests. Check existing test files for patterns.
8. **Update docs when relevant.** If a feature changes user-facing behavior, update README.md. If a new env var is added, update .env.example. Keep TODO.md in sync.

## Commands

```bash
nvm use 22                   # MUST run before tests
npm test                     # All tests (~91 tests, node:test)
npm run test:unit            # Unit tests only (fast)
npm run test:integration     # Integration tests only (spawns real processes)
```

## Architecture

- **server.js** — Express app (port 8000): auth, sessions, API proxy to db-service, serves static files
- **db-service.js** — SQLite REST microservice (port 3000, internal only): CRUD via better-sqlite3
- **index.html** — Entire frontend in one file (~2500 lines, vanilla JS + CSS, no build step)
- **lib/helpers.js** — Shared utilities (password hashing, DB row transformers, match logic)
- **test/helpers/setup.js** — Test utilities (spawn servers, login, create users)

server.js never touches SQLite directly — it calls db-service.js over HTTP with Bearer token auth.

## Code Style

- `'use strict';` at top of every JS file
- CommonJS (`require` / `module.exports`), no ESM
- Semicolons required
- camelCase for JS, snake_case for DB columns, UPPER_CASE for env constants
- Section dividers: `// ─── SECTION NAME ──────`
- No linter — match existing style exactly
- Frontend is vanilla JS — no frameworks, no build tools, no npm packages

## Patterns to Follow

- **New DB table/column**: add schema + prepared statements + routes in `db-service.js`, add transformer in `lib/helpers.js`, add proxy routes in `server.js`
- **New API endpoint**: add route in `server.js`, use `requireAuth` (or `requireAdmin` for admin-only), proxy to db-service via `dbFetch()`
- **New test**: use `node:test` (`describe`/`it`) + `node:assert/strict`. Integration tests use helpers from `test/helpers/setup.js`
- **ID generation**: `prefix_timestamp_random` (e.g., `p_1700000000_abc123`)
- **Auth roles**: `admin` = full access, `user` = no delete, no user management

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `ADMIN_PASS` | — | Required on first run only (seeds admin user) |
| `ADMIN_USER` | `admin` | Bootstrap username |
| `SESSION_SECRET` | random | Set in prod |
| `DB_TOKEN` | — | Shared secret for app↔db-service |
| `DB_URL` | `http://db:3000` | db-service endpoint |
| `PORT` | `8000` | App port |
| `BUILD_SHA` | `dev` | Injected via Docker build arg |
| `TLS_CERT` / `TLS_KEY` | — | Enables HTTPS |
| `DB_PATH` | `./data.db` | db-service only |
