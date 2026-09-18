import type { Metadata } from "next";
import { supabaseSession } from "@/lib/supabase/session";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Muster",
  description: "Your AI HR team.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await supabaseSession();
  const {
    data: { user },
  } = await db.auth.getUser();

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f7f7f8" }}>
        <nav
          style={{
            display: "flex",
            gap: 24,
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid #e2e2e4",
            background: "#fff",
          }}
        >
          <strong>Muster</strong>
          {user ? (
            <>
              <a href="/dashboard">Dashboard</a>
              <a href="/work-queue">Work queue</a>
              <a href="/exception-desk">Exception desk</a>
              <span style={{ marginLeft: "auto", color: "#666", fontSize: 14 }}>{user.email}</span>
              <SignOutButton />
            </>
          ) : (
            <span style={{ marginLeft: "auto" }}>
              <a href="/sign-in">Sign in</a>
              {" · "}
              <a href="/sign-up">Sign up</a>
            </span>
          )}
        </nav>
        <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}
