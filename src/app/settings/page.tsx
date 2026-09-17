"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Building2,
  User as UserIcon,
  Bell,
  Shield,
  Blocks,
  CreditCard,
  Palette,
  Settings as SettingsIcon,
} from "lucide-react";
import { useWorkspaceStore } from "@/store";
import { cn } from "@/lib/utils";
import { GeneralSettingsSection } from "@/components/settings/GeneralSettingsSection";
import { ProfileSettingsSection } from "@/components/settings/ProfileSettingsSection";
import { NotificationSettingsSection } from "@/components/settings/NotificationSettingsSection";
import { SecuritySettingsSection } from "@/components/settings/SecuritySettingsSection";
import { IntegrationsSection } from "@/components/settings/IntegrationsSection";
import { BillingSection } from "@/components/settings/BillingSection";
import { ThemeSettingsPanel } from "@/components/settings/ThemeSettingsPanel";

type SettingsTab =
  | "general"
  | "profile"
  | "notifications"
  | "security"
  | "integrations"
  | "billing"
  | "appearance";

interface TabDefinition {
  id: SettingsTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SETTINGS_TABS: TabDefinition[] = [
  {
    id: "general",
    label: "General",
    description: "Workspace profile, identity, slug & tenant details",
    icon: Building2,
  },
  {
    id: "profile",
    label: "Profile",
    description: "Personal display name, avatar, and system role",
    icon: UserIcon,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Realtime delivery channels and alert dispatching",
    icon: Bell,
  },
  {
    id: "security",
    label: "Security",
    description: "Single sign-on, sessions, RBAC, and backups",
    icon: Shield,
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Connected identity providers and ecosystem bridges",
    icon: Blocks,
  },
  {
    id: "billing",
    label: "Billing",
    description: "Workspace edition, plan details & entitlements",
    icon: CreditCard,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Interface theme palettes and visual mode",
    icon: Palette,
  },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspace } = useWorkspaceStore();

  const tabParam = (searchParams.get("tab") || "general").toLowerCase() as SettingsTab;
  const activeTab: SettingsTab = SETTINGS_TABS.some((t) => t.id === tabParam)
    ? tabParam
    : "general";

  const handleTabChange = (tabId: SettingsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Workspace Settings & Configuration
              </h1>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-bold text-primary">
                Authoritative
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure workspace tenant properties, member profiles, security telemetry, and platform entitlements.
            </p>
          </div>

          {activeWorkspace && (
            <div className="flex items-center gap-2 self-start sm:self-auto rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">Workspace:</span>
              <span className="font-semibold text-foreground">{activeWorkspace.name}</span>
            </div>
          )}
        </div>

        {/* Mobile Horizontal Tab Navigation */}
        <div className="flex sm:hidden overflow-x-auto gap-1.5 pt-4 no-scrollbar border-t border-border/60 mt-4">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Sidebar + Content */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
        {/* Desktop Sidebar Navigation */}
        <nav className="hidden sm:flex sm:col-span-4 lg:col-span-3 flex-col gap-1 rounded-lg border border-border bg-card p-2 sticky top-20 shadow-2xs">
          <span className="px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            Configuration Surfaces
          </span>
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "group flex items-start gap-3 px-3 py-2.5 rounded-md text-left transition-all cursor-pointer",
                  isSelected
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface/70"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 mt-0.5 transition-colors",
                    isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <div className="space-y-0.5 min-w-0">
                  <div
                    className={cn(
                      "text-xs font-semibold leading-none",
                      isSelected ? "text-primary" : "text-foreground"
                    )}
                  >
                    {tab.label}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight line-clamp-1">
                    {tab.description}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Content Pane */}
        <main className="sm:col-span-8 lg:col-span-9 min-w-0">
          {activeTab === "general" && <GeneralSettingsSection />}
          {activeTab === "profile" && <ProfileSettingsSection />}
          {activeTab === "notifications" && <NotificationSettingsSection />}
          {activeTab === "security" && <SecuritySettingsSection />}
          {activeTab === "integrations" && <IntegrationsSection />}
          {activeTab === "billing" && <BillingSection />}
          {activeTab === "appearance" && <ThemeSettingsPanel />}
        </main>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-8 text-xs text-muted-foreground animate-pulse">
          Loading workspace configuration...
        </div>
      }
    >
      <SettingsContent />
    </React.Suspense>
  );
}
