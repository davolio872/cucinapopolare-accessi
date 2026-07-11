import { redirect } from "next/navigation";
import { CucinaApp } from "@/components/CucinaApp";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function Home() {
  const { user, profile } = await getAuthenticatedUser();

  if (!user) redirect("/login");
  if (profile?.attivo === false) redirect("/auth/signout?reason=inactive");

  return (
    <CucinaApp
      volunteer={{
        email: user.email ?? "",
        profile,
      }}
    />
  );
}
