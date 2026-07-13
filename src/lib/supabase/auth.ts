export type AuthUser = {
  id: string;
  email?: string;
};

type AuthError = {
  message?: string;
} | null;

export type SupabaseAuthClient = {
  getUser(): Promise<{
    data: { user: AuthUser | null };
    error: AuthError;
  }>;
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ error: AuthError }>;
  signOut(): Promise<{ error: AuthError }>;
};

export function authClient(supabase: { auth: unknown }) {
  return supabase.auth as SupabaseAuthClient;
}
