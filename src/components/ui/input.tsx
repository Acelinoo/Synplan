import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, leftIcon, rightIcon, id, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 flex items-center text-muted-foreground">
              {leftIcon}
            </div>
          )}
          <input
            type={type}
            id={id}
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
              leftIcon && "pl-9",
              rightIcon && "pr-9",
              error && "border-destructive focus-visible:ring-destructive",
              className
            )}
            ref={ref}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error && id ? `${id}-error` : undefined}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 flex items-center text-muted-foreground">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={id ? `${id}-error` : undefined} className="mt-1 text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
