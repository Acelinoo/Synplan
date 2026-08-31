"use client";

import * as React from "react";
import { useWorkspaceStore } from "@/store";

export function DashboardHeader() {
  const { activeWorkspace, currentUser } = useWorkspaceStore();

  const formattedDate = React.useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const userName = currentUser?.name || "Acelino";

  return (
    <div className="space-y-1">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        Good day, {userName}
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground">
        {formattedDate} — Here&apos;s an overview of{" "}
        <span className="font-semibold text-foreground/90">
          {activeWorkspace?.name || "Synplan Workspace"}
        </span>
        .
      </p>
    </div>
  );
}
