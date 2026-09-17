"use client";

import * as React from "react";
import { Mail, CheckSquare, MoreVertical, Trash2, Check, Shield, FolderGit2 } from "lucide-react";
import { WorkspaceMember, MemberRole } from "@/types";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

interface MemberTableViewProps {
  members: WorkspaceMember[];
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

export function MemberTableView({
  members,
  onRoleChange,
  onRemove,
  onSelectMember,
}: MemberTableViewProps) {
  const { can, isOwner: isCallerOwner, isAdmin: isCallerAdmin } = usePermissions();
  const [activeMenuMemberId, setActiveMenuMemberId] = React.useState<string | null>(null);
  const [deleteTargetMember, setDeleteTargetMember] = React.useState<WorkspaceMember | null>(null);

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

  const availableRoles: MemberRole[] = isCallerOwner
    ? ["admin", "member", "viewer"]
    : ["member", "viewer"];

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/40 text-muted-foreground uppercase text-[10px] font-bold tracking-wider select-none">
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3 min-w-[160px]">Workload Capacity</th>
                <th className="py-3 px-3 text-center">Active Tasks</th>
                <th className="py-3 px-3">Projects</th>
                <th className="py-3 px-3">Joined</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {members.map((member) => {
                const roleStyle = roleBadgeStyles[member.role] || roleBadgeStyles.member;
                const isTargetOwner = member.role === "owner";
                const isTargetAdmin = member.role === "admin";
                const workload = member.workloadScore || 0;
                const capacity = getCapacityStatus(workload);

                const canModifyThisMemberRole =
                  can("members.update_role") &&
                  !isTargetOwner &&
                  (!isCallerAdmin || (!isTargetAdmin && !isTargetOwner));

                const canRemoveThisMember =
                  can("members.remove") &&
                  !isTargetOwner &&
                  (!isCallerAdmin || !isTargetAdmin);

                const monogram = (member.user?.name || "U")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <tr
                    key={member.id}
                    onClick={() => onSelectMember?.(member)}
                    className="hover:bg-surface/50 transition-colors cursor-pointer group"
                  >
                    {/* Member Column */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5 min-w-[180px]">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary font-mono ring-1 ring-border overflow-hidden">
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
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {member.user?.name || "Unknown"}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate font-mono">
                            {member.user?.email || "No email"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Role Column */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[9px] font-mono uppercase font-bold tracking-wider inline-block",
                          roleStyle.bg
                        )}
                      >
                        {roleStyle.label}
                      </span>
                    </td>

                    {/* Workload Column */}
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={cn("px-1.5 py-0.2 rounded font-mono font-semibold", capacity.color)}>
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
                    </td>

                    {/* Active Tasks Column */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-foreground">
                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        <span>{member.activeTaskCount ?? member.assignedTasksCount ?? 0}</span>
                      </span>
                    </td>

                    {/* Projects Column */}
                    <td className="py-3 px-3">
                      {member.projects && member.projects.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
                          {member.projects.slice(0, 2).map((p) => (
                            <span
                              key={p.id}
                              className="inline-flex items-center gap-1 rounded bg-surface border border-border/80 px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium truncate max-w-[90px]"
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
                              +{member.projects.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">—</span>
                      )}
                    </td>

                    {/* Joined Date Column */}
                    <td className="py-3 px-3 whitespace-nowrap text-muted-foreground font-mono text-[11px]">
                      {new Date(member.joinedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>

                    {/* Actions Column */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {(canModifyThisMemberRole || canRemoveThisMember) ? (
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuMemberId(activeMenuMemberId === member.id ? null : member.id);
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
                            title="Member options"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>

                          {activeMenuMemberId === member.id && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuMemberId(null);
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
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuMemberId(null);
                                          onRoleChange?.(member.id, r);
                                        }}
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
                                        setActiveMenuMemberId(null);
                                        setDeleteTargetMember(member);
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
                      ) : (
                        <span className="text-[11px] text-muted-foreground select-none">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTargetMember && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="fixed inset-0" onClick={() => setDeleteTargetMember(null)} />
          <div className="relative w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-destructive">
              <Trash2 className="h-5 w-5" />
              <h4 className="text-sm font-bold text-foreground">Remove Squad Member</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to remove <strong>{deleteTargetMember.user?.name}</strong> from this workspace?
              Their active task assignments will be unassigned and workspace project memberships removed.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDeleteTargetMember(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-surface text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = deleteTargetMember.id;
                  setDeleteTargetMember(null);
                  onRemove?.(id);
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
