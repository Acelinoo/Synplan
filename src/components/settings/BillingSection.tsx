"use client";

import * as React from "react";
import { CreditCard, CheckCircle2, ShieldCheck, Sparkles, AlertCircle, Layers } from "lucide-react";
import { useWorkspaceStore } from "@/store";

export function BillingSection() {
  const { activeWorkspace } = useWorkspaceStore();

  const entitlements = [
    { name: "Unlimited Workspace Projects & Sprints", status: "Included" },
    { name: "Unified Multi-View Task Management (Board, List, Table)", status: "Included" },
    { name: "Authoritative Task Engine with 7-State Finite State Machine", status: "Included" },
    { name: "Real-Time WebSocket Sync & In-App Notification Queue", status: "Included" },
    { name: "Role-Based Access Control (Owner, Admin, Member, Viewer)", status: "Included" },
    { name: "Full Immutable Audit Log Telemetry", status: "Included" },
    { name: "Local Disaster Recovery & JSON Snapshot Exports", status: "Included" },
    { name: "AI Plan Generation & Structured Execution Safety", status: "Included" },
  ];

  return (
    <div className="space-y-6">
      {/* Plan Header Card */}
      <div className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">Workspace Plan & Entitlements</h2>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-500">
                  Community Edition
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Authoritative subscription status and workspace feature entitlements
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs font-mono font-bold text-foreground">$0.00 / month</span>
            <p className="text-[11px] text-muted-foreground">Open Source & Community</p>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-surface/40 p-4 text-xs space-y-2 leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">
            Current Tier: Synplan Community Edition
          </p>
          <p>
            This workspace is operating under the open-access Community Edition. There are no credit cards, active recurring charges, or metered billing restrictions attached to this instance.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Commercial enterprise billing capabilities (Stripe customer portal, seat-based subscriptions, and compute usage metering) will be introduced in subsequent platform phases.
          </p>
        </div>
      </div>

      {/* Feature Entitlements Breakdown */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Active Plan Entitlements
            </h3>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            All Features Unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {entitlements.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-lg border border-border/70 bg-surface/30 p-3"
            >
              <span className="text-foreground font-medium">{item.name}</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-mono text-emerald-500 flex items-center gap-1 shrink-0 ml-2">
                <CheckCircle2 className="h-2.5 w-2.5" /> {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Honest Billing Boundary Notice */}
      <div className="rounded-lg border border-border/60 bg-surface/30 p-4 text-xs text-muted-foreground space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Zero-Cost Guarantee</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          No credit card is on file, and no automatic charges will ever be levied without explicit administrator confirmation and migration to a commercial enterprise instance.
        </p>
      </div>
    </div>
  );
}
