"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Bell,
  Sun,
  Moon,
  Laptop,
  Check,
  User,
  Shield,
  LogOut,
  Menu,
  CheckCheck,
  CheckSquare,
  FolderKanban,
  Users2,
  Info,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useUiStore, useWorkspaceStore, useNotificationStore } from "@/store";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/apiClient";
import { NotificationItem, NotificationType } from "@/types";
import { cn } from "@/lib/utils";

import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { RealtimeStatusBadge } from "@/components/realtime/RealtimeStatusBadge";
import { AiAssistantTrigger } from "@/components/ai/AiAssistantTrigger";

const routeNames: Record<string, string> = {
  "/": "Dashboard Overview",
  "/projects": "Projects Management",
  "/tasks": "Tasks & Kanban Board",
  "/calendar": "Calendar & Schedules",
  "/team": "Team & Capacity Management",
  "/reports": "Reports & Analytics",
  "/settings": "Workspace Settings",
  "/notifications": "Notifications",
};

export function TopHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspace, setActiveWorkspace, setWorkspaces, setWorkspaceValidated, workspaces } = useWorkspaceStore();
  const { theme, setTheme, toggleSidebar, addToast } = useUiStore();
  const {
    notifications,
    unreadCount,
    setNotifications,
    addNotification,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  const { onEvent } = useRealtime();

  const [isThemeMenuOpen, setIsThemeMenuOpen] = React.useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
  const [isNotifMenuOpen, setIsNotifMenuOpen] = React.useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState<{ id: string; name: string; email: string; avatarUrl: string | null } | null>(null);

  React.useEffect(() => {
    async function loadUserSession() {
      try {
        const res = await apiClient.getSession();
        if (res.success && res.data?.authenticated && res.data.user) {
          setCurrentUser(res.data.user);

          const userWorkspaces = Array.isArray(res.data.workspaces) ? res.data.workspaces : [];
          setWorkspaces(userWorkspaces);

          if (userWorkspaces.length > 0) {
            // Check if existing activeWorkspace from store/localStorage belongs to this authenticated user
            const currentActive = useWorkspaceStore.getState().activeWorkspace;
            const validWorkspace = currentActive && userWorkspaces.find((w: any) => w.id === currentActive.id);

            if (validWorkspace) {
              setActiveWorkspace(validWorkspace);
            } else {
              // Stale or foreign workspace in localStorage: auto-select user's first valid workspace
              setActiveWorkspace(userWorkspaces[0]);
            }
          } else {
            setActiveWorkspace(null as any);
          }
        }
      } catch (err) {
        console.warn("Failed to load user session in TopHeader:", err);
      } finally {
        // Mark workspace as validated so dashboard widgets can start fetching.
        // This must fire on both success and failure so widgets don't stay in loading forever.
        setWorkspaceValidated(true);
      }
    }
    loadUserSession();
  }, [setActiveWorkspace, setWorkspaces, setWorkspaceValidated]);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("synplan_theme") as "dark" | "light" | "system" | null;
      if (stored && (stored === "dark" || stored === "light" || stored === "system")) {
        setTheme(stored);
      }
    } catch (e) {}
  }, [setTheme]);

  // Initial load of notifications
  React.useEffect(() => {
    async function loadNotifs() {
      try {
        const res = await apiClient.getNotifications();
        if (res.success && Array.isArray(res.data)) {
          setNotifications(res.data);
        }
      } catch (err) {
        console.warn("Failed to load notifications from API:", err);
      }
    }
    loadNotifs();
  }, [setNotifications]);

  // Realtime notification sync
  React.useEffect(() => {
    const unsubCreated = onEvent("NOTIFICATION_CREATED", (event) => {
      addNotification(event.payload);
    });

    const unsubRead = onEvent("NOTIFICATION_READ", (event) => {
      markAsRead(event.payload.id);
    });

    const unsubReadAll = onEvent("NOTIFICATIONS_READ_ALL", () => {
      markAllAsRead();
    });

    return () => {
      unsubCreated();
      unsubRead();
      unsubReadAll();
    };
  }, [onEvent, addNotification, markAsRead, markAllAsRead]);

  const currentPageTitle = routeNames[pathname] || "Workspace";

  const handleThemeChange = (newTheme: "dark" | "light" | "system") => {
    setTheme(newTheme);
    setIsThemeMenuOpen(false);

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (newTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    markAsRead(notif.id);
    setIsNotifMenuOpen(false);
    try {
      await apiClient.markNotificationsAsRead({ id: notif.id });
    } catch (err) {
      console.warn("API mark read error:", err);
    }
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    markAllAsRead();
    try {
      await apiClient.markNotificationsAsRead({ markAll: true });
      addToast({
        title: "Notifications Updated",
        description: "All notifications marked as read.",
        variant: "success",
      });
    } catch (err) {
      console.warn("API mark all read error:", err);
    }
  };

  const handleSignOut = async () => {
    setIsProfileMenuOpen(false);
    setIsSignOutConfirmOpen(false);
    try {
      await apiClient.logout();
    } catch (err) {
      console.warn("Logout API warning:", err);
    }
    setActiveWorkspace(null as any);
    setWorkspaces([]);
    addToast({
      title: "Signed Out",
      description: "You have securely signed out of your session.",
      variant: "default",
    });
    window.location.href = "/login";
  };

  const getNotifIcon = (type: NotificationType) => {
    switch (type) {
      case "TASK_ASSIGNED":
      case "TASK_STATUS_CHANGED":
      case "TASK_UPDATED":
      case "TASK_MENTIONED":
      case "TASK_COMMENTED":
        return <CheckSquare className="h-3 w-3 text-emerald-500" />;
      case "PROJECT_MEMBER_ADDED":
      case "PROJECT_CREATED":
      case "PROJECT_UPDATED":
        return <FolderKanban className="h-3 w-3 text-primary" />;
      case "TEAM_MEMBER_ADDED":
      case "TEAM_MEMBER_REMOVED":
        return <Users2 className="h-3 w-3 text-amber-500" />;
      default:
        return <Info className="h-3 w-3 text-sky-400" />;
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 w-full items-center justify-between border-b border-[#183754]/80 bg-[#102A45] dark:bg-[#081420] px-4 sm:px-6 text-white backdrop-blur-md">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3 text-xs sm:text-sm">
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 md:hidden"
          title="Toggle Navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="font-semibold text-white/90 text-sm sm:text-base tracking-tight">
          {currentPageTitle}
        </span>
      </div>

      {/* Right: Actions, Command Palette, Theme, Profile */}
      <div className="flex items-center gap-3">
        {/* Subtle Realtime Connection Dot Indicator */}
        <RealtimeStatusBadge className="hidden sm:inline-flex mr-0.5" />

        {/* Scoped Global Search */}
        <GlobalSearch />

        {/* AI Assistant Button */}
        <AiAssistantTrigger variant="header" />

        {/* Notification Bell Popover */}
        <div className="relative">
          <button
            onClick={() => setIsNotifMenuOpen(!isNotifMenuOpen)}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-amber-400 hover:bg-white/20 transition-colors"
            title="Notifications"
          >
            <Bell className="h-4 w-4 fill-amber-400/20" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-slate-950 ring-2 ring-[#102A45]">
                {unreadCount}
              </span>
            )}
          </button>

          {isNotifMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsNotifMenuOpen(false)}
              />
              <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 bg-surface/40">
                  <div className="flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-mono font-bold text-primary">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-border/50">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={cn(
                          "flex items-start gap-2.5 p-3 text-xs transition-colors cursor-pointer hover:bg-muted/50",
                          !notif.read && "bg-primary/5 font-medium"
                        )}
                      >
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface border border-border">
                          {getNotifIcon(notif.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate font-semibold text-foreground text-xs">
                              {notif.title}
                            </p>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              {notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recent"}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                            {notif.description}
                          </p>
                        </div>
                        {!notif.read && (
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Footer link to full /notifications page */}
                <div className="border-t border-border/60 p-2 bg-surface/30">
                  <button
                    onClick={() => {
                      setIsNotifMenuOpen(false);
                      router.push("/notifications");
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                  >
                    <span>View all notifications</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Theme Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/20 transition-colors"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <Moon className="h-4 w-4 text-sky-300" />
            ) : theme === "light" ? (
              <Sun className="h-4 w-4 text-amber-300" />
            ) : (
              <Laptop className="h-4 w-4 text-white/80" />
            )}
          </button>

          {isThemeMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsThemeMenuOpen(false)}
              />
              <div className="absolute right-0 top-11 z-50 w-36 rounded-xl border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
                <button
                  onClick={() => handleThemeChange("dark")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors",
                    theme === "dark"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Moon className="h-3.5 w-3.5" />
                    Dark
                  </span>
                  {theme === "dark" && <Check className="h-3.5 w-3.5" />}
                </button>

                <button
                  onClick={() => handleThemeChange("light")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors",
                    theme === "light"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Sun className="h-3.5 w-3.5" />
                    Light
                  </span>
                  {theme === "light" && <Check className="h-3.5 w-3.5" />}
                </button>

                <button
                  onClick={() => handleThemeChange("system")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors",
                    theme === "system"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Laptop className="h-3.5 w-3.5" />
                    System
                  </span>
                  {theme === "system" && <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            </>
          )}
        </div>

        {/* User Profile Avatar Menu */}
        <div className="relative">
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 border border-white/30 text-white font-bold text-xs hover:ring-2 hover:ring-white/40 transition-all cursor-pointer overflow-hidden"
            title="User Profile"
          >
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={currentUser.name} className="h-full w-full object-cover" />
            ) : (
              currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "A"
            )}
          </button>

          {isProfileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsProfileMenuOpen(false)}
              />
              <div className="absolute right-0 top-10 z-50 w-52 rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
                <div className="border-b border-border px-2 py-1.5">
                  <p className="font-semibold text-xs text-foreground truncate">
                    {currentUser?.name || "Acelino"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {currentUser?.email || "acelino@synplan.dev"}
                  </p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      router.push("/settings");
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted transition-colors text-left"
                  >
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>My Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      router.push("/settings");
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted transition-colors text-left"
                  >
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Workspace Security</span>
                  </button>
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    setIsSignOutConfirmOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors text-left"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      {isSignOutConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div
            className="fixed inset-0"
            onClick={() => setIsSignOutConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-sm font-bold text-foreground">Sign Out</h3>
            <p className="text-xs text-muted-foreground mt-1.5">
              Are you sure you want to sign out of your Synplan session?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSignOutConfirmOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleSignOut}
                className="h-8 text-xs font-semibold"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
