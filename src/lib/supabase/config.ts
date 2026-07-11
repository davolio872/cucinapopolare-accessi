export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://upsqhkvlpxowsdoihpth.supabase.co";

export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_R0dXZVu6DAbY2z2u8p7U4g_IIPcszVI";

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);
