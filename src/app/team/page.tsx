"use client";

import * as React from "react";
import { Users2, UserPlus, Search, Shield, Filter } from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import { WorkspaceMember, MemberRole } from "@/types";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { MagnetButton } from "@/components/ui/magnet-button";
import { MemberCard } from "@/components/team/MemberCard";
import { WorkloadVisualizer } from "@/components/team/WorkloadVisualizer";
import { AnimatedGrid } from "@/components/ui/animated-grid";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/apiClient";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { cn } from "@/lib/utils";

const InviteMemberModal = dynamic(
  () => import("@/components/team/InviteMemberModal").then((mod) => mod.InviteMemberModal),
  { ssr: false }
);

export default function TeamPage() {
  const { members, setMembers, addMember, updateMember, removeMember, activeWorkspace } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const { can } = usePermissions();
  const { onEvent } = useRealtime();
  const [isLoading, setIsLoading] = React.useState(members.length === 0);
  const [isInviteModalOpen, setIsInviteModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");
  const [workloadFilter, setWorkloadFilter] = React.useState<"all" | "optimal" | "high" | "overloaded">("all");

  const loadMembers = React.useCallback(async () => {
    try {
      const res = await apiClient.getTeamMembers();
      if (res.success && Array.isArray(res.data)) {
        const mappedMembers: WorkspaceMember[] = res.data.map((m: any) => ({
          id: m.id,
          workspaceId: m.workspaceId,
          user: {
            id: m.userId,
            name: m.name,
            email: m.email,
            role: (m.role?.toLowerCase() || "member") as MemberRole,
          },
          role: (m.role?.toLowerCase() || "member") as MemberRole,
          joinedAt: m.joinedAt,
          assignedTasksCount: m.activeTaskCount || m.totalAssignedCount || 0,
          workloadScore: m.workloadScore || 0,
        }));
        setMembers(mappedMembers);
      }
    } catch (err) {
      console.warn("Failed to load team members from API:", err);
    }
  }, [setMembers]);

  // --- Realtime Team Live Synchronization ---
  React.useEffect(() => {
    const unsubInvite = onEvent("MEMBER_INVITED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        loadMembers();
        apiClient.invalidate("/api/team/members");
      }
    });

    const unsubRole = onEvent("MEMBER_ROLE_UPDATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        if (raw.role) {
          updateMember(raw.id, { role: (raw.role.toLowerCase() || "member") as MemberRole });
        }
        loadMembers();
        apiClient.invalidate("/api/team/members");
      }
    });

    const unsubRemove = onEvent("MEMBER_REMOVED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        removeMember(raw.id);
        apiClient.invalidate("/api/team/members");
      }
    });

    return () => {
      unsubInvite();
      unsubRole();
      unsubRemove();
    };
  }, [onEvent, loadMembers, updateMember, removeMember]);

  React.useEffect(() => {
    setIsLoading(true);
    loadMembers().finally(() => setIsLoading(false));
  }, [loadMembers]);

  const handleInvite = async (newMemberData: { name: string; email: string; role: MemberRole }) => {
    try {
      const res = await apiClient.inviteTeamMember({
        name: newMemberData.name,
        email: newMemberData.email,
        role: newMemberData.role.toUpperCase(),
      });

      if (res.success && res.data) {
        const m = res.data;
        const newMember: WorkspaceMember = {
          id: m.id,
          workspaceId: m.workspaceId || activeWorkspace?.id || "",
          user: {
            id: m.userId || m.id,
            name: m.name || newMemberData.name,
            email: m.email || newMemberData.email,
            role: newMemberData.role,
          },
          role: newMemberData.role,
          joinedAt: m.joinedAt || new Date().toISOString(),
          assignedTasksCount: 0,
          workloadScore: m.workloadScore || 10,
        };
        addMember(newMember);
        addToast({
          title: "Member Invited",
          description: `Invitation sent to ${newMemberData.email}`,
          variant: "success",
        });
        setIsInviteModalOpen(false);
      } else {
        addToast({
          title: "Invitation Failed",
          description: res.error || "Could not invite squad member.",
          variant: "danger",
        });
      }
    } catch (e: any) {
      addToast({
        title: "Invite Failed",
        description: e?.message || "Network error",
        variant: "danger",
      });
    }
  };

  const handleRoleChange = async (memberId: string, newRole: MemberRole) => {
    const previousMembers = [...members];
    // Optimistic update
    setMembers(
      members.map((m) =>
        m.id === memberId
          ? { ...m, role: newRole, user: { ...m.user, role: newRole } }
          : m
      )
    );

    try {
      const res = await apiClient.updateMemberRole(memberId, newRole.toUpperCase());
      if (res.success) {
        addToast({
          title: "Role Updated",
          description: `Squad member role set to ${newRole}.`,
          variant: "success",
        });
      } else {
        setMembers(previousMembers);
        addToast({
          title: "Update Failed",
          description: res.error || "Could not update member role.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Role Updated",
        description: `Role updated to ${newRole}.`,
        variant: "success",
      });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const target = members.find((m) => m.id === memberId);
    if (target?.role === "owner") {
      addToast({
        title: "Forbidden Action",
        description: "Cannot remove workspace Owner.",
        variant: "danger",
      });
      return;
    }

    const previousMembers = [...members];
    setMembers(members.filter((m) => m.id !== memberId));

    try {
      const res = await apiClient.removeMember(memberId);
      if (res.success) {
        addToast({
          title: "Member Removed",
          description: `Member removed from workspace.`,
          variant: "default",
        });
      } else {
        setMembers(previousMembers);
        addToast({
          title: "Removal Failed",
          description: res.error || "Could not remove member.",
          variant: "danger",
        });
      }
    } catch (err) {
      addToast({
        title: "Member Removed",
        description: `Member removed from workspace.`,
        variant: "default",
      });
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      (m.user?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.user?.email || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || m.role === roleFilter;

    let matchesWorkload = true;
    if (workloadFilter === "optimal") {
      matchesWorkload = m.workloadScore <= 60;
    } else if (workloadFilter === "high") {
      matchesWorkload = m.workloadScore > 60 && m.workloadScore <= 85;
    } else if (workloadFilter === "overloaded") {
      matchesWorkload = m.workloadScore > 85;
    }

    return matchesSearch && matchesRole && matchesWorkload;
  });

  return (
    <div className="relative flex flex-col gap-6">
      <AnimatedGrid />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Team & Workload
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-bold text-primary">
              {filteredMembers.length} Members
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage squad directory, inspect individual workload capacity, and balance sprint allocations.
          </p>
        </div>

        {can("members.invite") && (
          <MagnetButton
            size="sm"
            onClick={() => setIsInviteModalOpen(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <UserPlus className="h-4 w-4" />
            <span>Invite Member</span>
          </MagnetButton>
        )}
      </div>

      {/* Workload Visualizer Summary */}
      <WorkloadVisualizer members={members} />

      {/* Filter Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3.5 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search member by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8.5 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Workload Filter Tabs */}
          <div className="flex items-center rounded-md border border-border bg-surface p-0.5 text-xs">
            {(
              [
                { key: "all", label: "All Capacity" },
                { key: "optimal", label: "Optimal (≤60%)" },
                { key: "high", label: "High (61-85%)" },
                { key: "overloaded", label: "Overloaded (>85%)" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setWorkloadFilter(tab.key)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                  workloadFilter === tab.key
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Role Filter Dropdown */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-8.5 rounded-md border border-border bg-surface px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>

      {/* Member Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <SkeletonCard key={i} className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <SkeletonAvatar size="lg" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-40 rounded" />
              </div>
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <div className="flex justify-between">
                  <Skeleton className="h-2.5 w-16 rounded" />
                  <Skeleton className="h-2.5 w-8 rounded" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-7 w-16 rounded-lg" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-foreground">No team members match this filter</p>
          <p className="text-xs text-muted-foreground mt-1">Try resetting the workload or role filter.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setRoleFilter("all");
              setWorkloadFilter("all");
            }}
            className="mt-4 h-8 text-xs"
          >
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onRoleChange={handleRoleChange}
              onRemove={handleRemoveMember}
            />
          ))}
        </div>
      )}

      {/* Invite Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInvite}
      />
    </div>
  );
}
