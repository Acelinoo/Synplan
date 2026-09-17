"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Clock, ArrowUpRight } from "lucide-react";
import { ActivityItem } from "@/domains/activity/activity.service";
import { formatActivityEvent } from "./ActivityEventFormatter";
import { cn } from "@/lib/utils";

interface ActivityTimelineItemProps {
  item: ActivityItem;
  isLast?: boolean;
}

export function ActivityTimelineItem({ item, isLast = false }: ActivityTimelineItemProps) {
  const formatted = formatActivityEvent(item);
  const Icon = formatted.icon;

  const actorName = item.actor?.name || (item.actorType === "SYSTEM" ? "System Automation" : item.actorType === "AI" ? "AI Assistant" : "Team Member");
  const actorInitial = item.actor?.name
    ? item.actor.name.charAt(0).toUpperCase()
    : item.actorType === "SYSTEM"
    ? "⚡"
    : item.actorType === "AI"
    ? "✦"
    : "U";

  return (
    <div className="group relative flex gap-4 pl-2">
      {/* Vertical Timeline Stem */}
      {!isLast && (
        <div
          className="absolute left-6 top-10 -bottom-3 w-[1.5px] bg-border/40 group-hover:bg-border/70 transition-colors"
          aria-hidden="true"
        />
      )}

      {/* Actor Avatar / Semantic Icon Node */}
      <div className="relative z-10 flex flex-col items-center shrink-0">
        <div className="relative">
          {item.actor?.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.actor.avatarUrl}
              alt={actorName}
              className="h-8 w-8 rounded-full border border-border/70 object-cover bg-muted/40 shadow-xs"
            />
          ) : (
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold font-mono border shadow-xs transition-transform group-hover:scale-105",
                item.actorType === "SYSTEM"
                  ? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                  : item.actorType === "AI"
                  ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                  : "bg-primary/10 text-primary border-primary/20"
              )}
              title={actorName}
            >
              {actorInitial}
            </div>
          )}

          {/* Micro Icon Badge on Avatar */}
          <div
            className={cn(
              "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border shadow-xs",
              formatted.iconBgClass,
              formatted.badgeBorderClass
            )}
            title={item.action}
          >
            <Icon className={cn("h-2.5 w-2.5", formatted.iconColorClass)} />
          </div>
        </div>
      </div>

      {/* Main Event Content Container */}
      <div className="min-w-0 flex-1 pb-6">
        <div className="rounded-lg border border-border bg-card p-3 sm:p-3.5 transition-all group-hover:border-border-strong group-hover:shadow-2xs">
          {/* Top Line: Actor + Action + Entity */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
              <span className="font-semibold text-foreground">{actorName}</span>
              <span className="text-muted-foreground">{formatted.actionVerb}</span>

              {formatted.destinationLink ? (
                <Link
                  href={formatted.destinationLink}
                  className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
                >
                  <span className="truncate max-w-[200px] sm:max-w-md font-medium text-foreground">
                    &quot;{formatted.entityTitle}&quot;
                  </span>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                </Link>
              ) : (
                <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-md">
                  &quot;{formatted.entityTitle}&quot;
                </span>
              )}

              {/* Entity Type Pill */}
              <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground uppercase tracking-wider border border-border/40">
                {formatted.entityTypeBadge}
              </span>
            </div>

            {/* Accessible Relative Timestamp with Tooltip */}
            <div
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 cursor-default"
              title={formatted.fullTime}
            >
              <Clock className="h-3 w-3 text-muted-foreground/60" />
              <time dateTime={item.timestamp}>{formatted.relativeTime}</time>
            </div>
          </div>

          {/* Context Snippet (Status Transitions, Comments, Assignment) */}
          {formatted.contextSnippet.type === "status_transition" && (
            <div className="mt-2.5 flex items-center gap-2 text-xs">
              {formatted.contextSnippet.from && (
                <span className="rounded bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground capitalize border border-border/30">
                  {formatted.contextSnippet.from}
                </span>
              )}
              {formatted.contextSnippet.from && (
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="rounded bg-primary/10 text-primary font-mono text-[11px] px-2 py-0.5 capitalize border border-primary/20 font-medium">
                {formatted.contextSnippet.to}
              </span>
            </div>
          )}

          {formatted.contextSnippet.type === "comment" && formatted.contextSnippet.text && (
            <div className="mt-2 rounded-lg bg-muted/30 border border-border/30 p-2.5 text-xs text-muted-foreground italic font-sans">
              {formatted.contextSnippet.text}
            </div>
          )}

          {formatted.contextSnippet.type === "assignment" && formatted.contextSnippet.text && (
            <div className="mt-2 text-xs text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1">
              <span>{formatted.contextSnippet.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
