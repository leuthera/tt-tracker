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
- [x] Delete player (409 if match history; `?force=true` cascade-deletes matches)
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
- [x] Optional location attachment with GPS auto-detect
- [x] Delete match (with confirmation dialog)
- [x] Swipe-to-delete gesture on match cards (mobile)
- [x] Add/remove set rows dynamically
- [x] Live result preview while entering scores
- [x] Save button disables during submission (prevents double-submit)
- [x] Edit match — the user who created a match can edit it, and admins can edit any match
- [x] Comment section on matches — users can add comments to matches; admins can delete any comment

## Statistics & Analytics

- [x] Per-player: wins, losses, draws count
- [x] Per-player: win rate percentage
- [x] Per-player: total matches played
- [x] Per-player: sets won / sets lost
- [x] Per-player: points won / points lost
- [x] Per-player: recent form (last 5 matches as W/L/D badges)
- [x] Per-player: win/loss streak with emoji indicators
- [x] Head-to-head records against each opponent
- [x] Leaderboard ranked by ELO rating, then win rate, then total wins
- [x] Medal badges for top 3 (gold/silver/bronze colors)
- [x] Leaderboard rows clickable to drill into player stats

## Navigation & Tabs

- [x] Home tab — welcome card, recent matches (5 most recent), top 3 players
- [x] New Match tab — player selection, set scores, result preview, note, save
- [x] Players tab — sortable player list, add player button
- [x] History tab — full match timeline grouped by date, filterable by player
- [x] Stats tab — leaderboard view with drill-down to individual player stats
- [x] Locations tab — venue list with name/coordinates/photo, add/edit/delete modals
- [x] Bottom navigation bar with 6 tabs and active indicator
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
- [x] `DELETE /api/players/:id` — delete player (409 if matches exist; `?force=true` to cascade)
- [x] `GET /api/matches` — list all matches (supports `?player=` filter)
- [x] `POST /api/matches` — create match (with full validation)
- [x] `PUT /api/matches/:id` — edit match (creator or admin)
- [x] `DELETE /api/matches/:id` — delete match
- [x] `GET /api/players/:id/elo-history` — player ELO history
- [x] `GET /api/locations` — list all locations
- [x] `POST /api/locations` — create location (name, optional lat/lng)
- [x] `PUT /api/locations/:id` — update location name/coordinates
- [x] `DELETE /api/locations/:id` — delete location (409 if matches; `?force=true` to nullify)
- [x] `POST /api/locations/:id/image` — upload location photo (base64)
- [x] `GET /api/locations/:id/image` — serve location photo
- [x] `DELETE /api/locations/:id/image` — remove location photo
- [x] `GET /api/matches/:id/comments` — list match comments
- [x] `POST /api/matches/:id/comments` — add comment to match
- [x] `DELETE /api/comments/:id` — delete comment (admin only)
- [x] `GET /api/me` — current user info
- [x] `PUT /api/me/password` — change own password
- [x] `GET /api/users` — list users (admin only)
- [x] `POST /api/users` — create user (admin only)
- [x] `PUT /api/users/:id/password` — reset user password (admin only)
- [x] `DELETE /api/users/:id` — delete user (admin only)
- [x] `GET /healthz` — health check
- [x] `GET /api/version` — build SHA
- [x] `POST /api/client-errors` — log frontend errors
- [x] `GET /login` — login page
- [x] `POST /login` — authenticate
- [x] `POST /logout` — sign out

## Data Persistence

- [x] SQLite database (better-sqlite3)
- [x] Players table with UNIQUE COLLATE NOCASE name
- [x] Matches table with foreign keys to players
- [x] Prepared statements for all queries
- [x] Locations table with name, lat/lng, image flag
- [x] Matches table `location_id` column (optional FK to locations)
- [x] Sets stored as JSON string in matches table
- [x] ELO history table tracking rating changes per match
- [x] Doubles support: `is_doubles`, `player3_id`, `player4_id` columns on matches
- [x] Configurable DB_PATH via environment variable

## Deployment

- [x] Dockerfile (Node 22 Alpine, production deps only)
- [x] Data directory for SQLite volume mount (`/data`)

## Future Enhancements

- [x] Configurable credentials via environment variables (ADMIN_USER, ADMIN_PASS)
- [x] PWA manifest / service worker
- [x] Dark mode
- [x] Docker Compose file
- [x] CI/CD pipeline
- [x] HTTPS / TLS configuration
- [x] HTTP → HTTPS redirect (protocol multiplexing on same port)
- [x] Health check endpoint
- [x] Separate test instance (app-test + db-test on port 8001)
- [x] Admin ability to delete players (even with match history) and matches
- [x] Show build number in header for debugging

## Gameplay

- [x] ELO rating system with progression tracking
- [x] Doubles matches (2v2)
- [ ] Tournament mode (round-robin or bracket)
- [ ] Live scoring — score a match point-by-point in real time

## Stats & Visualization

- [x] Charts — rating/win-rate progression over time per player
- [x] Season filtering — view stats for a specific date range
- [x] Player comparison — side-by-side stat view for two players

## Social & Engagement

- [x] Achievements/badges (first win, 10-game streak, comeback king, etc.)
- [x] Shareable match result cards (generated image)
- [ ] Challenge system — players can challenge each other to a match

## Architecture

- [x] Refactor index.html — extract inline JS into separate ES modules (`js/` directory)

## Observability

- [x] Add JS error logging endpoint to the server to detect frontend errors

## Quality of Life

- [x] Offline support — log matches offline, sync when back online
- [x] Data export (CSV/JSON)
- [x] Multi-language support (German/English)
- [x] Pull-to-refresh — swipe down to refresh the current tab (native PWA feel)

## Locations

- [x] Locations section to collect table tennis venues with name, coordinates, and images
- [x] Image upload for location photos
- [x] Optionally attach a location to a match
- [x] Auto-detect nearest location via GPS

## User Accounts

- [x] Multi-user accounts with admin bootstrap from env vars
- [x] Admin-only user management (create, reset password, delete)
- [x] Role-based permissions (admin/user) — only admins can delete players, matches, and manage users
- [x] Users can change their own password
- [x] Auto-create a player when a new user is created
- [ ] User groups — users can create their own groups with separate player pools. The creator becomes group admin and can invite/manage members. Each group sees only its own players, matches, and stats

## Testing

- [x] Create a test suite for existing features

## Security Hardening

- [x] Add `SameSite: 'Strict'` to session cookie
- [x] Add security headers (X-Frame-Options, X-Content-Type-Options, CSP)
- [x] Add HSTS header when TLS is enabled
- [x] Add rate limiting on login endpoint
- [x] Add CSRF protection on state-changing endpoints
- [x] Add request body size limits to `express.json()` / `express.urlencoded()`
- [x] Add authentication between app and db-service
- [x] Return generic error messages in db-service (don't leak `e.message`)
- [x] Add input length validation on match notes
- [x] Log failed login attempts
- [x] Move hardcoded credentials out of docker-compose.yml into `.env`
