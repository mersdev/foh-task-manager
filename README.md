<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# FOH Task Manager

This app is a React + TypeScript frontend served by Vite.
- Local mode uses Supabase project `foh-task-manager-local`.
- Dev mode uses Supabase project `foh-task-manager-dev`.

## Functions In The App

### Core Operations
- Daily FOH checklist by time slot (`Checklist` tab)
- Tick task completion with staff attribution
- Untick completed task
- Temperature logging (`Temps` tab) for Chiller/Freezer with:
  - location
  - temperature value
  - staff attribution
- View today’s temperature readings

### Logs & History
- `Logs` tab with date filter
- Toggle between:
  - Completed task logs
  - Temperature records
- Admin can delete checklist log records
- Admin can delete temperature log records
- Export logs to Excel (`.xlsx`) for selected date range

### Admin & Settings
- PIN-protected admin mode
- Change admin PIN
- End Shift / Reopen Shift
- Shift lock behavior:
  - Non-admin cannot modify checklist/temperature after shift ended
  - Admin can still manage records
- Manage Categories:
  - add
  - rename
  - delete
  - drag-and-drop reorder
- Manage Time Slots:
  - add
  - rename
  - delete
  - drag-and-drop reorder
- Manage Tasks:
  - add
  - edit
  - soft delete (inactive)
  - drag-and-drop reorder
- Manage Staff:
  - add
  - edit
  - soft delete (inactive)
  - drag-and-drop reorder
- Regional timezone setting

### Telegram Communication
- Telegram-only notification channel (no email notifications)
- On `End Shift`, sends Telegram message with:
  - shift ended date/time
  - closed by user
  - checklist lock status
- Sends checklist completion summary to Telegram:
  - completed task name
  - completed by staff name

### Data Integrity & Time Rules
- Checklist/task/temperature operations use timezone-aware local time
- Business-day boundary at `07:30` for checklist/log date handling
- Auto-refresh is scheduled daily at `07:30` in app runtime
- Missing `taskName` / `staffName` are resolved from DB on new log writes
- UI has fallback display for legacy rows with missing names (`Task #id`, `Staff #id`)

### API Routes Implemented (via `apiClient.ts`)
- `/api/admin-pin`
- `/api/settings`
- `/api/shift-status`
- `/api/end-shift`
- `/api/categories` + reorder + update + delete
- `/api/time-slots` + reorder + update + delete
- `/api/staff` + reorder + update + deactivate
- `/api/tasks` + reorder + update + deactivate
- `/api/logs` + date/range query + create + delete
- `/api/logs/task/:id` (untick by task for current business date)
- `/api/temperature-logs` + date/range query + create + delete
- `/api/checklist`
- `/api/bootstrap`

### Test Coverage (Cypress, Individual Files)
- `cypress/e2e/checklist.cy.ts`
- `cypress/e2e/logs.cy.ts`
- `cypress/e2e/settings.telegram.cy.ts`
- `cypress/e2e/staff.cy.ts`
- `cypress/e2e/tasks.cy.ts`
- `cypress/e2e/temperatures.cy.ts`

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set these in `.env` (or `.env.local`):
   - `VITE_APP_ENV=local`
   - `VITE_SUPABASE_URL_LOCAL`
   - `VITE_SUPABASE_ANON_KEY_LOCAL`
   - `VITE_TELEGRAM_BOT_TOKEN`
   - `VITE_TELEGRAM_CHAT_ID`
3. Run:
   `npm run dev`

## Dev Environment (Supabase)

Set `VITE_APP_ENV=dev` and configure:
- `VITE_SUPABASE_URL_DEV`
- `VITE_SUPABASE_ANON_KEY_DEV`

## Utility Scripts

- Sync latest schema from `foh-task-manager-dev` into migrations:
  `npm run db:sync-dev-migrations`
  - If DNS to `db.<project-ref>.supabase.co` fails in containerized tooling, set either:
    - `SUPABASE_DB_URL_DEV` (percent-encoded Postgres URL), or
    - `SUPABASE_DB_PASSWORD` (script builds URL from `supabase/.temp/pooler-url`).
- Align `foh-task-manager-local` with migrations and reseed:
  `npm run db:align-local`
- Reset DB to fresh seed (`SUPABASE_TARGET=local` by default):
  `npm run db:reset`
- One-time backfill for old blank log names:
  `npm run db:backfill-log-names`
- For dev Supabase scripts, set:
  `SUPABASE_TARGET=dev`
- Run end-to-end tests:
  `npm run test:e2e`
