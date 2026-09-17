"use client";

import * as React from "react";
import { Plus, CheckSquare, FolderKanban, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useWorkspaceStore, useUiStore } from "@/store";
import { Button } from "@/components/ui/button";

export function DashboardHeader() {
  const router = useRouter();
  const { activeWorkspace, currentUser } = useWorkspaceStore();
  const { setCreateTaskModalOpen, setCreateProjectModalOpen } = useUiStore();

  const formattedDate = React.useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const userName = currentUser?.name || "Team";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Overview
          </h1>
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-primary">
            {activeWorkspace?.name || "Workspace"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {formattedDate} • Operational overview and sprint health for <span className="font-semibold text-foreground">{userName}</span>.
        </p>
      </div>

      {/* Fast Action Launcher */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/my-work")}
          className="h-8 gap-1.5 text-xs border-border hover:bg-surface-muted cursor-pointer"
        >
          <CheckSquare className="h-3.5 w-3.5 text-primary" />
          <span>My Work</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateProjectModalOpen(true)}
          className="h-8 gap-1.5 text-xs border-border hover:bg-surface-muted cursor-pointer"
        >
          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
          <span>New Project</span>
        </Button>

        <Button
          size="sm"
          onClick={() => setCreateTaskModalOpen(true)}
          className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Task</span>
        </Button>
      </div>
    </div>
  );
}
