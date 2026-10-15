import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Providers } from "@/lib/query/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Work Orders", template: "%s · Work Orders" },
  description: "Manage technician work orders.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          Skip to content
        </a>
        <header className="border-b border-slate-300 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link
              href="/"
              className="rounded text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Work Orders
            </Link>
            <Link href="/work-orders/new" className="btn-primary">
              New work order
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-6">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
