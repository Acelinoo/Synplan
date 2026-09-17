import * as React from "react";
import { cn } from "@/lib/utils";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  label?: string;
  className?: string;
}

export function Divider({
  orientation = "horizontal",
  label,
  className,
}: DividerProps) {
  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn("h-4 w-px bg-border shrink-0 self-center", className)}
      />
    );
  }

  if (label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={cn("relative my-3 flex items-center justify-center", className)}
      >
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <span className="relative bg-card px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn("my-2 h-px w-full bg-border", className)}
    />
  );
}
