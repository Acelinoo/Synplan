import { create } from "zustand";
import { NotificationItem } from "@/types";

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  filter: "all" | "unread" | "read";

  // Actions
  setNotifications: (notifications: NotificationItem[]) => void;
  addNotification: (notification: NotificationItem) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  setFilter: (filter: "all" | "unread" | "read") => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  filter: "all",

  setNotifications: (notifications) => {
    const unread = notifications.filter((n) => !n.read).length;
    set({ notifications, unreadCount: unread });
  },

  addNotification: (notification) =>
    set((state) => {
      const exists = state.notifications.some((n) => n.id === notification.id);
      if (exists) {
        return {
          notifications: state.notifications.map((n) =>
            n.id === notification.id ? { ...n, ...notification } : n
          ),
          unreadCount: state.notifications.filter((n) => !n.read).length,
        };
      }
      const updated = [notification, ...state.notifications];
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    }),

  markAsRead: (id) =>
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    }),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        read: true,
        readAt: new Date().toISOString(),
      })),
      unreadCount: 0,
    })),

  removeNotification: (id) =>
    set((state) => {
      const updated = state.notifications.filter((n) => n.id !== id);
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    }),

  setFilter: (filter) => set({ filter }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
