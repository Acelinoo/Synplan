import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: React.ReactNode;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, label, disabled, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <label
        htmlFor={inputId}
        className={cn(
          "inline-flex items-center gap-2 select-none cursor-pointer text-xs text-foreground",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <div className="relative flex items-center justify-center">
          <input
            type="checkbox"
            id={inputId}
            ref={ref}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            className="peer sr-only"
            {...props}
          />
          <div
            className={cn(
              "h-4 w-4 rounded-sm border border-border bg-card transition-colors peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background",
              checked && "border-primary bg-primary text-primary-foreground",
              !checked && "hover:border-border-strong"
            )}
          >
            {checked && <Check className="h-3.5 w-3.5 stroke-[3] text-primary-foreground" />}
          </div>
        </div>
        {label && <span className="font-normal">{label}</span>}
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
