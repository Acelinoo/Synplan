"use client";

import * as React from "react";
import { Building2, Globe, Save, Copy, Check, ShieldAlert, Image, Calendar, Users } from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import { usePermissions } from "@/hooks/usePermissions";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";

export function GeneralSettingsSection() {
  const { activeWorkspace, setActiveWorkspace } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const { can, normalizedRole } = usePermissions();

  const canEdit = can("workspace.update");

  const [name, setName] = React.useState(activeWorkspace?.name || "");
  const [slug, setSlug] = React.useState(activeWorkspace?.slug || "");
  const [logoUrl, setLogoUrl] = React.useState(activeWorkspace?.logoUrl || "");
  const [copiedId, setCopiedId] = React.useState(false);

  const [initialData, setInitialData] = React.useState({
    name: activeWorkspace?.name || "",
    slug: activeWorkspace?.slug || "",
    logoUrl: activeWorkspace?.logoUrl || "",
  });

  const [workspaceMeta, setWorkspaceMeta] = React.useState<{
    owner?: { name: string; email: string };
    createdAt?: string;
    counts?: { members: number; projects: number; tasks: number };
  } | null>(null);

  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"clean" | "dirty" | "saving" | "saved" | "error">("clean");

  // Fetch fresh workspace settings from server
  React.useEffect(() => {
    if (!activeWorkspace?.id) return;
    let isMounted = true;

    async function loadFreshSettings() {
      setIsLoading(true);
      try {
        const res = await apiClient.getWorkspaceSettings(activeWorkspace!.id);
        if (res.success && res.data && isMounted) {
          const ws = res.data;
          setName(ws.name || "");
          setSlug(ws.slug || "");
          setLogoUrl(ws.logoUrl || "");
          setInitialData({
            name: ws.name || "",
            slug: ws.slug || "",
            logoUrl: ws.logoUrl || "",
          });
          setWorkspaceMeta({
            owner: ws.owner,
            createdAt: ws.createdAt,
            counts: ws.counts,
          });
        }
      } catch (err) {
        console.warn("Could not fetch workspace settings:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadFreshSettings();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  // Compute dirty state
  const isDirty =
    name !== initialData.name ||
    slug !== initialData.slug ||
    (logoUrl || "") !== (initialData.logoUrl || "");

  React.useEffect(() => {
    if (saveStatus !== "saving" && saveStatus !== "saved") {
      setSaveStatus(isDirty ? "dirty" : "clean");
    }
  }, [isDirty, saveStatus]);

  const handleCopyId = () => {
    if (!activeWorkspace?.id) return;
    navigator.clipboard.writeText(activeWorkspace.id);
    setCopiedId(true);
    addToast({
      title: "Workspace ID Copied",
      description: "Copied unique workspace CUID to clipboard.",
      variant: "info",
    });
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      addToast({
        title: "Permission Denied",
        description: "Only Workspace Owners and Admins can modify workspace configuration.",
        variant: "danger",
      });
      return;
    }

    if (!name.trim()) {
      addToast({
        title: "Validation Error",
        description: "Workspace name cannot be empty.",
        variant: "danger",
      });
      return;
    }

    const cleanSlug = slug.trim().toLowerCase();
    if (cleanSlug && !/^[a-z0-9-]+$/.test(cleanSlug)) {
      addToast({
        title: "Validation Error",
        description: "Workspace slug must only contain lowercase letters, numbers, and hyphens.",
        variant: "danger",
      });
      return;
    }

    setIsSaving(true);
    setSaveStatus("saving");

    try {
      const res = await apiClient.updateWorkspaceSettings(
        {
          name: name.trim(),
          slug: cleanSlug || undefined,
          logoUrl: logoUrl.trim() || null,
        },
        activeWorkspace?.id
      );

      if (res.success && res.data) {
        const updated = res.data;
        if (activeWorkspace) {
          setActiveWorkspace({
            ...activeWorkspace,
            name: updated.name,
            slug: updated.slug,
            logoUrl: updated.logoUrl,
          });
        }
        setInitialData({
          name: updated.name,
          slug: updated.slug,
          logoUrl: updated.logoUrl || "",
        });
        setSaveStatus("saved");
        addToast({
          title: "Workspace Saved",
          description: `Workspace profile updated to "${updated.name}".`,
          variant: "success",
        });
      } else {
        throw new Error(res.message || res.error || "Failed to update workspace settings");
      }
    } catch (err: any) {
      setSaveStatus("error");
      addToast({
        title: "Save Failed",
        description: err.message || "Failed to persist workspace changes to server.",
        variant: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View-Only Notice for Member / Viewer */}
      {!canEdit && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">View-Only Configuration</p>
            <p className="text-[11px] opacity-90">
              Your role ({normalizedRole}) has read-only access to workspace settings. Contact an Admin or Owner to apply modifications.
            </p>
          </div>
        </div>
      )}

      {/* Main Settings Card */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">General Workspace Configuration</h2>
              <p className="text-xs text-muted-foreground">Authoritative identity, unique URL routing, and tenant properties</p>
            </div>
          </div>
          {saveStatus === "dirty" && (
            <span className="text-[11px] font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
              Unsaved changes
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-[11px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Workspace Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Workspace Name</span>
              <span className="text-[10px] text-muted-foreground font-normal">Max 100 characters</span>
            </label>
            <input
              type="text"
              required
              disabled={!canEdit || isSaving}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering Core"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            />
          </div>

          {/* Workspace Slug */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Workspace URL Slug</span>
              <span className="text-[10px] text-muted-foreground font-normal">Lowercase alphanumeric & dashes</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs text-muted-foreground font-mono select-none pointer-events-none">
                app.synplan.dev/
              </span>
              <input
                type="text"
                required
                disabled={!canEdit || isSaving}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="engineering-core"
                className="w-full rounded-lg border border-border bg-surface pl-36 pr-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Used for tenant routing and workspace-scoped deep links.
            </p>
          </div>

          {/* Workspace Logo URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Workspace Logo URL</span>
              <span className="text-[10px] text-muted-foreground font-normal">Optional image link</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg border border-border bg-surface flex items-center justify-center shrink-0 overflow-hidden">
                {logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <input
                type="url"
                disabled={!canEdit || isSaving}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              />
            </div>
          </div>

          {/* Form Actions */}
          {canEdit && (
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {isDirty ? "Remember to save your changes." : "All changes saved."}
              </span>
              <Button
                type="submit"
                disabled={!isDirty || isSaving}
                className="text-xs font-semibold gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSaving ? "Saving..." : "Save Changes"}</span>
              </Button>
            </div>
          )}
        </form>
      </div>

      {/* Tenant Identity & Metadata Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Tenant Identifiers & Metadata
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-border/70 bg-surface/40 p-3 space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Workspace ID (CUID)</span>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-foreground truncate text-[11px]">
                {activeWorkspace?.id || "N/A"}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                title="Copy Workspace ID"
              >
                {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface/40 p-3 space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Workspace Owner</span>
            <p className="font-medium text-foreground truncate">
              {workspaceMeta?.owner?.name || "System Administrator"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate font-mono">
              {workspaceMeta?.owner?.email || "owner@synplan.dev"}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface/40 p-3 space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Created Date</span>
            <div className="flex items-center gap-1.5 text-foreground font-mono text-[11px]">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span>
                {workspaceMeta?.createdAt
                  ? new Date(workspaceMeta.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "N/A"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface/40 p-3 space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Active Workload Telemetry</span>
            <div className="flex items-center gap-3 text-[11px] text-foreground font-mono">
              <span>{workspaceMeta?.counts?.members ?? 0} Members</span>
              <span>·</span>
              <span>{workspaceMeta?.counts?.projects ?? 0} Projects</span>
              <span>·</span>
              <span>{workspaceMeta?.counts?.tasks ?? 0} Tasks</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
