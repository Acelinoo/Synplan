"use client";

import * as React from "react";
import { Mail, Shield, CheckSquare, MoreVertical, Trash2, UserCog, Check } from "lucide-react";
import { WorkspaceMember, MemberRole } from "@/types";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

interface MemberCardProps {
  member: WorkspaceMember;
  onRoleChange?: (memberId: string, newRole: MemberRole) => void;
  onRemove?: (memberId: string) => void;
}

const roleBadgeStyles: Record<MemberRole, { label: string; bg: string }> = {
  owner: { label: "Owner", bg: "bg-primary/10 text-primary border-primary/30" },
  admin: { label: "Admin", bg: "bg-status-review/10 text-status-review border-status-review/30" },
  member: { label: "Member", bg: "bg-status-progress/10 text-status-progress border-status-progress/30" },
  viewer: { label: "Viewer", bg: "bg-muted text-muted-foreground border-border" },
};

export function MemberCard({ member, onRoleChange, onRemove }: MemberCardProps) {
  const { can, isAdmin } = usePermissions();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  const roleStyle = roleBadgeStyles[member.role] || roleBadgeStyles.member;
  const isOwner = member.role === "owner";

  // Color according to workload score
  const getWorkloadColor = (score: number) => {
    if (score > 85) return "bg-status-blocked";
    if (score > 60) return "bg-status-review";
    return "bg-status-done";
  };

  const handleRoleSelect = (role: MemberRole) => {
    setIsMenuOpen(false);
    onRoleChange?.(member.id, role);
  };

  return (
    <>
      <SpotlightCard className="flex flex-col justify-between h-full group hover:border-primary/40 transition-all">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary font-mono ring-1 ring-border shadow-sm">
                {member.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-xs font-bold text-foreground">
                  {member.user.name}
                </h3>
                <p className="truncate text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{member.user.email}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span
                className={cn(
                  "rounded border px-2 py-0.5 text-[9px] font-mono uppercase font-bold",
                  roleStyle.bg
                )}
              >
                {roleStyle.label}
              </span>

              {/* Action Menu Trigger - only visible if user has role update or member removal permissions */}
              {(can("members.update_role") || can("members.remove")) && !isOwner && (
                <div className="relative">
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Member options"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>

                  {isMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-6 z-50 w-44 rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
                        {can("members.update_role") && (
                          <>
                            <div className="px-2 py-1 text-[10px] font-mono text-muted-foreground uppercase font-bold">
                              Change Role
                            </div>
                            {(isAdmin ? (["member", "viewer"] as MemberRole[]) : (["admin", "member", "viewer"] as MemberRole[])).map((r) => (
                              <button
                                key={r}
                                disabled={isOwner || (isAdmin && member.role === "admin")}
                                onClick={() => handleRoleSelect(r)}
                                className={cn(
                                  "flex w-full items-center justify-between rounded-sm px-2 py-1 text-xs capitalize transition-colors text-left",
                                  member.role === r
                                    ? "bg-primary/10 text-primary font-semibold"
                                    : "text-foreground hover:bg-muted",
                                  (isOwner || (isAdmin && member.role === "admin")) && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                <span>{r}</span>
                                {member.role === r && <Check className="h-3 w-3" />}
                              </button>
                            ))}
                          </>
                        )}

                        {can("members.remove") && (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <button
                              disabled={isOwner || (isAdmin && member.role === "admin")}
                              onClick={() => {
                                setIsMenuOpen(false);
                                setIsDeleteConfirmOpen(true);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-left transition-colors",
                                (isOwner || (isAdmin && member.role === "admin"))
                                  ? "text-muted-foreground/50 cursor-not-allowed"
                                  : "text-destructive hover:bg-destructive/10"
                              )}
                              title={isOwner ? "Owner cannot be removed" : (isAdmin && member.role === "admin") ? "Admins cannot remove other admins" : "Remove from workspace"}
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
        </div>

        {/* Workload Progress & Assigned Tasks */}
        <div className="mt-4 pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Workload Capacity</span>
            <span className="font-mono font-bold text-foreground">{member.workloadScore}%</span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-500", getWorkloadColor(member.workloadScore))}
              style={{ width: `${member.workloadScore}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1 font-mono">
              <CheckSquare className="h-3 w-3" />
              {member.assignedTasksCount} Active Tasks
            </span>
            <span className="text-[10px] font-mono">
              {member.workloadScore > 85 ? "Overloaded" : member.workloadScore > 60 ? "Balanced" : "Available"}
            </span>
          </div>
        </div>
      </SpotlightCard>

      {/* Remove Member Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div
            className="fixed inset-0"
            onClick={() => setIsDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-sm font-bold text-foreground">Remove Team Member</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Are you sure you want to remove <span className="font-semibold text-foreground">&quot;{member.user.name}&quot;</span> from this workspace?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  onRemove?.(member.id);
                }}
                className="h-8 text-xs font-semibold"
              >
                Remove Member
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
