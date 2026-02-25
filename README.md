# TT Tracker

Table tennis match tracker with player stats, head-to-head records, and leaderboards.

## Stack

- Node.js + Express + SQLite (better-sqlite3)
- Vanilla JS single-page frontend

## Run

```bash
npm install
ADMIN_PASS=yourpassword node server.js
```

Runs on `http://localhost:8000`.

Env vars: `ADMIN_USER` (default: admin), `ADMIN_PASS` (required), `PORT`, `DB_PATH`, `SESSION_SECRET`.

## Docker

```bash
docker build -t tt-tracker .
docker run -p 8000:8000 -e ADMIN_PASS=yourpassword tt-tracker
```
