# TT Tracker — Feature Checklist

## Authentication & Security

- [x] Username/password login page
- [x] Session-based authentication (7-day cookie)
- [x] Timing-safe password comparison (crypto.timingSafeEqual)
- [x] Auth middleware protecting all routes and API endpoints
- [x] Logout with session destruction
- [x] Session redirect (401 on API, redirect on pages)
- [x] Environment variable support for SESSION_SECRET and DB_PATH
- [x] Password hashing (scrypt via built-in crypto module)

## Player Management

- [x] Add player with name validation (1–30 chars, unique, case-insensitive)
- [x] Delete player (only if no match history)
- [x] Player list sorted alphabetically
- [x] Player avatars with deterministic color based on name hash
- [x] Player detail modal with full stats
- [x] Player row shows W/L record and total matches

## Match Tracking

- [x] Log match with two player selection
- [x] Multiple sets per match (1–9 sets)
- [x] Per-set score input (0–99)
- [x] Validation: scores must differ (no draws per set)
- [x] Validation: players must be different
- [x] Automatic winner determination (most sets won)
- [x] Optional match note field
- [x] Delete match (with confirmation dialog)
- [x] Swipe-to-delete gesture on match cards (mobile)
- [x] Add/remove set rows dynamically
- [x] Live result preview while entering scores
- [x] Save button disables during submission (prevents double-submit)

## Statistics & Analytics

- [x] Per-player: wins, losses, draws count
- [x] Per-player: win rate percentage
- [x] Per-player: total matches played
- [x] Per-player: sets won / sets lost
- [x] Per-player: points won / points lost
- [x] Per-player: recent form (last 5 matches as W/L/D badges)
- [x] Per-player: win/loss streak with emoji indicators
- [x] Head-to-head records against each opponent
- [x] Leaderboard ranked by win rate, then total wins
- [x] Medal badges for top 3 (gold/silver/bronze colors)
- [x] Leaderboard rows clickable to drill into player stats

## Navigation & Tabs

- [x] Home tab — welcome card, recent matches (5 most recent), top 3 players
- [x] New Match tab — player selection, set scores, result preview, note, save
- [x] Players tab — sortable player list, add player button
- [x] History tab — full match timeline grouped by date, filterable by player
- [x] Stats tab — leaderboard view with drill-down to individual player stats
- [x] Bottom navigation bar with 5 tabs and active indicator
- [x] Tab content re-fetches fresh data on each navigation

## UI Components

- [x] Mobile-first design (max-width 480px)
- [x] Toast notifications (success, error, info)
- [x] Modal system (add player, player detail, confirmations)
- [x] Loading overlay with spinner
- [x] Empty states with icons and helpful messages
- [x] Relative time display (just now, 5m ago, 2h ago, Yesterday, etc.)
- [x] Date grouping in history (Today, Yesterday, weekday + date)
- [x] XSS protection via HTML escaping helper (esc function)
- [x] Fade-in animation on tab switch
- [x] Touch-friendly tap targets
- [x] Safe area inset support (notched devices)
- [x] Apple mobile web app meta tags

## API Endpoints

- [x] `GET /api/players` — list all players
- [x] `POST /api/players` — create player
- [x] `DELETE /api/players/:id` — delete player (with match history check)
- [x] `GET /api/matches` — list all matches (supports `?player=` filter)
- [x] `POST /api/matches` — create match (with full validation)
- [x] `DELETE /api/matches/:id` — delete match
- [x] `GET /login` — login page
- [x] `POST /login` — authenticate
- [x] `POST /logout` — sign out

## Data Persistence

- [x] SQLite database (better-sqlite3)
- [x] Players table with UNIQUE COLLATE NOCASE name
- [x] Matches table with foreign keys to players
- [x] Prepared statements for all queries
- [x] Sets stored as JSON string in matches table
- [x] Configurable DB_PATH via environment variable

## Deployment

- [x] Dockerfile (Node 20 Alpine, production deps only)
- [x] Data directory for SQLite volume mount (`/data`)

## Future Enhancements

- [x] Configurable credentials via environment variables (ADMIN_USER, ADMIN_PASS)
- [x] PWA manifest / service worker
- [x] Dark mode
- [x] Docker Compose file
- [ ] CI/CD pipeline
- [x] HTTPS / TLS configuration
- [x] Health check endpoint
- [ ] Separate test database for testing purposes
- [ ] Admin ability to delete players (even with match history) and matches
