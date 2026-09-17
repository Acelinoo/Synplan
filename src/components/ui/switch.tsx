import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  id?: string;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  id,
  className,
}: SwitchProps) {
  const generatedId = React.useId();
  const switchId = id || generatedId;

  return (
    <div className={cn("inline-flex items-center gap-2 select-none", className)}>
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-muted-foreground/30 dark:bg-muted-foreground/20"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-xs ring-0 transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </button>
      {label && (
        <label
          htmlFor={switchId}
          className="text-xs font-normal text-foreground cursor-pointer"
        >
          {label}
        </label>
      )}
    </div>
  );
}
