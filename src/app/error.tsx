"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log exception to console in dev, or send to observability in production
    console.error("[Synplan Root Error Boundary Captured]:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in zoom-in-95 duration-300">
      {/* Glow Effect */}
      <div className="relative mb-6">
        <div className="absolute -inset-4 bg-destructive/15 rounded-full blur-xl pointer-events-none" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive shadow-inner">
          <AlertTriangle className="h-8 w-8" />
        </div>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Terjadi Kendala Teknis
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
        Maaf, sistem mengalami kendala tak terduga saat memproses tampilan ini. Silakan coba muat ulang atau kembali ke Dashboard.
      </p>

      {error.digest && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-[11px] font-mono text-muted-foreground border border-border/60">
          <span>Error Digest: {error.digest}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => reset()}
          variant="default"
          className="gap-2 px-5 py-2.5 text-xs font-semibold shadow-md active:scale-95 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Coba Lagi</span>
        </Button>
        <Link href="/">
          <Button
            variant="outline"
            className="gap-2 px-5 py-2.5 text-xs font-semibold border-border/80 hover:bg-muted active:scale-95 cursor-pointer"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Kembali ke Dashboard</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
