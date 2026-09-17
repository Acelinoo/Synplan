"use client";

import * as React from "react";
import { Shield, KeyRound, Laptop, LogOut, CheckCircle2, Lock, ExternalLink, AlertTriangle } from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { RbacMatrixTable } from "./RbacMatrixTable";
import { DisasterRecoveryPanel } from "./DisasterRecoveryPanel";
import { AuditLogStream } from "./AuditLogStream";

interface ActiveSessionItem {
  id: string;
  tokenSnippet: string;
  isCurrent: boolean;
  expiresAt: string;
  createdAt: string;
}

interface AccountItem {
  id: string;
  provider: string;
  createdAt: string;
}

export function SecuritySettingsSection() {
  const { addToast } = useUiStore();
  const [accounts, setAccounts] = React.useState<AccountItem[]>([]);
  const [sessions, setSessions] = React.useState<ActiveSessionItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    async function loadSecurityData() {
      try {
        const res = await apiClient.getUserProfile();
        if (res.success && res.data && isMounted) {
          setAccounts(res.data.accounts || []);
          setSessions(res.data.activeSessions || []);
        }
      } catch (err) {
        console.warn("Failed to load security metadata:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadSecurityData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      addToast({
        title: "Session Terminated",
        description: "You have been logged out securely.",
        variant: "info",
      });
      window.location.href = "/login";
    } catch (err) {
      console.error("Sign out error:", err);
      window.location.href = "/login";
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Identity & Authentication Card */}
      <div className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-border pb-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Authentication & Single Sign-On (SSO)</h2>
            <p className="text-xs text-muted-foreground">Connected identity providers and cryptographic credential delegation</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Synplan uses delegated OAuth 2.0 authentication. Raw passwords, salt hashes, and two-factor authentication
            credentials (2FA/TOTP/FIDO2) are managed directly by your authorized identity provider. Synplan does not store
            or handle user passwords.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-surface/40 p-3.5 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Google Identity Services</span>
                  {accounts.some((a) => a.provider.toLowerCase() === "google") ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface border border-border px-2 py-0.2 text-[10px] font-mono text-muted-foreground">
                      Available
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">Single Sign-On via Google OAuth 2.0</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-surface/40 p-3.5 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">GitHub OAuth</span>
                  {accounts.some((a) => a.provider.toLowerCase() === "github") ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface border border-border px-2 py-0.2 text-[10px] font-mono text-muted-foreground">
                      Available
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">Developer identity & repository commit SSO</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Sessions Telemetry Card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Active Browser Sessions
            </h3>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-primary">
            30-Day Expiry Token
          </span>
        </div>

        <div className="space-y-2.5">
          {sessions.map((sess) => (
            <div
              key={sess.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface/40 p-3.5 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground font-semibold">
                    {sess.tokenSnippet}
                  </span>
                  {sess.isCurrent && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Current Session
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                  <span>
                    Created:{" "}
                    {new Date(sess.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span>·</span>
                  <span>
                    Expires:{" "}
                    {new Date(sess.expiresAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {sess.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 self-start sm:self-auto"
                >
                  <LogOut className="h-3 w-3" />
                  <span>{isSigningOut ? "Signing out..." : "Sign Out Session"}</span>
                </Button>
              )}
            </div>
          ))}

          {sessions.length === 0 && !isLoading && (
            <div className="rounded-lg border border-border/70 bg-surface/40 p-4 text-center text-xs text-muted-foreground">
              No additional active sessions recorded.
            </div>
          )}
        </div>
      </div>

      {/* Role-Based Access Control Matrix */}
      <RbacMatrixTable />

      {/* Disaster Recovery & Snapshot Export */}
      <DisasterRecoveryPanel />

      {/* Security Audit Trail */}
      <AuditLogStream />
    </div>
  );
}
