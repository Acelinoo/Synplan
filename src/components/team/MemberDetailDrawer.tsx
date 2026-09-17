"use client";

import * as React from "react";
import Link from "next/link";
import {
  X,
  Mail,
  Shield,
  CheckSquare,
  BarChart3,
  FolderGit2,
  Calendar,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { WorkspaceMember, MemberRole } from "@/types";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useUiStore } from "@/store";

interface MemberDetailDrawerProps {
  member: WorkspaceMember | null;
  isOpen: boolean;
  onClose: () => void;
  onRoleChange?: (memberId: string, newRole: MemberRole) => void;
  onRemove?: (memberId: string) => void;
}

const roleBadgeStyles: Record<MemberRole, { label: string; bg: string }> = {
  owner: { label: "Owner", bg: "bg-primary/10 text-primary border-primary/30" },
  admin: { label: "Admin", bg: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  member: { label: "Member", bg: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  viewer: { label: "Viewer", bg: "bg-muted text-muted-foreground border-border" },
};

export function MemberDetailDrawer({
  member,
  isOpen,
  onClose,
  onRoleChange,
  onRemove,
}: MemberDetailDrawerProps) {
  const { can, isOwner: isCallerOwner, isAdmin: isCallerAdmin } = usePermissions();
  const { addToast } = useUiStore();
  const [copiedId, setCopiedId] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  // Close on Escape
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !member) return null;

  const roleStyle = roleBadgeStyles[member.role] || roleBadgeStyles.member;
  const isTargetOwner = member.role === "owner";
  const isTargetAdmin = member.role === "admin";

  const canModifyThisMemberRole =
    can("members.update_role") &&
    !isTargetOwner &&
    (!isCallerAdmin || (!isTargetAdmin && !isTargetOwner));

  const canRemoveThisMember =
    can("members.remove") &&
    !isTargetOwner &&
    (!isCallerAdmin || !isTargetAdmin);

  const workload = member.workloadScore || 0;
  const getCapacityStatus = (score: number) => {
    if (score > 85) return { label: "Overloaded (>85%)", color: "text-destructive bg-destructive/10" };
    if (score > 60) return { label: "High Capacity (61-85%)", color: "text-amber-500 bg-amber-500/10" };
    return { label: "Optimal (≤60%)", color: "text-emerald-500 bg-emerald-500/10" };
  };
  const capacity = getCapacityStatus(workload);

  const handleCopyUserId = () => {
    if (!member.user?.id) return;
    navigator.clipboard.writeText(member.user.id);
    setCopiedId(true);
    addToast({
      title: "User ID Copied",
      description: "Copied global user ID to clipboard.",
      variant: "info",
    });
    setTimeout(() => setCopiedId(false), 2000);
  };

  const availableRoles: MemberRole[] = isCallerOwner
    ? ["admin", "member", "viewer"]
    : ["member", "viewer"];

  const monogram = (member.user?.name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-drawer-title"
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <aside className="w-screen max-w-md border-l border-border bg-card shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-surface/30">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Member Profile & Telemetry
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Body (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-xs">
            {/* Profile Overview Card */}
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary font-mono ring-2 ring-border shadow-xs overflow-hidden">
                {member.user?.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={member.user.avatarUrl}
                    alt={member.user.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  monogram
                )}
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 id="member-drawer-title" className="text-sm font-bold text-foreground truncate">
                    {member.user?.name || "Unknown"}
                  </h3>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[9px] font-mono uppercase font-bold tracking-wider shrink-0",
                      roleStyle.bg
                    )}
                  >
                    {roleStyle.label}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{member.user?.email || "No email"}</span>
                </p>
                <div className="flex items-center gap-1 pt-1">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    UID: {member.user?.id ? `${member.user.id.substring(0, 10)}...` : "N/A"}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyUserId}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                    title="Copy User ID"
                  >
                    {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Role Management Card */}
            <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Shield className="h-4 w-4 text-primary" />
                  <span>Workspace Role</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {canModifyThisMemberRole ? "Authorized" : "Read Only"}
                </span>
              </div>

              {canModifyThisMemberRole ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">
                    Assign new role for this squad member:
                  </label>
                  <select
                    value={member.role}
                    onChange={(e) => onRoleChange?.(member.id, e.target.value as MemberRole)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                  {isCallerAdmin && (
                    <p className="text-[10px] text-muted-foreground">
                      Note: Workspace Admins can only assign Member or Viewer roles.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {isTargetOwner
                    ? "Workspace Owners cannot have their role modified. Ownership transfer must be performed explicitly."
                    : "You do not possess elevated permissions to modify this member's role."}
                </p>
              )}
            </div>

            {/* Workload Capacity & Task Telemetry */}
            <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span>Workload & Bandwidth</span>
                </div>
                <span className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-semibold", capacity.color)}>
                  {capacity.label}
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Current Utilization</span>
                  <span className="font-mono font-bold text-foreground">{workload}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-card border border-border/60 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      workload > 85 ? "bg-destructive" : workload > 60 ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(workload, 100)}%` }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="rounded-lg border border-border/70 bg-card p-2.5 text-center">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Active</span>
                  <p className="text-base font-mono font-bold text-foreground mt-0.5">
                    {member.activeTaskCount ?? member.assignedTasksCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-2.5 text-center">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Completed</span>
                  <p className="text-base font-mono font-bold text-emerald-500 mt-0.5">
                    {member.completedTaskCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card p-2.5 text-center">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total</span>
                  <p className="text-base font-mono font-bold text-muted-foreground mt-0.5">
                    {member.totalAssignedCount ?? member.assignedTasksCount ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Project Involvement Card */}
            <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <FolderGit2 className="h-4 w-4 text-primary" />
                  <span>Workspace Projects</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {member.projects?.length || 0} Project{member.projects?.length === 1 ? "" : "s"}
                </span>
              </div>

              {member.projects && member.projects.length > 0 ? (
                <div className="space-y-2">
                  {member.projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5 hover:border-primary/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: p.color || "#6366F1" }}
                        />
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {p.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.role && (
                          <span className="rounded bg-surface px-1.5 py-0.2 text-[9px] font-mono text-muted-foreground uppercase">
                            {p.role}
                          </span>
                        )}
                        <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  Not currently assigned to any projects in this workspace.
                </p>
              )}
            </div>

            {/* Membership Metadata Card */}
            <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Workspace Membership ID</span>
                <span className="font-mono text-foreground">{member.id}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Joined Workspace</span>
                <span className="font-mono text-foreground">
                  {new Date(member.joinedAt).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {/* Destructive Removal Section */}
            {canRemoveThisMember && (
              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 px-4 py-2.5 text-xs font-semibold text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Remove Member from Workspace</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="fixed inset-0" onClick={() => setIsDeleteConfirmOpen(false)} />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <h4 className="text-sm font-bold text-foreground">Remove Squad Member</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to remove <strong>{member.user?.name}</strong> from this workspace?
              Their active task assignments will be unassigned and workspace project memberships removed.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-surface text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  onClose();
                  onRemove?.(member.id);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
