# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Vite React + TypeScript app.
- `src/service/` holds Supabase/Telegram data logic (`client.ts`, `apiClient.ts`).
- `src/types.ts` defines core domain types.
- `cypress/e2e/` contains end-to-end specs (`*.cy.ts`).
- `scripts/` contains Node scripts for Supabase maintenance.
- `supabase/` stores schema and migrations.
- `dist/` is build output and should not be edited manually.

## Build, Test, and Development Commands
- `npm run dev` starts the app locally with Vite.
- `npm run build` creates a production bundle in `dist/`.
- `npm run preview` serves the built bundle locally.
- `npm run lint` runs TypeScript type-checking (`tsc --noEmit`).
- `npm run db:sync-dev-migrations` links to dev and syncs latest DB schema into `supabase/migrations/` (must run before push).
- `npm run db:align-local` applies migrations to `foh-task-manager-local` and resets seed data.
- `npm run cypress:open` opens Cypress UI for interactive debugging.
- `npm run cypress:run` runs headless E2E tests.
- `npm run test:e2e` resets DB, starts app on `127.0.0.1:4173`, then runs Cypress.
- `npm run db:reset` reseeds Supabase data; `npm run db:backfill-log-names` repairs legacy log names.

## Coding Style & Naming Conventions
- Use TypeScript with React function components and hooks.
- Follow existing style: 2-space indentation, single quotes, trailing commas where present.
- Use `PascalCase` for components/types and `camelCase` for variables/functions.
- Keep shared types in `src/types.ts` and Supabase interaction in `src/service/`.

## Testing Guidelines
- Primary coverage is Cypress E2E in `cypress/e2e/*.cy.ts`.
- Add/update tests when changing checklist, logs, temperatures, staff/tasks/settings, or Telegram behavior.
- Prefer scenario-focused names, e.g. `logs.cy.ts` for history/export behavior.
- Run `npm run test:e2e` before opening a PR.
- After Cypress test, always run `node scripts/sync-dev-to-local-data.mjs` to re-align local data with dev.

## Commit & Pull Request Guidelines
- Prefer Conventional Commit prefixes (`fix:`, `chore:`, `feat:`); avoid `#NA` commits.
- Keep commits focused and explain user-visible impact.
- Before pushing to GitHub: run `npm run db:sync-dev-migrations`, commit any new SQL under `supabase/migrations/`, then run `npm run db:align-local`.
- PRs should include: summary, affected areas, test evidence (`npm run lint`, `npm run test:e2e`), and screenshots/GIFs for UI changes.

## Security & Configuration Tips
- Never commit real secrets. Use `.env.example` as the template.
- Required frontend envs include `VITE_SUPABASE_ANON_KEY`, `VITE_TELEGRAM_BOT_TOKEN`, and `VITE_TELEGRAM_CHAT_ID`.
- For scripts, verify `SUPABASE_TARGET` (`local` or `dev`) before running reset/backfill commands.

## Database Versioning & Data Safety (Required)
- Always pull the latest Supabase state before DB changes to avoid data loss and migration drift.
- Required pre-change sequence: `supabase link --project-ref <project_ref>`, `supabase db dump --data-only -f supabase/backup/<timestamp>_data.sql`, then `supabase db pull`.
- Create intentional schema changes with `supabase migration new <name>` (or `supabase db diff`) and commit migration SQL.
- If local/remote migration history diverges, use `supabase migration repair --status applied|reverted <version>` and then re-run `supabase db pull`.
- Before resetting either `local` or `dev`, first confirm the other environment has the latest data snapshot.
- If the other environment is not up to date, sync first:
  - `node scripts/sync-dev-to-local-data.mjs` (dev -> local)
  - `node scripts/sync-local-to-dev-data.mjs` (local -> dev)
- Only run reset (`npm run db:reset` with the right `SUPABASE_TARGET`) after the latest-data check passes or sync is completed.
