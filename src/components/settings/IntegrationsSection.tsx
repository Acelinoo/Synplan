"use client";

import * as React from "react";
import { Blocks, Github, Globe, CheckCircle2, Clock, ShieldCheck, ArrowUpRight, Lock } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

export function IntegrationsSection() {
  const [accounts, setAccounts] = React.useState<Array<{ id: string; provider: string }>>([]);

  React.useEffect(() => {
    let isMounted = true;
    async function loadAccounts() {
      try {
        const res = await apiClient.getUserProfile();
        if (res.success && res.data?.accounts && isMounted) {
          setAccounts(res.data.accounts);
        }
      } catch (err) {
        console.warn("Failed to load connected accounts:", err);
      }
    }
    loadAccounts();
    return () => {
      isMounted = false;
    };
  }, []);

  const hasGoogle = accounts.some((a) => a.provider.toLowerCase() === "google");
  const hasGithub = accounts.some((a) => a.provider.toLowerCase() === "github");

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-border pb-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Blocks className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Workspace Integrations & Ecosystem</h2>
            <p className="text-xs text-muted-foreground">Connected external services, identity providers, and API bridges</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Manage third-party integrations and single sign-on connections. In compliance with security principles,
          integration credentials, tokens, and OAuth secrets are encrypted server-side and never exposed to the client.
        </p>
      </div>

      {/* Single Sign-On Identity Integrations */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Active Single Sign-On (SSO) Providers
          </h3>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-500 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Zero-Trust Delegated
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-surface/40 p-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">Google Cloud Identity</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Google Workspace & Gmail authentication</p>
            </div>
            {hasGoogle ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="rounded-full bg-surface border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                Available
              </span>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-surface/40 p-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4 text-foreground" />
                <span className="font-semibold text-foreground">GitHub Developer SSO</span>
              </div>
              <p className="text-[11px] text-muted-foreground">GitHub organization & user authentication</p>
            </div>
            {hasGithub ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="rounded-full bg-surface border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                Available
              </span>
            )}
          </div>
        </div>
      </div>

      {/* External Service Ecosystem (Planned Integrations) */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Planned Platform Integrations
            </h3>
          </div>
          <span className="rounded-full bg-surface border border-border px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            Future Module
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-surface/20 p-3.5 opacity-80">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Github className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">GitHub Two-Way Issue & PR Sync</span>
                <span className="rounded-sm bg-surface border border-border px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                  Upcoming
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Bi-directional synchronization between Synplan tasks and GitHub Issues or Pull Requests.
              </p>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-surface/20 p-3.5 opacity-80">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">Custom Outbound Webhooks</span>
                <span className="rounded-sm bg-surface border border-border px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                  Upcoming
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                HMAC-signed HTTP POST webhooks dispatched on task status changes, sprint phase closures, and automation events.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface/30 p-3 text-[11px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>
            Synplan enforces strict secret isolation. No API keys or tokens are stored without server-side cryptographic encryption.
          </span>
        </div>
      </div>
    </div>
  );
}
