"use client";

import * as React from "react";
import { User as UserIcon, Mail, Shield, Save, Check, Image, Calendar, KeyRound } from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";

export function ProfileSettingsSection() {
  const { currentUser, setCurrentUser } = useWorkspaceStore();
  const { addToast } = useUiStore();

  const [name, setName] = React.useState(currentUser?.name || "");
  const [avatarUrl, setAvatarUrl] = React.useState(currentUser?.avatarUrl || "");
  const [email, setEmail] = React.useState(currentUser?.email || "");
  const [role, setRole] = React.useState(currentUser?.role || "MEMBER");
  const [createdAt, setCreatedAt] = React.useState<string | null>(null);

  const [initialData, setInitialData] = React.useState({
    name: currentUser?.name || "",
    avatarUrl: currentUser?.avatarUrl || "",
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"clean" | "dirty" | "saving" | "saved" | "error">("clean");

  // Load fresh user profile
  React.useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const res = await apiClient.getUserProfile();
        if (res.success && res.data && isMounted) {
          const u = res.data;
          setName(u.name || "");
          setAvatarUrl(u.avatarUrl || "");
          setEmail(u.email || "");
          setRole(u.role || "MEMBER");
          setCreatedAt(u.createdAt || null);
          setInitialData({
            name: u.name || "",
            avatarUrl: u.avatarUrl || "",
          });
        }
      } catch (err) {
        console.warn("Failed to load user profile:", err);
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute dirty state
  const isDirty =
    name !== initialData.name ||
    (avatarUrl || "") !== (initialData.avatarUrl || "");

  React.useEffect(() => {
    if (saveStatus !== "saving" && saveStatus !== "saved") {
      setSaveStatus(isDirty ? "dirty" : "clean");
    }
  }, [isDirty, saveStatus]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast({
        title: "Validation Error",
        description: "Full name cannot be empty.",
        variant: "danger",
      });
      return;
    }

    setIsSaving(true);
    setSaveStatus("saving");

    try {
      const res = await apiClient.updateUserProfile({
        name: name.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });

      if (res.success && res.data) {
        const updated = res.data;
        if (currentUser) {
          setCurrentUser({
            ...currentUser,
            name: updated.name,
            avatarUrl: updated.avatarUrl,
          });
        }
        setInitialData({
          name: updated.name,
          avatarUrl: updated.avatarUrl || "",
        });
        setSaveStatus("saved");
        addToast({
          title: "Profile Updated",
          description: "Your user profile changes were saved successfully.",
          variant: "success",
        });
      } else {
        throw new Error(res.message || res.error || "Failed to update profile");
      }
    } catch (err: any) {
      setSaveStatus("error");
      addToast({
        title: "Update Failed",
        description: err.message || "Failed to update profile.",
        variant: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const monogram = (name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Profile Form Card */}
      <div className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <UserIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Personal Profile & Identity</h2>
              <p className="text-xs text-muted-foreground">Manage your authenticated display name, avatar, and system role</p>
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
          {/* Avatar Preview & URL */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-16 w-16 rounded-full border-2 border-border bg-surface flex items-center justify-center shrink-0 overflow-hidden font-bold text-sm text-primary shadow-xs">
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={avatarUrl}
                  alt={name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                monogram
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Avatar Image URL</span>
                <span className="text-[10px] text-muted-foreground font-normal">HTTP / HTTPS direct link</span>
              </label>
              <input
                type="url"
                disabled={isSaving}
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-60 transition-colors"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave empty to display your initials avatar monogram.
              </p>
            </div>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Display Name</span>
              <span className="text-[10px] text-muted-foreground font-normal">Max 100 characters</span>
            </label>
            <input
              type="text"
              required
              disabled={isSaving}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-60 transition-colors"
            />
          </div>

          {/* Email Address (Strictly Read-Only OAuth Identity) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Email Address</label>
              <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="h-2.5 w-2.5" /> Verified via OAuth
              </span>
            </div>
            <div className="relative flex items-center">
              <Mail className="absolute left-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="email"
                readOnly
                disabled
                value={email}
                className="w-full rounded-lg border border-border/70 bg-surface/50 pl-9 pr-3 py-2 text-xs font-mono text-muted-foreground cursor-not-allowed select-all"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Your primary email is managed by your OAuth identity provider (Google / GitHub) and cannot be directly modified here.
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {isDirty ? "Unsaved profile changes." : "Profile information is up to date."}
            </span>
            <Button
              type="submit"
              disabled={!isDirty || isSaving}
              className="text-xs font-semibold gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? "Saving..." : "Save Profile"}</span>
            </Button>
          </div>
        </form>
      </div>

      {/* Account Identity & System Metadata */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          System Identity & Security Context
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-border/70 bg-surface/40 p-3 space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Global User ID</span>
            <p className="font-mono text-foreground text-[11px] truncate select-all">
              {currentUser?.id || "N/A"}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface/40 p-3 space-y-1.5">
            <span className="text-[11px] text-muted-foreground">System Platform Role</span>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                {role}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface/40 p-3 space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Account Created</span>
            <div className="flex items-center gap-1.5 text-foreground font-mono text-[11px]">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span>
                {createdAt
                  ? new Date(createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "Active"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface/40 p-3 space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Authentication Protocol</span>
            <div className="flex items-center gap-1.5 text-foreground font-mono text-[11px]">
              <KeyRound className="h-3 w-3 text-emerald-500" />
              <span>Delegated OAuth 2.0 / OIDC</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
