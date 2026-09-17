"use client";

import * as React from "react";
import { Mail, CheckSquare, MoreVertical, Trash2, FolderGit2, Check, UserCheck } from "lucide-react";
import { WorkspaceMember, MemberRole } from "@/types";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

interface MemberCardProps {
  member: WorkspaceMember;
  onRoleChange?: (memberId: string, newRole: MemberRole) => void;
  onRemove?: (memberId: string) => void;
  onSelectMember?: (member: WorkspaceMember) => void;
}

const roleBadgeStyles: Record<MemberRole, { label: string; bg: string }> = {
  owner: { label: "Owner", bg: "bg-primary/10 text-primary border-primary/30" },
  admin: { label: "Admin", bg: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  member: { label: "Member", bg: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  viewer: { label: "Viewer", bg: "bg-muted text-muted-foreground border-border" },
};

export function MemberCard({ member, onRoleChange, onRemove, onSelectMember }: MemberCardProps) {
  const { can, isOwner: isCallerOwner, isAdmin: isCallerAdmin } = usePermissions();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  const roleStyle = roleBadgeStyles[member.role] || roleBadgeStyles.member;
  const isTargetOwner = member.role === "owner";
  const isTargetAdmin = member.role === "admin";

  // Check if caller can modify target's role
  const canModifyThisMemberRole =
    can("members.update_role") &&
    !isTargetOwner &&
    (!isCallerAdmin || (!isTargetAdmin && !isTargetOwner));

  // Check if caller can remove target member
  const canRemoveThisMember =
    can("members.remove") &&
    !isTargetOwner &&
    (!isCallerAdmin || !isTargetAdmin);

  const workload = member.workloadScore || 0;
  const getWorkloadColor = (score: number) => {
    if (score > 85) return "bg-destructive";
    if (score > 60) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const getCapacityStatus = (score: number) => {
    if (score > 85) return { label: "Overloaded", color: "text-destructive bg-destructive/10" };
    if (score > 60) return { label: "High Capacity", color: "text-amber-500 bg-amber-500/10" };
    return { label: "Optimal", color: "text-emerald-500 bg-emerald-500/10" };
  };

  const capacity = getCapacityStatus(workload);

  const availableRoles: MemberRole[] = isCallerOwner
    ? ["admin", "member", "viewer"]
    : ["member", "viewer"];

  const handleRoleSelect = (role: MemberRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    onRoleChange?.(member.id, role);
  };

  const monogram = (member.user?.name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <div
        onClick={() => onSelectMember?.(member)}
        className="group relative flex flex-col justify-between h-full rounded-lg border border-border bg-card p-4 sm:p-5 hover:border-border-strong hover:shadow-2xs transition-all cursor-pointer"
      >
        {/* Top: Header with Avatar, Details & Actions */}
        <div className="space-y-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary font-mono ring-1 ring-border shadow-xs overflow-hidden">
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
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                  {member.user?.name || "Unknown Member"}
                </h3>
                <p className="truncate text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{member.user?.email || "No email"}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[9px] font-mono uppercase font-bold tracking-wider",
                  roleStyle.bg
                )}
              >
                {roleStyle.label}
              </span>

              {/* Action Menu Trigger */}
              {(canModifyThisMemberRole || canRemoveThisMember) && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(!isMenuOpen);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
                    title="Member options"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>

                  {isMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMenuOpen(false);
                        }}
                      />
                      <div className="absolute right-0 top-6 z-50 w-44 rounded-lg border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95 text-left">
                        {canModifyThisMemberRole && (
                          <>
                            <div className="px-2 py-1 text-[10px] font-mono text-muted-foreground uppercase font-bold">
                              Change Role
                            </div>
                            {availableRoles.map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={(e) => handleRoleSelect(r, e)}
                                className={cn(
                                  "flex w-full items-center justify-between px-2 py-1.5 text-xs rounded-md transition-colors",
                                  member.role === r
                                    ? "bg-primary/10 text-primary font-semibold"
                                    : "text-foreground hover:bg-surface"
                                )}
                              >
                                <span className="capitalize">{r}</span>
                                {member.role === r && <Check className="h-3 w-3" />}
                              </button>
                            ))}
                          </>
                        )}

                        {canRemoveThisMember && (
                          <>
                            <div className="my-1 border-t border-border" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsMenuOpen(false);
                                setIsDeleteConfirmOpen(true);
                              }}
                              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Remove Member</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Workload Progress Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground font-medium">Workload Capacity</span>
              <span className={cn("px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold", capacity.color)}>
                {workload}% · {capacity.label}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden border border-border/50">
              <div
                className={cn("h-full rounded-full transition-all duration-300", getWorkloadColor(workload))}
                style={{ width: `${Math.min(workload, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bottom: Task Count & Project Pills */}
        <div className="pt-3 border-t border-border/60 mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5 text-primary" />
              <span>{member.activeTaskCount ?? member.assignedTasksCount ?? 0} active task{(member.activeTaskCount ?? member.assignedTasksCount) === 1 ? "" : "s"}</span>
            </span>
            <span className="font-mono text-[10px]">
              Joined {new Date(member.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
            </span>
          </div>

          {/* Project Pills */}
          {member.projects && member.projects.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              {member.projects.slice(0, 2).map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 rounded bg-surface border border-border/80 px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium truncate max-w-[120px]"
                  title={p.name}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.color || "#6366F1" }}
                  />
                  <span className="truncate">{p.name}</span>
                </span>
              ))}
              {member.projects.length > 2 && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  +{member.projects.length - 2} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="fixed inset-0" onClick={() => setIsDeleteConfirmOpen(false)} />
          <div className="relative w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-destructive">
              <Trash2 className="h-5 w-5" />
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
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-surface text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
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
    </>
  );
}
