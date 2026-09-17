import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted/60 p-1 text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabTrigger({
  value,
  children,
  icon: Icon,
  badge,
  className,
}: {
  value: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabTrigger must be used inside Tabs");

  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-all select-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isActive
          ? "bg-card text-foreground shadow-xs font-semibold border border-border/80"
          : "text-muted-foreground hover:text-foreground hover:bg-card/40 border border-transparent",
        className
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span>{children}</span>
      {badge && <span className="ml-0.5">{badge}</span>}
    </button>
  );
}

export function TabContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabContent must be used inside Tabs");

  if (ctx.value !== value) return null;

  return (
    <div role="tabpanel" className={cn("mt-3 focus-visible:outline-none", className)}>
      {children}
    </div>
  );
}
