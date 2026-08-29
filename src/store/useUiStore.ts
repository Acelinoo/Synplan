import { create } from "zustand";
import { ToastMessage } from "@/types";

type ThemeMode = "dark" | "light" | "system";

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  type: "task" | "project" | "system" | "team";
  link?: string;
}

interface UiState {
  theme: ThemeMode;
  isSidebarCollapsed: boolean;
  isCreateTaskModalOpen: boolean;
  isCreateProjectModalOpen: boolean;
  isCommandPaletteOpen: boolean;
  isSettingsModalOpen: boolean;
  toasts: ToastMessage[];
  notifications: AppNotification[];

  // Actions
  setTheme: (theme: ThemeMode) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCreateTaskModalOpen: (open: boolean) => void;
  setCreateProjectModalOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
  setNotifications: (notifications: AppNotification[]) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  addNotification: (notification: Omit<AppNotification, "id" | "timestamp" | "read">) => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: "dark",
  isSidebarCollapsed: false,
  isCreateTaskModalOpen: false,
  isCreateProjectModalOpen: false,
  isCommandPaletteOpen: false,
  isSettingsModalOpen: false,
  toasts: [],
  notifications: [],

  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("synplan_theme", theme);
        if (theme === "dark") {
          document.documentElement.classList.add("dark");
        } else if (theme === "light") {
          document.documentElement.classList.remove("dark");
        } else {
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          if (prefersDark) {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
        }
      } catch (e) {
        // ignore
      }
    }
    set({ theme });
  },
  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
  setCreateTaskModalOpen: (isCreateTaskModalOpen) => set({ isCreateTaskModalOpen }),
  setCreateProjectModalOpen: (isCreateProjectModalOpen) =>
    set({ isCreateProjectModalOpen }),
  setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),
  setSettingsModalOpen: (isSettingsModalOpen) => set({ isSettingsModalOpen }),
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastMessage = { ...toast, id };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    if (toast.duration !== 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, toast.duration || 4000);
    }
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setNotifications: (notifications) => set({ notifications }),
  markNotificationAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),
  markAllNotificationsAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),
  addNotification: (notif) => {
    const newNotif: AppNotification = {
      ...notif,
      id: `notif-${Date.now()}`,
      timestamp: "Just now",
      read: false,
    };
    set((state) => ({ notifications: [newNotif, ...state.notifications] }));
  },
}));
