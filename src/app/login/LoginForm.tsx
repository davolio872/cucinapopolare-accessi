"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-bold text-stone-700">Email o nome utente</span>
        <input
          name="email"
          type="text"
          autoComplete="username"
          required
          className="mt-1 h-12 w-full rounded-md border border-stone-300 px-3 text-base"
          placeholder="admin"
        />
      </label>

      <label className="block">
        <span className="text-sm font-bold text-stone-700">Password</span>
        <div className="mt-1 flex rounded-md border border-stone-300 bg-white">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-12 min-w-0 flex-1 rounded-md px-3 text-base outline-none"
            placeholder="Password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="px-3 text-sm font-bold text-emerald-800"
          >
            {showPassword ? "Nascondi" : "Mostra"}
          </button>
        </div>
      </label>

      {state.error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-md bg-emerald-800 px-4 text-base font-bold text-white disabled:cursor-wait disabled:bg-stone-400"
      >
        {pending ? "Accesso in corso..." : "Accedi"}
      </button>
    </form>
  );
}
