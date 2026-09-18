import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { supabaseSession } from "@/lib/supabase/session";
import { SignOutButton } from "./sign-out-button";
import "./globals.css";

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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <nav className="nav">
          <span className="nav-brand">Muster</span>
          {user ? (
            <>
              <a href="/team">Holly</a>
              <a href="/dashboard">Dashboard</a>
              <a href="/work-queue">Work queue</a>
              <a href="/exception-desk">Exception desk</a>
              <a href="/history">History</a>
              <a href="/import">Import CSV</a>
              <a href="/rules-setup">Calculation rules</a>
              <span className="nav-spacer">
                <span className="nav-email">{user.email}</span>
                <SignOutButton />
              </span>
            </>
          ) : (
            <span className="nav-spacer">
              <a href="/sign-in">Sign in</a>
              {" · "}
              <a href="/sign-up">Sign up</a>
            </span>
          )}
        </nav>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
