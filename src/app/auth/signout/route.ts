import { NextResponse } from "next/server";
import { authClient } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  return signOut(request);
}

export async function GET(request: Request) {
  return signOut(request);
}

async function signOut(request: Request) {
  const supabase = await createClient();
  const auth = authClient(supabase);
  await auth.signOut();

  const requestUrl = new URL(request.url);
  const redirectUrl = new URL("/login", request.url);
  const reason = requestUrl.searchParams.get("reason");
  if (reason) redirectUrl.searchParams.set("error", reason);

  const response = NextResponse.redirect(redirectUrl, {
    status: 303,
  });
  response.cookies.delete("cpg_demo_session");
  return response;
}
