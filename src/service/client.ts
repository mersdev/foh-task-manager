import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function testConnection() {
  console.log('Testing Supabase connection...');
  const { error } = await supabase.from('app_settings').select('key', { head: true, count: 'exact' }).limit(1);

  if (error) {
    console.error('Supabase connection test failed:', error);
    return;
  }

  console.log('Supabase connection test completed.');
}

void testConnection();
