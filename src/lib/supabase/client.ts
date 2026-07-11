"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
