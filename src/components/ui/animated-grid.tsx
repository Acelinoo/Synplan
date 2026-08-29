"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AnimatedGridProps {
  className?: string;
}

export function AnimatedGrid({ className }: AnimatedGridProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-30 dark:opacity-20",
        className
      )}
    >
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"
      />
    </div>
  );
}
