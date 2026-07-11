import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectedFrom?: string }>;
}) {
  const { user } = await getAuthenticatedUser();
  if (user) redirect("/");
  const params = await searchParams;
  const pageMessage =
    params.error === "inactive"
      ? "Utente non attivo. Contatta un amministratore."
      : params.redirectedFrom
        ? "Sessione scaduta o accesso richiesto. Accedi per continuare."
        : "";

  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f4ed] px-4 py-10 text-stone-950">
      <section className="w-full max-w-md rounded-md border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-emerald-800 text-xl font-bold text-white">
            CP
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cucina Popolare Genovese</h1>
            <p className="text-sm text-stone-600">Accesso volontari</p>
          </div>
        </div>

        {pageMessage ? (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            {pageMessage}
          </p>
        ) : null}

        <LoginForm />
      </section>
    </main>
  );
}
