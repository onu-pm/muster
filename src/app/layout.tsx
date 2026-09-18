import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Muster",
  description: "Your AI HR team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f7f7f8" }}>
        <nav
          style={{
            display: "flex",
            gap: 24,
            padding: "16px 24px",
            borderBottom: "1px solid #e2e2e4",
            background: "#fff",
          }}
        >
          <strong>Muster</strong>
          <a href="/work-queue">Work queue</a>
          <a href="/exception-desk">Exception desk</a>
        </nav>
        <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}
