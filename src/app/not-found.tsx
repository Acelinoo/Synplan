import Link from "next/link";
import { Compass, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in zoom-in-95 duration-300">
      {/* Visual Indicator */}
      <div className="relative mb-6">
        <div className="absolute -inset-4 bg-primary/15 rounded-full blur-xl pointer-events-none" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/30 bg-primary/10 text-primary shadow-inner">
          <Compass className="h-10 w-10 animate-spin-slow" />
        </div>
      </div>

      <div className="space-y-2 max-w-md">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
          <span>Error 404</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Halaman Tidak Ditemukan
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Halaman atau entitas yang Anda tuju tidak tersedia, telah dipindahkan, atau Anda tidak memiliki akses izin.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/">
          <Button
            variant="default"
            className="gap-2 px-5 py-2.5 text-xs font-semibold shadow-md active:scale-95 cursor-pointer"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Kembali ke Dashboard</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
