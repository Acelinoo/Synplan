"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  CheckSquare,
  FolderKanban,
  Users2,
  Info,
  Clock,
  ExternalLink,
  Filter,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { useNotificationStore, useWorkspaceStore, useUiStore } from "@/store";
import { useRealtimeWorkspace } from "@/hooks/useRealtimeWorkspace";
import { apiClient } from "@/lib/apiClient";
import { NotificationItem, NotificationType } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const router = useRouter();
  const { activeWorkspace } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const {
    notifications,
    unreadCount,
    isLoading,
    filter,
    setFilter,
    setNotifications,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    setLoading,
  } = useNotificationStore();

  const { onEvent } = useRealtimeWorkspace();

  // Load notifications from API
  const fetchNotifications = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getNotifications({ filter });
      if (res.success && Array.isArray(res.data)) {
        setNotifications(res.data);
      }
    } catch (err) {
      console.warn("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [filter, setNotifications, setLoading]);

  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime Subscriptions
  React.useEffect(() => {
    const unsubCreated = onEvent("NOTIFICATION_CREATED", (event) => {
      const newNotif = event.payload;
      addNotification(newNotif);
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

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    markAsRead(id);
    try {
      await apiClient.markNotificationsAsRead({ id });
    } catch (err) {
      console.warn("Error marking notification as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    markAllAsRead();
    try {
      await apiClient.markNotificationsAsRead({ markAll: true });
      addToast({
        title: "All Caught Up",
        description: "All notifications marked as read.",
        variant: "success",
      });
    } catch (err) {
      console.warn("Error marking all read:", err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const filteredNotifications = React.useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.read);
    if (filter === "read") return notifications.filter((n) => n.read);
    return notifications;
  }, [notifications, filter]);

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case "TASK_ASSIGNED":
      case "TASK_STATUS_CHANGED":
      case "TASK_UPDATED":
      case "TASK_MENTIONED":
      case "TASK_COMMENTED":
        return <CheckSquare className="h-4 w-4 text-emerald-500" />;
      case "PROJECT_MEMBER_ADDED":
      case "PROJECT_CREATED":
      case "PROJECT_UPDATED":
        return <FolderKanban className="h-4 w-4 text-primary" />;
      case "TEAM_MEMBER_ADDED":
      case "TEAM_MEMBER_REMOVED":
        return <Users2 className="h-4 w-4 text-amber-500" />;
      default:
        return <Info className="h-4 w-4 text-sky-400" />;
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "Recent";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Notifications
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Stay updated with tasks assigned to you, project invitations, and squad activities.
              </p>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-9 gap-1.5 text-xs font-medium"
            >
              <CheckCheck className="h-4 w-4 text-primary" />
              Mark all as read ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-1.5 rounded-lg bg-surface/50 p-1 border border-border/40">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === "unread"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            Unread ({unreadCount})
          </button>
          <button
            onClick={() => setFilter("read")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === "read"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            Read ({notifications.filter((n) => n.read).length})
          </button>
        </div>
      </div>

      {/* Notifications List / Skeleton / Empty States */}
      <div className="space-y-2.5">
        {isLoading ? (
          // Skeleton Loading
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-xl border border-border/50 bg-card p-4 animate-pulse"
              >
                <div className="h-9 w-9 rounded-xl bg-muted/60" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-muted/60" />
                  <div className="h-3 w-2/3 rounded bg-muted/40" />
                </div>
                <div className="h-3 w-16 rounded bg-muted/40" />
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          // Empty State
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground mb-3">
              <CheckCircle2 className="h-7 w-7 text-emerald-500/80" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              No notifications yet
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              You&apos;re all caught up! Direct assignments, squad invites, and status updates will appear here in realtime.
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={cn(
                "group relative flex items-start gap-4 rounded-xl border p-4 transition-all duration-200 cursor-pointer",
                notif.read
                  ? "border-border/40 bg-card/60 hover:bg-card hover:border-border text-muted-foreground"
                  : "border-primary/30 bg-primary/5 hover:bg-primary/10 shadow-xs text-foreground"
              )}
            >
              {/* Type Icon */}
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
                  notif.read
                    ? "bg-surface border-border text-muted-foreground"
                    : "bg-surface border-primary/40 text-primary shadow-xs"
                )}
              >
                {getNotificationIcon(notif.type)}
              </div>

              {/* Main Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4
                    className={cn(
                      "text-xs sm:text-sm font-semibold tracking-tight",
                      notif.read ? "text-foreground/80" : "text-foreground"
                    )}
                  >
                    {notif.title}
                  </h4>
                  {!notif.read && (
                    <span className="flex h-2 w-2 rounded-full bg-primary ring-2 ring-primary/20" />
                  )}
                </div>

                <p
                  className={cn(
                    "mt-1 text-xs leading-relaxed",
                    notif.read ? "text-muted-foreground" : "text-foreground/90"
                  )}
                >
                  {notif.description}
                </p>

                {/* Footer metadata */}
                <div className="mt-2.5 flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(notif.createdAt)}
                  </span>
                  {notif.link && (
                    <span className="flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" />
                      View Entity
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                {!notif.read && (
                  <button
                    onClick={(e) => handleMarkAsRead(notif.id, e)}
                    className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-primary transition-colors border border-transparent hover:border-border"
                    title="Mark as read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Mark read</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
