import { create } from "zustand";
import { ToastMessage } from "@/types";

type ThemeMode = "dark" | "light" | "system";

interface UiState {
  theme: ThemeMode;
  isSidebarCollapsed: boolean;
  isCreateTaskModalOpen: boolean;
  isCreateProjectModalOpen: boolean;
  isCommandPaletteOpen: boolean;
  isSettingsModalOpen: boolean;
  toasts: ToastMessage[];

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
}

export const useUiStore = create<UiState>((set) => ({
  theme: "dark",
  isSidebarCollapsed: false,
  isCreateTaskModalOpen: false,
  isCreateProjectModalOpen: false,
  isCommandPaletteOpen: false,
  isSettingsModalOpen: false,
  toasts: [],

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
}));
