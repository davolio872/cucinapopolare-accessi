import { createClient } from "@supabase/supabase-js";
import type { AppState } from "@/types";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export { isSupabaseConfigured, supabasePublishableKey, supabaseUrl };

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function loadRemoteState(pin: string) {
  const { data, error } = await supabase.rpc("cpg_get_state", {
    p_pin: pin,
  });

  if (error) throw new Error(error.message);
  return data as AppState;
}

export async function saveRemoteState(pin: string, state: AppState) {
  const { data, error } = await supabase.rpc("cpg_save_state", {
    p_pin: pin,
    p_state: state,
  });

  if (error) throw new Error(error.message);
  return data as AppState;
}
