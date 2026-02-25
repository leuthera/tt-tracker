# TT Tracker

Table tennis match tracker with player stats, head-to-head records, and leaderboards.

## Architecture

```mermaid
flowchart LR
    subgraph Internet
        B["Browser"]
    end

    subgraph Production["Production (:8000)"]
        APP["app<br/>Express + Auth"]
        DB["db<br/>SQLite Service"]
        VOL[("tt-data")]
    end

    subgraph Test["Test (:8001)"]
        APPT["app-test<br/>Express + Auth"]
        DBT["db-test<br/>SQLite Service"]
        VOLT[("tt-data-test")]
    end

    B -- "HTTP :8000" --> APP
    APP -. "301 redirect" .-> B
    B -- "HTTPS :8000" --> APP
    B -- "HTTP :8001" --> APPT

    APP -- "REST :3000" --> DB
    DB --- VOL

    APPT -- "REST :3000" --> DBT
    DBT --- VOLT
```

### Request Flow

```mermaid
flowchart TD
    REQ["Incoming Connection<br/>:8000"] --> PEEK{"First byte<br/>0x16?"}
    PEEK -- "Yes (TLS)" --> HTTPS["HTTPS Server"]
    PEEK -- "No (plain)" --> REDIR["301 → HTTPS"]

    HTTPS --> AUTH{"Session<br/>valid?"}
    AUTH -- "No" --> LOGIN["Login Page"]
    AUTH -- "Yes" --> ROUTE{"Route"}

    ROUTE --> STATIC["/ → index.html<br/>(SPA frontend)"]
    ROUTE --> API["/api/*"]

    API --> PROXY["Proxy to db-service<br/>:3000"]
    PROXY --> SQLITE[("SQLite")]
```

## Stack

- Node.js + Express + SQLite (better-sqlite3)
- Vanilla JS single-page frontend
- Docker Compose (prod + test instances)

## Run

```bash
npm install
ADMIN_PASS=yourpassword node server.js
```

Runs on `http://localhost:8000`.

Env vars: `ADMIN_USER` (default: admin), `ADMIN_PASS` (required), `PORT`, `DB_PATH`, `SESSION_SECRET`, `TLS_CERT`, `TLS_KEY`.

## Docker Compose

```bash
docker compose up --build -d
```

| Service | Port | Description |
|---------|------|-------------|
| app | 8000 | Production (HTTPS + HTTP redirect) |
| db | 3000 (internal) | Production SQLite service |
| app-test | 8001 | Test instance |
| db-test | 3000 (internal) | Test SQLite service |
