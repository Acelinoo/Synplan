"use client";

import * as React from "react";
import { useWorkspaceStore } from "@/store";

export function DashboardHeader() {
  const { activeWorkspace } = useWorkspaceStore();

  const formattedDate = React.useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  return (
    <div className="space-y-1">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        Good morning, Acelino
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground">
        {formattedDate} — Here&apos;s an overview of Synplan workspace.
      </p>
    </div>
  );
}
