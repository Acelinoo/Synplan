"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { useUiStore } from "@/store";
import { cn } from "@/lib/utils";

const variantConfig = {
  default: {
    icon: Info,
    className: "border-border bg-card text-foreground",
    iconColor: "text-muted-foreground",
  },
  success: {
    icon: CheckCircle2,
    className: "border-emerald-500/30 bg-card text-foreground",
    iconColor: "text-emerald-500",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-500/30 bg-card text-foreground",
    iconColor: "text-amber-500",
  },
  danger: {
    icon: AlertCircle,
    className: "border-rose-500/30 bg-card text-foreground",
    iconColor: "text-rose-500",
  },
  info: {
    icon: Info,
    className: "border-sky-500/30 bg-card text-foreground",
    iconColor: "text-sky-500",
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useUiStore();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full select-none"
    >
      {toasts.map((toast) => {
        const conf = variantConfig[toast.variant || "default"] || variantConfig.default;
        const Icon = conf.icon;

        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border p-3.5 shadow-lg animate-in slide-in-from-bottom-3 duration-200",
              conf.className
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", conf.iconColor)} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label="Dismiss toast"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
