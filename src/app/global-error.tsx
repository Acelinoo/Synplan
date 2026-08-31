"use client";

import * as React from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[Synplan Critical Global Error]:", error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#081420] text-[#F0F6FC] flex flex-col items-center justify-center p-6 text-center antialiased">
        <div className="relative mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400">
            <AlertOctagon className="h-8 w-8" />
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Aplikasi Mengalami Masalah Kritis
        </h1>
        <p className="mt-2 max-w-md text-sm text-slate-400 leading-relaxed">
          Terjadi kesalahan fatal pada level aplikasi root. Silakan refresh halaman untuk memulihkan sesi Anda.
        </p>

        {error.digest && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#142C44] px-2.5 py-1 text-[11px] font-mono text-slate-400 border border-[#183754]">
            <span>Digest: {error.digest}</span>
          </div>
        )}

        <button
          onClick={() => reset()}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#2072B8] px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[#1A5E99] active:scale-95 transition-all cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Muat Ulang Aplikasi</span>
        </button>
      </body>
    </html>
  );
}
