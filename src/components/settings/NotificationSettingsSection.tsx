"use client";

import * as React from "react";
import { Bell, Radio, CheckCircle2, AlertCircle, Clock, Info, ShieldCheck, Mail, MessageSquare } from "lucide-react";
import { useNotificationStore } from "@/store";

export function NotificationSettingsSection() {
  const { unreadCount } = useNotificationStore();

  return (
    <div className="space-y-6">
      {/* Information Header Card */}
      <div className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-border pb-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Notification Dispatch & Preferences</h2>
            <p className="text-xs text-muted-foreground">
              Architecture telemetry for real-time in-app alerts and external delivery channels
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Synplan routes notifications directly to your authenticated session using a dedicated in-app delivery queue
          backed by PostgreSQL and an authoritative WebSocket connection. Alerts are automatically dispatched when you are
          assigned to a task, requested for review, or when critical milestones transition.
        </p>

        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            Currently, you have <strong>{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}</strong> in your personal inbox.
          </span>
        </div>
      </div>

      {/* Active In-App Realtime Delivery Channels */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Active Delivery Channels (Live)
            </h3>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-500">
            Realtime Connected
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-surface/40 p-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Task Assignments & Ownership</span>
                <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-mono text-emerald-500">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Immediate in-app push alert whenever a teammate assigns you to a task or reassigns task ownership.
              </p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-surface/40 p-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Status & Review Transitions</span>
                <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-mono text-emerald-500">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dispatched when tasks you are assigned to or watching transition to <code className="font-mono text-primary">IN_REVIEW</code> or <code className="font-mono text-amber-500">BLOCKED</code>.
              </p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-surface/40 p-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Discussion Comments & Mentions</span>
                <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-mono text-emerald-500">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                In-app notification badge updated when colleagues comment on tasks you authored or are assigned to.
              </p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          </div>
        </div>
      </div>

      {/* External Notification Channels (Honest Architecture Status) */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              External Channels & Custom Rules
            </h3>
          </div>
          <span className="rounded-full bg-surface border border-border px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            Planned Domain Phase
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-surface/20 p-3.5 opacity-80">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">Email Digest & Instant Alerts</span>
                <span className="rounded-sm bg-surface border border-border px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                  Upcoming
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Automated hourly/daily email summaries of project activity. Requires external SMTP/Resend integration service.
              </p>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-surface/20 p-3.5 opacity-80">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">Slack & Discord Webhook Relays</span>
                <span className="rounded-sm bg-surface border border-border px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                  Upcoming
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Outbound webhooks forwarding task and phase completions directly to team messaging channels.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-surface/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Architectural Note:</span> Personal preferences (e.g. mute specific projects, quiet hours) will be persisted via a dedicated notification preferences table once the multi-channel notification engine is activated.
        </div>
      </div>
    </div>
  );
}
