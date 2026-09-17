"use client";

import * as React from "react";
import {
  Users2,
  UserPlus,
  Shield,
  Trash2,
  CheckCircle2,
  Search,
  Check,
  AlertTriangle,
  X,
  Clock,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/apiClient";
import { useUiStore, useWorkspaceStore } from "@/store";
import { cn } from "@/lib/utils";

interface ProjectMembersTabProps {
  projectId: string;
  projectName: string;
  members: any[];
  canManageMembers?: boolean;
  onMembersUpdated: () => void;
  onFilterMemberTasks?: (memberId: string) => void;
}

const PROJECT_ROLES: Array<{ value: "LEAD" | "CONTRIBUTOR" | "VIEWER"; label: string; desc: string }> = [
  { value: "LEAD", label: "Project Lead", desc: "Coordinates delivery, milestone approval, and squad management" },
  { value: "CONTRIBUTOR", label: "Contributor", desc: "Executes work items, updates status, and collaborates on deliverables" },
  { value: "VIEWER", label: "Viewer", desc: "Read-only access to tasks, phases, roadmap, and activity" },
];

export function ProjectMembersTab({
  projectId,
  projectName,
  members,
  canManageMembers = true,
  onMembersUpdated,
  onFilterMemberTasks,
}: ProjectMembersTabProps) {
  const { addToast } = useUiStore();
  const { activeWorkspace } = useWorkspaceStore();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [workspaceMembers, setWorkspaceMembers] = React.useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [selectedRole, setSelectedRole] = React.useState<"LEAD" | "CONTRIBUTOR" | "VIEWER">("CONTRIBUTOR");
  const [isAdding, setIsAdding] = React.useState(false);
  const [isLoadingWsMembers, setIsLoadingWsMembers] = React.useState(false);

  // Remove Member Modal State
  const [memberToRemove, setMemberToRemove] = React.useState<any | null>(null);
  const [isRemoving, setIsRemoving] = React.useState(false);

  // Updating Role State
  const [updatingMemberId, setUpdatingMemberId] = React.useState<string | null>(null);

  // Load available workspace members for the modal
  const loadWorkspaceMembers = React.useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setIsLoadingWsMembers(true);
    try {
      const res = await apiClient.getTeamMembers(activeWorkspace.id);
      if (res.success && Array.isArray(res.data)) {
        setWorkspaceMembers(res.data);
      }
    } catch (e) {
      console.warn("Failed to load workspace members:", e);
    } finally {
      setIsLoadingWsMembers(false);
    }
  }, [activeWorkspace?.id]);

  const handleOpenAddModal = () => {
    loadWorkspaceMembers();
    setSelectedUserId("");
    setSelectedRole("CONTRIBUTOR");
    setIsAddModalOpen(true);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      addToast({
        title: "Validation Error",
        description: "Please select a team member to add to this project.",
        variant: "warning",
      });
      return;
    }

    setIsAdding(true);
    try {
      const res = await apiClient.addProjectMember(projectId, {
        userId: selectedUserId,
        role: selectedRole,
      });

      if (res.success) {
        addToast({
          title: "Member Added",
          description: "Squad member successfully assigned to project.",
          variant: "success",
        });
        setIsAddModalOpen(false);
        onMembersUpdated();
      } else {
        addToast({
          title: "Assignment Failed",
          description: res.error || res.message || "Failed to add member.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "Network error while assigning member.",
        variant: "danger",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    setUpdatingMemberId(memberId);
    try {
      const res = await apiClient.updateProjectMemberRole(projectId, {
        memberId,
        role: newRole,
      });

      if (res.success) {
        addToast({
          title: "Role Updated",
          description: `Project role changed to ${newRole}.`,
          variant: "success",
        });
        onMembersUpdated();
      } else {
        addToast({
          title: "Update Failed",
          description: res.error || res.message || "Failed to update role.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "Failed to update project role.",
        variant: "danger",
      });
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    setIsRemoving(true);
    try {
      const res = await apiClient.removeProjectMember(projectId, memberToRemove.id);
      if (res.success) {
        addToast({
          title: "Member Removed",
          description: `${memberToRemove.user?.name || "Member"} was removed from this project squad.`,
          variant: "warning",
        });
        setMemberToRemove(null);
        onMembersUpdated();
      } else {
        addToast({
          title: "Removal Failed",
          description: res.error || res.message || "Failed to remove member.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "Network error while removing member.",
        variant: "danger",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  // Filter existing members
  const filteredMembers = members.filter((m) => {
    const name = (m.user?.name || "").toLowerCase();
    const email = (m.user?.email || "").toLowerCase();
    const role = (m.role || "").toUpperCase();

    const matchesSearch = !searchQuery.trim() || name.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || role === roleFilter.toUpperCase();

    return matchesSearch && matchesRole;
  });

  // Calculate existing project user IDs to filter out in Add modal
  const assignedUserIds = new Set(members.map((m) => m.userId || m.user?.id));
  const availableToAdd = workspaceMembers.filter((wm) => !assignedUserIds.has(wm.userId || wm.user?.id));

  // Identify leads
  const leads = members.filter((m) => m.role === "LEAD");

  return (
    <div className="space-y-6">
      {/* Top Banner / Squad Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Project Squad & Roles</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Manage contributors, designate project leads, and track task workloads for <strong>{projectName}</strong>.
          </p>
          {leads.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1 text-xs text-foreground">
              <Shield className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Lead:</span>
              <span className="font-semibold">{leads.map((l) => l.user?.name || "Squad Lead").join(", ")}</span>
            </div>
          )}
        </div>

        {canManageMembers && (
          <Button
            size="sm"
            onClick={handleOpenAddModal}
            className="h-8.5 gap-1.5 text-xs font-semibold shrink-0 cursor-pointer shadow-xs"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add Squad Member</span>
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter squad members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8.5 w-full rounded-md border border-border bg-card pl-8 pr-3 text-xs text-foreground focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="all">All Roles ({members.length})</option>
            <option value="LEAD">Leads ({members.filter((m) => m.role === "LEAD").length})</option>
            <option value="CONTRIBUTOR">Contributors ({members.filter((m) => m.role === "CONTRIBUTOR").length})</option>
            <option value="VIEWER">Viewers ({members.filter((m) => m.role === "VIEWER").length})</option>
          </select>
        </div>
      </div>

      {/* Collaborators Grid */}
      {filteredMembers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center space-y-3">
          <Users2 className="h-8 w-8 text-muted-foreground mx-auto" />
          <h3 className="text-sm font-bold text-foreground">
            {searchQuery || roleFilter !== "all" ? "No Matching Squad Members" : "No Squad Members Assigned"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchQuery || roleFilter !== "all"
              ? "Try adjusting your search criteria or role filter."
              : "Assign members from your workspace to give them designated ownership and roles in this project."}
          </p>
          {canManageMembers && !searchQuery && roleFilter === "all" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenAddModal}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Assign First Member</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMembers.map((m) => {
            const userName = m.user?.name || "Squad Member";
            const userEmail = m.user?.email || "";
            const userRole: "LEAD" | "CONTRIBUTOR" | "VIEWER" = m.role || "CONTRIBUTOR";
            const initial = userName.charAt(0).toUpperCase();
            const activeTaskCount = m.activeTaskCount !== undefined ? m.activeTaskCount : 0;
            const isUpdating = updatingMemberId === m.id;

            return (
              <div
                key={m.id}
                className="flex flex-col justify-between rounded-lg border border-border bg-card p-4 space-y-3 shadow-2xs hover:border-border/80 transition-colors"
              >
                {/* Header: Avatar, Name, Email */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary font-mono shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{userName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
                    </div>
                  </div>

                  {/* Project Role Badge */}
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold tracking-tight uppercase shrink-0",
                      userRole === "LEAD"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : userRole === "CONTRIBUTOR"
                        ? "bg-status-progress/10 text-status-progress border-status-progress/30"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {userRole}
                  </span>
                </div>

                {/* Telemetry Strip: Active Tasks & Joined Date */}
                <div className="flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 font-medium",
                      onFilterMemberTasks && "cursor-pointer hover:text-foreground"
                    )}
                    onClick={() => onFilterMemberTasks?.(m.userId)}
                    title="Active assigned tasks in this project"
                  >
                    <Briefcase className="h-3 w-3 text-primary" />
                    <span>
                      {activeTaskCount} {activeTaskCount === 1 ? "active task" : "active tasks"}
                    </span>
                  </div>

                  {m.joinedAt && (
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      <Clock className="h-3 w-3 text-muted-foreground/60" />
                      <span>{new Date(m.joinedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* Management Actions */}
                {canManageMembers && (
                  <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Role:</span>
                      <select
                        disabled={isUpdating}
                        value={userRole}
                        onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                        className="h-6.5 rounded border border-border bg-surface-muted px-1.5 text-[10px] font-medium text-foreground focus:outline-none cursor-pointer"
                      >
                        <option value="LEAD">Lead</option>
                        <option value="CONTRIBUTOR">Contributor</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMemberToRemove(m)}
                      className="h-6.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive text-[10px] cursor-pointer"
                      title={`Remove ${userName} from project`}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      <span>Remove</span>
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Member Modal Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Add Squad Member</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Workspace Team Member</label>
                {isLoadingWsMembers ? (
                  <p className="text-xs text-muted-foreground italic">Loading workspace roster...</p>
                ) : availableToAdd.length === 0 ? (
                  <p className="text-xs text-amber-500 italic">
                    All members of this workspace are already assigned to this project.
                  </p>
                ) : (
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
                    required
                  >
                    <option value="">-- Select Member --</option>
                    {availableToAdd.map((wm) => (
                      <option key={wm.id} value={wm.userId || wm.user?.id}>
                        {wm.user?.name || "Member"} ({wm.user?.email}) — {wm.role}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Project Role</label>
                <div className="space-y-2">
                  {PROJECT_ROLES.map((r) => (
                    <label
                      key={r.value}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors",
                        selectedRole === r.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-surface-muted/50"
                      )}
                    >
                      <input
                        type="radio"
                        name="projectRole"
                        value={r.value}
                        checked={selectedRole === r.value}
                        onChange={() => setSelectedRole(r.value)}
                        className="mt-0.5 text-primary focus:ring-primary"
                      />
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-foreground">{r.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-snug">{r.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!selectedUserId || isAdding || availableToAdd.length === 0}
                  className="h-8 text-xs font-semibold cursor-pointer"
                >
                  {isAdding ? "Adding..." : "Add to Project"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Dialog */}
      {memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-sm rounded-lg border border-destructive/40 bg-card p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-sm font-bold">Remove Squad Member</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Are you sure you want to remove{" "}
              <strong className="text-foreground">{memberToRemove.user?.name || "this member"}</strong> from{" "}
              <strong>{projectName}</strong>? Any tasks currently assigned to them will remain in the project.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMemberToRemove(null)}
                className="h-8 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isRemoving}
                onClick={handleRemoveMember}
                className="h-8 text-xs font-semibold cursor-pointer"
              >
                {isRemoving ? "Removing..." : "Remove Member"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
