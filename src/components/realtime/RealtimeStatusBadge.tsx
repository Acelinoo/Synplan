"use client";

import * as React from "react";
import { useRealtime } from "./RealtimeProvider";
import { cn } from "@/lib/utils";

interface RealtimeStatusBadgeProps {
  className?: string;
  showText?: boolean;
}

export function RealtimeStatusBadge({ className, showText = false }: RealtimeStatusBadgeProps) {
  const { connectionState, isConnected } = useRealtime();

  const statusConfig = {
    CONNECTED: {
      color: "bg-emerald-500",
      pulse: "bg-emerald-400",
      label: "Live Synced",
      title: "Realtime: Live Connected",
    },
    CONNECTING: {
      color: "bg-amber-500",
      pulse: "bg-amber-400",
      label: "Connecting...",
      title: "Realtime: Connecting to workspace channel",
    },
    RECONNECTING: {
      color: "bg-amber-500",
      pulse: "bg-amber-400",
      label: "Reconnecting...",
      title: "Realtime: Reconnecting to workspace channel",
    },
    DISCONNECTED: {
      color: "bg-muted-foreground/40",
      pulse: "transparent",
      label: "Offline",
      title: "Realtime: Local mode / Disconnected",
    },
    ERROR: {
      color: "bg-rose-500",
      pulse: "bg-rose-400",
      label: "Sync Error",
      title: "Realtime: Connection error, falling back to REST",
    },
  }[connectionState];

  return (
    <div
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      title={statusConfig.title}
    >
      <span className="relative flex h-2 w-2">
        {isConnected && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              statusConfig.pulse
            )}
          />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", statusConfig.color)} />
      </span>
      {showText && (
        <span className="text-[10px] font-mono font-medium text-muted-foreground">
          {statusConfig.label}
        </span>
      )}
    </div>
  );
}
