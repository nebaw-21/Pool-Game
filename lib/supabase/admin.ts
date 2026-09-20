import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client: bypasses Row Level Security entirely. Import this ONLY
// from files under app/api/**/route.ts. Never import it from a "use client"
// file or any module that ends up in the browser bundle.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
