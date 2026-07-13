import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { authClient, type AuthUser } from "@/lib/supabase/auth";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export type VolunteerProfile = {
  id: string;
  nome: string | null;
  cognome: string | null;
  ruolo: "admin" | "operatore";
  attivo: boolean;
};

export type AuthenticatedVolunteer = {
  email: string;
  profile: VolunteerProfile | null;
};

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. The Proxy refreshes them.
        }
      },
    },
  });
}

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  if (cookieStore.get("cpg_demo_session")?.value === "admin") {
    return {
      user: {
        id: "demo-admin",
        email: "admin",
      },
      profile: {
        id: "demo-admin",
        nome: "Admin",
        cognome: "Demo",
        ruolo: "admin" as const,
        attivo: true,
      },
    };
  }

  const supabase = await createClient();
  const auth = authClient(supabase);
  const { data: userData, error: userError } = await auth.getUser();
  if (userError || !userData.user) {
    return { user: null, profile: null };
  }

  const profile = await getProfileForUser(supabase, userData.user);

  return {
    user: userData.user,
    profile,
  };
}

async function getProfileForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AuthUser,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,nome,cognome,ruolo,attivo")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return null;
  return data as VolunteerProfile | null;
}
