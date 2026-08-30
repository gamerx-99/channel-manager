export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  supabaseUrl:
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    "https://roznxbvhflwrfvybmhtm.supabase.co",
  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvem54YnZoZmx3cmZ2eWJtaHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDM3OTAsImV4cCI6MjEwMzA3OTc5MH0.83pUMuyqSh8Bit6GkwbGcJDTZg2Zmaot0XiASrfbMwU",
};
