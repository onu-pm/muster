"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Screen 0b — Sign in. Supabase Auth, email + password. */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }

    // "/" decides where to land — Holly's Team screen once a team is
    // enabled, otherwise the team picker.
    router.push("/");
    router.refresh();
  }

  return (
    <div className="auth-shell">
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit} className="form-stack">
        <input
          type="email"
          required
          className="field"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          className="field"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ marginTop: 16 }}>
        No account yet? <a href="/sign-up">Sign up</a>
      </p>
    </div>
  );
}
