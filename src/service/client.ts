import { createClient } from '@supabase/supabase-js';

const APP_ENV = (import.meta.env.VITE_APP_ENV ?? 'local').toLowerCase();
const isDev = APP_ENV === 'dev';

const DEV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL_DEV ?? '';
const DEV_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY_DEV ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const LOCAL_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL_LOCAL ?? '';
const LOCAL_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY_LOCAL ?? '';

const SUPABASE_URL = isDev ? DEV_SUPABASE_URL : LOCAL_SUPABASE_URL;
const SUPABASE_KEY = isDev ? DEV_SUPABASE_KEY : LOCAL_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn(
    isDev
      ? 'Missing VITE_SUPABASE_URL_DEV or VITE_SUPABASE_ANON_KEY_DEV for dev mode.'
      : 'Missing VITE_SUPABASE_URL_LOCAL or VITE_SUPABASE_ANON_KEY_LOCAL for local mode.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function testConnection() {
  const targetLabel = isDev ? 'Supabase (dev)' : 'Supabase (local)';
  console.log(`Testing ${targetLabel} connection...`);
  const { error } = await supabase.from('app_settings').select('key', { head: true, count: 'exact' }).limit(1);

  if (error) {
    console.error(`${targetLabel} connection test failed:`, error);
    return;
  }

  console.log(`${targetLabel} connection test completed.`);
}

void testConnection();
