import * as React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: "xs" | "sm" | "default" | "lg" | "xl";
  presence?: "online" | "offline" | "busy" | "away";
  className?: string;
}

const sizeMap = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-xs",
  default: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-12 w-12 text-base",
};

const presenceColor = {
  online: "bg-emerald-500 ring-card",
  offline: "bg-slate-400 ring-card",
  busy: "bg-rose-500 ring-card",
  away: "bg-amber-500 ring-card",
};

export function Avatar({
  src,
  name = "User",
  size = "default",
  presence,
  className,
}: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className={cn("relative inline-flex shrink-0 select-none", className)}>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full font-mono font-bold border border-border bg-primary/10 text-primary",
          sizeMap[size]
        )}
      >
        {src && !imageError ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={name}
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>
      {presence && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2",
            size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2",
            presenceColor[presence]
          )}
          aria-label={`Status: ${presence}`}
        />
      )}
    </div>
  );
}
