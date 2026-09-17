import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, error, id, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          id={id}
          className={cn(
            "flex h-9 w-full appearance-none rounded-md border border-input bg-card px-3 py-1.5 pr-8 text-xs text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          ref={ref}
          aria-invalid={error ? "true" : undefined}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        {error && (
          <p className="mt-1 text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
