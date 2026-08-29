import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Synplan — Project Management & Team Collaboration Platform",
  description: "Simple, clean, professional, and data-focused SaaS workspace for modern teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const storedTheme = localStorage.getItem("synplan_theme");
                if (storedTheme === "light") {
                  document.documentElement.classList.remove("dark");
                } else if (storedTheme === "dark") {
                  document.documentElement.classList.add("dark");
                } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
                  document.documentElement.classList.remove("dark");
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="h-screen w-screen overflow-hidden bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
