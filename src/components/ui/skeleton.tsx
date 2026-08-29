import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean;
}

export function Skeleton({
  className,
  shimmer = false,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-muted/70 dark:bg-muted/50",
        shimmer
          ? "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-linear-to-r before:from-transparent before:via-white/10 before:to-transparent"
          : "animate-pulse motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

export function SkeletonAvatar({
  size = "md",
  className,
  ...props
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const sizeMap = {
    xs: "h-5 w-5",
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  return (
    <Skeleton
      className={cn("rounded-full shrink-0", sizeMap[size], className)}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 2,
  className,
  ...props
}: {
  lines?: number;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3 rounded",
            i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-xs",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
