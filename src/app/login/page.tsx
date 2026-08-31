"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Shield, AlertCircle, FolderKanban } from "lucide-react";

function LoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const [loadingProvider, setLoadingProvider] = React.useState<"google" | "github" | null>(null);

  // Clear stale session cookie on login page mount if error or expired param is present
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        document.cookie = "synplan_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        localStorage.removeItem("synplan_active_ws");
      } catch (e) {}
    }
  }, []);

  const getErrorMessage = (err: string | null) => {
    if (!err) return null;
    switch (err) {
      case "session_expired":
        return "Sesi login Anda telah berakhir. Silakan masuk kembali.";
      case "google_not_configured":
        return "Google OAuth belum dikonfigurasi. Harap isi GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di file .env.";
      case "github_not_configured":
        return "GitHub OAuth belum dikonfigurasi. Harap isi GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET di file .env.";
      case "access_denied":
        return "Akses otorisasi dibatalkan atau ditolak oleh pengguna.";
      case "invalid_state":
        return "Sesi otorisasi kedaluwarsa atau terjadi ketidakcocokan state (CSRF guard). Silakan coba lagi.";
      case "oauth_exchange_failed":
        return "Gagal melakukan verifikasi token OAuth dengan provider. Silakan coba kembali.";
      default:
        return `Terjadi kendala saat login: ${err}`;
    }
  };

  const errorMessage = getErrorMessage(errorParam);

  const handleOAuthLogin = (provider: "google" | "github") => {
    setLoadingProvider(provider);
    window.location.href = `/api/auth/login/${provider}`;
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background p-4 overflow-hidden select-none">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Authentication Card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border/80 bg-card p-8 shadow-2xl transition-all duration-300">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary text-primary-foreground shadow-xs mb-1">
            <FolderKanban className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              Welcome to Synplan
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              Plan smarter. Work better.
            </p>
          </div>
        </div>

        {/* Error Alert if redirected from OAuth failure */}
        {errorMessage && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-semibold block mb-0.5">Autentikasi Terkendala</span>
              {errorMessage}
            </div>
          </div>
        )}

        {/* OAuth Authentication Buttons */}
        <div className="mt-8 space-y-3.5">
          {/* Google OAuth Button */}
          <button
            id="google-login-button"
            type="button"
            disabled={loadingProvider !== null}
            onClick={() => handleOAuthLogin("google")}
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-sm font-semibold text-foreground shadow-xs transition-all duration-200 hover:bg-muted hover:border-primary/40 hover:shadow-xs active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loadingProvider === "google" ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          {/* GitHub OAuth Button */}
          <button
            id="github-login-button"
            type="button"
            disabled={loadingProvider !== null}
            onClick={() => handleOAuthLogin("github")}
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-sm font-semibold text-foreground shadow-xs transition-all duration-200 hover:bg-muted hover:border-primary/40 hover:shadow-xs active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loadingProvider === "github" ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <svg className="h-5 w-5 shrink-0 fill-current text-foreground" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            )}
            <span>Continue with GitHub</span>
          </button>
        </div>

        {/* Security & Zero-Password Assurance */}
        <div className="mt-8 pt-6 border-t border-border/50 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/80 font-medium">
            <Shield className="h-3.5 w-3.5 text-emerald-500" />
            <span>Secure OAuth 2.0 • No password required</span>
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-1.5 leading-relaxed">
            By continuing, you authenticate securely with your trusted provider to access your Synplan workspaces.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-background">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
