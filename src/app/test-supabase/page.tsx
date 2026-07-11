import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function TestSupabasePage() {
  const { user, profile } = await getAuthenticatedUser();

  if (!user) redirect("/login");
  if (profile?.attivo === false) redirect("/auth/signout?reason=inactive");

  return (
    <main className="min-h-screen bg-[#f8f4ed] px-4 py-8 text-stone-950">
      <section className="mx-auto max-w-2xl rounded-md border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Test Supabase</h1>
        <p className="mt-2 text-stone-600">
          Questa pagina è visibile solo dopo login con Supabase Auth.
        </p>

        <dl className="mt-6 grid gap-3">
          <div className="rounded-md bg-stone-100 p-3">
            <dt className="text-sm font-bold text-stone-600">Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="rounded-md bg-stone-100 p-3">
            <dt className="text-sm font-bold text-stone-600">Profilo</dt>
            <dd>
              {profile
                ? `${profile.nome ?? ""} ${profile.cognome ?? ""}`.trim() ||
                  "Profilo senza nome"
                : "Nessun profilo collegato"}
            </dd>
          </div>
          <div className="rounded-md bg-stone-100 p-3">
            <dt className="text-sm font-bold text-stone-600">Ruolo</dt>
            <dd>{profile?.ruolo ?? "Non impostato"}</dd>
          </div>
          <div className="rounded-md bg-stone-100 p-3">
            <dt className="text-sm font-bold text-stone-600">Stato</dt>
            <dd>Attivo</dd>
          </div>
        </dl>

        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center rounded-md bg-emerald-800 px-4 font-bold text-white"
        >
          Torna alla dashboard
        </Link>
      </section>
    </main>
  );
}
