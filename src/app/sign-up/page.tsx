"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Screen 0a — Sign up. Supabase Auth, email + password. If the project has
 * "Confirm email" turned on (Supabase's default), signUp() won't return a
 * usable session — we tell the person to check their inbox instead of
 * pretending it worked.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signUp({ email, password });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      router.push("/onboarding");
    } else {
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <div>
        <h1>Check your email</h1>
        <p>We sent a confirmation link to {email}. Click it, then come back and sign in.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360 }}>
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
        />
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p style={{ marginTop: 16 }}>
        Already have an account? <a href="/sign-in">Sign in</a>
      </p>
    </div>
  );
}
