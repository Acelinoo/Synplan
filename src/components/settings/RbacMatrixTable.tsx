"use client";

import * as React from "react";
import { Shield, Check, X } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

interface PermissionRow {
  permission: string;
  description: string;
  owner: boolean;
  admin: boolean;
  member: boolean;
  viewer: boolean;
}

const rbacMatrix: PermissionRow[] = [
  { permission: "Create & Delete Projects", description: "Initialize new projects and configure milestones", owner: true, admin: true, member: false, viewer: false },
  { permission: "Edit & Move Tasks", description: "Update task status, assignees, checklists, and due dates", owner: true, admin: true, member: true, viewer: false },
  { permission: "Invite & Manage Squad", description: "Send workspace invitations and assign roles", owner: true, admin: true, member: false, viewer: false },
  { permission: "View Analytics & Export", description: "Access sprint velocity charts and download reports", owner: true, admin: true, member: true, viewer: true },
  { permission: "Workspace Security & Billing", description: "Access audit telemetry and billing tier controls", owner: true, admin: false, member: false, viewer: false },
];

export function RbacMatrixTable() {
  return (
    <SpotlightCard className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <Shield className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-foreground">Role-Based Access Control (RBAC)</h3>
            <p className="text-xs text-muted-foreground">Permission matrix for Owner, Admin, Member, and Viewer</p>
          </div>
        </div>
        <span className="rounded-full bg-card border border-border px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          RBAC v2.4 Active
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
              <th className="py-2.5 pr-4 font-bold">Permission Scope</th>
              <th className="py-2.5 px-3 text-center font-bold text-primary">Owner</th>
              <th className="py-2.5 px-3 text-center font-bold text-status-review">Admin</th>
              <th className="py-2.5 px-3 text-center font-bold text-status-progress">Member</th>
              <th className="py-2.5 px-3 text-center font-bold text-muted-foreground">Viewer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rbacMatrix.map((row) => (
              <tr key={row.permission} className="hover:bg-surface/40 transition-colors">
                <td className="py-3 pr-4">
                  <p className="font-bold text-foreground">{row.permission}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{row.description}</p>
                </td>
                <td className="py-3 px-3 text-center">
                  {row.owner ? <Check className="h-4 w-4 text-primary mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                </td>
                <td className="py-3 px-3 text-center">
                  {row.admin ? <Check className="h-4 w-4 text-status-review mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                </td>
                <td className="py-3 px-3 text-center">
                  {row.member ? <Check className="h-4 w-4 text-status-progress mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                </td>
                <td className="py-3 px-3 text-center">
                  {row.viewer ? <Check className="h-4 w-4 text-muted-foreground mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SpotlightCard>
  );
}
