/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO GET YOUR ANON KEY:
//   1. Open https://supabase.com/dashboard
//   2. Select project "kcuogauybsimiebsdpdh"
//   3. Settings → API → Project API Keys
//   4. Copy the "anon / public" key  (NOT the service_role key)
//   5. Paste it below as VITE_SUPABASE_ANON_KEY in frontend/.env
//      or replace the empty string directly here for local development.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://kcuogauybsimiebsdpdh.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_ANON_KEY) {
  console.warn(
    "[Insight] VITE_SUPABASE_ANON_KEY is not set.\n" +
    "  Go to: Supabase Dashboard → Settings → API → anon / public key\n" +
    "  Add it to frontend/.env as VITE_SUPABASE_ANON_KEY=<your-anon-key>"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,           // session survives page refresh
    autoRefreshToken: true,         // keep session alive automatically
    detectSessionInUrl: false,      // no magic-link / OAuth redirect needed
  },
});
