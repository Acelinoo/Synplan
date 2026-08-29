"use client";

import * as React from "react";
import { Building2, Globe, Save, Check } from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { apiClient } from "@/lib/apiClient";

export function WorkspaceProfileForm() {
  const { activeWorkspace, setActiveWorkspace } = useWorkspaceStore();
  const { addToast } = useUiStore();

  const [name, setName] = React.useState(activeWorkspace?.name || "Engineering Core");
  const [slug, setSlug] = React.useState(activeWorkspace?.slug || "engineering-core");

  React.useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name || "Engineering Core");
      setSlug(activeWorkspace.slug || "engineering-core");
    }
  }, [activeWorkspace]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (activeWorkspace) {
      setActiveWorkspace({
        ...activeWorkspace,
        name: name.trim(),
        slug: slug.trim(),
        updatedAt: new Date().toISOString(),
      });
    }

    try {
      await apiClient.updateWorkspaceSettings({
        name: name.trim(),
        slug: slug.trim(),
      });
    } catch (err) {
      console.warn("API settings update:", err);
    }

    addToast({
      title: "Workspace Saved",
      description: `Workspace profile updated to "${name}".`,
      variant: "success",
    });
  };

  return (
    <SpotlightCard className="space-y-5">
      <div className="flex items-center gap-2.5 border-b border-border pb-3">
        <Building2 className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-bold text-foreground">Workspace Profile</h3>
          <p className="text-xs text-muted-foreground">General workspace identity and unique slug</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Workspace Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Workspace Slug URL</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                app.synplan.dev/
              </span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-36 pr-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <MagnetButton type="submit" size="sm" className="gap-1.5 text-xs font-semibold">
            <Save className="h-3.5 w-3.5" />
            <span>Save Profile</span>
          </MagnetButton>
        </div>
      </form>
    </SpotlightCard>
  );
}
