"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
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
  Search,
} from "lucide-react";
import { useUiStore, useWorkspaceStore, useNotificationStore } from "@/store";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { usePresence } from "@/hooks/usePresence";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { apiClient } from "@/lib/apiClient";
import { NotificationItem, NotificationType } from "@/types";
import { cn } from "@/lib/utils";
import { RealtimeStatusBadge } from "@/components/realtime/RealtimeStatusBadge";
import { AiAssistantTrigger } from "@/components/ai/AiAssistantTrigger";

const routeNames: Record<string, string> = {
  "/": "Dashboard Overview",
  "/my-work": "My Work",
  "/projects": "Projects",
  "/tasks": "Tasks",
  "/activity": "Activity Audit",
  "/calendar": "Calendar",
  "/team": "Team & Workload",
  "/reports": "Reports & Analytics",
  "/settings": "Workspace Settings",
  "/notifications": "Notifications",
};

export function TopHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    activeWorkspace,
    setActiveWorkspace,
    setWorkspaces,
    setWorkspaceValidated,
    workspaces,
    setCurrentUser: setStoreCurrentUser,
  } = useWorkspaceStore();
  const { theme, setTheme, toggleSidebar, addToast, setCommandPaletteOpen } = useUiStore();
  const {
    notifications,
    unreadCount,
    setNotifications,
    addNotification,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  const { onEvent, onReconnect } = useRealtime();
  const { onlineUsers } = usePresence();

  const [isThemeMenuOpen, setIsThemeMenuOpen] = React.useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
  const [isNotifMenuOpen, setIsNotifMenuOpen] = React.useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null>(null);

  React.useEffect(() => {
    async function loadUserSession() {
      try {
        const res = await apiClient.getSession();
        if (res.success && res.data?.authenticated && res.data.user) {
          setCurrentUser(res.data.user);
          setStoreCurrentUser(res.data.user);

          const userWorkspaces = Array.isArray(res.data.workspaces) ? res.data.workspaces : [];
          setWorkspaces(userWorkspaces);

          if (userWorkspaces.length > 0) {
            const currentActive = useWorkspaceStore.getState().activeWorkspace;
            const validWorkspace = currentActive && userWorkspaces.find((w: any) => w.id === currentActive.id);

            if (validWorkspace) {
              setActiveWorkspace(validWorkspace);
            } else {
              setActiveWorkspace(userWorkspaces[0]);
            }
          } else {
            setActiveWorkspace(null as any);
          }
        } else {
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            const hadCookie = document.cookie.includes("synplan_session_token");
            try {
              document.cookie = "synplan_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
              localStorage.removeItem("synplan_active_ws");
              localStorage.removeItem("synplan_active_workspace");
            } catch (e) {}
            if (hadCookie) {
              router.push("/login?error=session_expired");
            } else {
              router.push("/login");
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load user session in TopHeader:", err);
      } finally {
        setWorkspaceValidated(true);
      }
    }
    loadUserSession();
  }, [setActiveWorkspace, setWorkspaces, setWorkspaceValidated, setStoreCurrentUser, router]);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("synplan_theme") as "dark" | "light" | "system" | null;
      if (stored && (stored === "dark" || stored === "light" || stored === "system")) {
        setTheme(stored);
      }
    } catch (e) {}
  }, [setTheme]);

  const loadNotifs = React.useCallback(async () => {
    try {
      const res = await apiClient.getNotifications();
      if (res.success && Array.isArray(res.data)) {
        setNotifications(res.data);
      }
    } catch (err) {
      console.warn("Failed to load notifications from API:", err);
    }
  }, [setNotifications]);

  React.useEffect(() => {
    loadNotifs();
  }, [loadNotifs]);

  React.useEffect(() => {
    const unsub = onReconnect(() => {
      apiClient.invalidate("/api/notifications");
      loadNotifs();
    });
    return unsub;
  }, [onReconnect, loadNotifs]);

  React.useEffect(() => {
    const unsubCreated = onEvent("NOTIFICATION_CREATED", (event) => {
      if (currentUser?.id && event.payload?.userId && event.payload.userId !== currentUser.id) {
        return;
      }
      addNotification(event.payload);
    });

    const unsubRead = onEvent("NOTIFICATION_READ", (event) => {
      if (currentUser?.id && event.payload?.userId && event.payload.userId !== currentUser.id) {
        return;
      }
      markAsRead(event.payload.id);
    });

    const unsubReadAll = onEvent("NOTIFICATIONS_READ_ALL", (event) => {
      if (currentUser?.id && event.payload?.userId && event.payload.userId !== currentUser.id) {
        return;
      }
      markAllAsRead();
    });

    return () => {
      unsubCreated();
      unsubRead();
      unsubReadAll();
    };
  }, [onEvent, addNotification, markAsRead, markAllAsRead, currentUser]);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsThemeMenuOpen(false);
        setIsProfileMenuOpen(false);
        setIsNotifMenuOpen(false);
        setIsSignOutConfirmOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-4 sm:px-6 backdrop-blur-xs transition-colors select-none">
      {/* Left: Mobile Toggle, Breadcrumb Context */}
      <div className="flex items-center gap-3 text-xs">
        <IconButton
          variant="outline"
          size="icon-sm"
          onClick={toggleSidebar}
          aria-label="Toggle Navigation Sidebar"
          className="md:hidden"
        >
          <Menu className="h-4 w-4" />
        </IconButton>

        <div className="flex items-center gap-2">
          {activeWorkspace && (
            <span className="font-semibold text-foreground text-xs sm:text-sm tracking-tight flex items-center gap-1.5">
              <span className="text-muted-foreground font-normal hidden sm:inline">
                {activeWorkspace.name}
              </span>
              <span className="text-muted-foreground/50 hidden sm:inline">/</span>
              <span>{currentPageTitle}</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: Actions, Command Palette, Live Status, Theme, Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Active Presence Squad Avatars */}
        {onlineUsers.length > 0 && (
          <div
            className="hidden lg:flex items-center -space-x-1.5 overflow-hidden mr-1"
            aria-label="Active team members"
          >
            {onlineUsers.slice(0, 4).map((u) => (
              <Avatar
                key={u.userId}
                src={u.avatarUrl}
                name={u.name}
                size="sm"
                presence="online"
                className="hover:z-10 hover:scale-105 transition-transform ring-2 ring-card"
              />
            ))}
            {onlineUsers.length > 4 && (
              <div className="flex h-7 w-7 rounded-full ring-2 ring-card bg-surface-muted text-muted-foreground text-[10px] font-mono font-bold items-center justify-center">
                +{onlineUsers.length - 4}
              </div>
            )}
          </div>
        )}

        {/* Realtime Connection Status Dot */}
        <RealtimeStatusBadge className="hidden sm:inline-flex mr-0.5" />

        {/* Command Palette Trigger */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/60 hover:bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs"
          aria-label="Open Command Menu"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-[11px]">Search & Commands...</span>
          <kbd className="hidden sm:inline-flex items-center rounded border border-border/80 bg-card px-1 py-0.2 font-mono text-[9px] text-muted-foreground">
            Ctrl K
          </kbd>
        </button>

        {/* AI Assistant Trigger Button */}
        <AiAssistantTrigger variant="header" />

        {/* Live Notification Popover */}
        <div className="relative">
          <button
            onClick={() => setIsNotifMenuOpen(!isNotifMenuOpen)}
            className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold font-mono text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {isNotifMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsNotifMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 bg-surface-muted/50">
                  <div className="flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="rounded-sm bg-primary/10 px-1.5 py-0.2 text-[10px] font-mono font-bold text-primary">
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

                <div className="max-h-72 overflow-y-auto divide-y divide-border/60">
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
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-surface-muted border border-border">
                          {getNotifIcon(notif.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate font-semibold text-foreground text-xs">
                              {notif.title}
                            </p>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              {notif.createdAt
                                ? new Date(notif.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Recent"}
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

                <div className="border-t border-border/70 p-2 bg-surface-muted/30">
                  <button
                    onClick={() => {
                      setIsNotifMenuOpen(false);
                      router.push("/notifications");
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                  >
                    <span>View all notifications</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Theme Switcher */}
        <div className="relative">
          <button
            onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : theme === "light" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Laptop className="h-4 w-4" />
            )}
          </button>

          {isThemeMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsThemeMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-10 z-50 w-36 rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
                <button
                  onClick={() => handleThemeChange("light")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs transition-colors cursor-pointer",
                    theme === "light" ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted/70"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Sun className="h-3.5 w-3.5" />
                    Light
                  </span>
                  {theme === "light" && <Check className="h-3.5 w-3.5" />}
                </button>

                <button
                  onClick={() => handleThemeChange("dark")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs transition-colors cursor-pointer",
                    theme === "dark" ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted/70"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Moon className="h-3.5 w-3.5" />
                    Dark
                  </span>
                  {theme === "dark" && <Check className="h-3.5 w-3.5" />}
                </button>

                <button
                  onClick={() => handleThemeChange("system")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs transition-colors cursor-pointer",
                    theme === "system" ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted/70"
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

        {/* User Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            aria-expanded={isProfileMenuOpen}
            aria-label="User profile menu"
            className="flex items-center rounded-full transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-ring"
            title="User Profile"
          >
            <Avatar
              src={currentUser?.avatarUrl}
              name={currentUser?.name || "User"}
              size="sm"
            />
          </button>

          {isProfileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsProfileMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-10 z-50 w-52 rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
                <div className="border-b border-border/80 px-2 py-1.5">
                  <p className="font-semibold text-xs text-foreground truncate">
                    {currentUser?.name || "Synplan User"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {currentUser?.email || "user@synplan.dev"}
                  </p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      router.push("/settings");
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors text-left cursor-pointer"
                  >
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>My Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      router.push("/settings");
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors text-left cursor-pointer"
                  >
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Workspace Settings</span>
                  </button>
                </div>
                <div className="my-1 h-px bg-border/80" />
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    setIsSignOutConfirmOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors text-left cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sign Out Confirmation Dialog */}
      <Dialog
        open={isSignOutConfirmOpen}
        onOpenChange={setIsSignOutConfirmOpen}
        title="Sign Out"
        description="Are you sure you want to sign out of your Synplan session?"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSignOutConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted-foreground">
          You will need to sign back in with your credentials to access your workspace projects and tasks.
        </p>
      </Dialog>
    </header>
  );
}
