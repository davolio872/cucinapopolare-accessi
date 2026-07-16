import Image from "next/image";
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
    <main className="grid min-h-screen place-items-center bg-white px-4 py-10 text-black">
      <section className="w-full max-w-md rounded-md border-2 border-black bg-white p-6">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-cucina-popolare.png"
            alt="Cucina Popolare Genovese"
            width={64}
            height={84}
            className="h-16 w-12 object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold">Gestionale prenotazioni 1.0</h1>
            <p className="text-sm font-semibold text-zinc-700">Sviluppo Roberto D&apos;Avolio</p>
            <p className="text-sm text-zinc-700">Accesso volontari</p>
          </div>
        </div>

        {pageMessage ? (
          <p className="mt-6 rounded-md border-2 border-black bg-yellow-100 p-3 text-sm font-semibold text-black">
            {pageMessage}
          </p>
        ) : null}

        <LoginForm />
      </section>
    </main>
  );
}
