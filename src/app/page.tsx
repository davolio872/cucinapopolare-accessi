import { redirect } from "next/navigation";
import { CucinaApp } from "@/components/CucinaApp";
import { createDemoState } from "@/data/demo-data";
import { loadOperationalState } from "@/lib/cpg-data";
import { todayKey } from "@/lib/dates";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

export default async function Home() {
  const { user, profile } = await getAuthenticatedUser();

  if (!user) redirect("/login");
  if (profile?.attivo === false) redirect("/auth/signout?reason=inactive");

  const dataMode = user.id === "demo-admin" ? "demo" : "supabase";
  const role = profile?.ruolo === "admin" || user.id === "demo-admin" ? "admin" : "operatore";
  const initialState =
    dataMode === "supabase"
      ? await loadOperationalState(await createClient(), {
          includeCommunicationLogs: role === "admin",
          entryDate: role === "operatore" ? todayKey() : undefined,
        })
      : createDemoState(todayKey());

  return (
    <CucinaApp
      dataMode={dataMode}
      initialState={initialState}
      volunteer={{
        email: user.email ?? "",
        profile,
      }}
    />
  );
}
