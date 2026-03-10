<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# FOH Task Manager (Frontend Only)

This app is a React + TypeScript frontend served by Vite. It talks directly to Supabase from the browser.

Supabase runtime code is organized under `src/service/`:
- `client.ts`: Browser Supabase client
- `apiClient.ts`: Frontend API shim used by `App.tsx`

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set these in `.env` (or `.env.local`):
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TELEGRAM_BOT_TOKEN`
   - `VITE_TELEGRAM_CHAT_ID`
3. Run the app:
   `npm run dev`

## Reset DB To Fresh State

Use this when you want to clear dirty data and reseed defaults.

1. Set `SUPABASE_SERVICE_ROLE_KEY` in your shell or `.env`
2. Run:
   `npm run db:reset`
