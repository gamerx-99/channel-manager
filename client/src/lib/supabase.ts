import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://roznxbvhflwrfvybmhtm.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvem54YnZoZmx3cmZ2eWJtaHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDM3OTAsImV4cCI6MjEwMzA3OTc5MH0.83pUMuyqSh8Bit6GkwbGcJDTZg2Zmaot0XiASrfbMwU";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase browser configuration is missing.");
}

/** Browser client: this uses only the anonymous key and the signed-in user JWT. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
