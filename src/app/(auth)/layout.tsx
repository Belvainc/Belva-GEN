// ─── Auth Layout ───────────────────────────────────────────────────────────────
// Minimal centered layout for authentication pages (login, etc.).
// No sidebar, no navigation — just a clean centered card.

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
