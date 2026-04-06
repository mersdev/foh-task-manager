/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
  readonly VITE_SUPABASE_URL_LOCAL?: string;
  readonly VITE_SUPABASE_ANON_KEY_LOCAL?: string;
  readonly VITE_SUPABASE_URL_DEV?: string;
  readonly VITE_SUPABASE_ANON_KEY_DEV?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_TELEGRAM_BOT_TOKEN?: string;
  readonly VITE_TELEGRAM_CHAT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
