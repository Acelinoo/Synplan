import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  actions,
  icon: Icon,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mb-3", className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
        <div>
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
            {title}
          </h2>
          {description && (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
