import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "left";
  width?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const widthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  width = "md",
  className,
}: DrawerProps) {
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    }
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in transition-opacity"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Drawer Surface */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "drawer-title" : undefined}
        className={cn(
          "relative z-10 flex h-full w-full flex-col border-border bg-card shadow-2xl transition-transform duration-200",
          side === "right"
            ? "ml-auto border-l animate-in slide-in-from-right"
            : "mr-auto border-r animate-in slide-in-from-left",
          widthMap[width],
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            {title && (
              <h2 id="drawer-title" className="text-sm font-semibold text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-border/70 bg-surface-muted/30 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
