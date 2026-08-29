"use client";

import * as React from "react";
import { Settings, Shield, Palette, Building2, Terminal } from "lucide-react";
import { WorkspaceProfileForm } from "@/components/settings/WorkspaceProfileForm";
import { ThemeSettingsPanel } from "@/components/settings/ThemeSettingsPanel";
import { RbacMatrixTable } from "@/components/settings/RbacMatrixTable";
import { AuditLogStream } from "@/components/settings/AuditLogStream";
import { AnimatedGrid } from "@/components/ui/animated-grid";

export default function SettingsPage() {
  return (
    <div className="relative flex flex-col gap-6 max-w-5xl">
      <AnimatedGrid />

      {/* Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Workspace Settings & Security
          </h1>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-bold text-primary">
            Enterprise Grade
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Manage workspace profile identity, user interface themes, RBAC permission matrices, and security audit logs.
        </p>
      </div>

      {/* 1. General Profile */}
      <div id="profile">
        <WorkspaceProfileForm />
      </div>

      {/* 2. Theme Appearance */}
      <div id="theme">
        <ThemeSettingsPanel />
      </div>

      {/* 3. RBAC Matrix & Security */}
      <div id="security" className="space-y-6">
        <RbacMatrixTable />
        <AuditLogStream />
      </div>
    </div>
  );
}
