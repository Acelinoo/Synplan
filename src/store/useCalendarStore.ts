import { create } from "zustand";
import { CalendarViewMode } from "@/types";

interface CalendarState {
  viewMode: CalendarViewMode;
  selectedDate: string; // ISO date string YYYY-MM-DD
  filterProjectId: string | "all";
  filterAssigneeId: string | "all";

  // Actions
  setViewMode: (mode: CalendarViewMode) => void;
  setSelectedDate: (date: string) => void;
  setFilterProjectId: (projectId: string | "all") => void;
  setFilterAssigneeId: (assigneeId: string | "all") => void;
  goToToday: () => void;
}

const getTodayString = () => new Date().toISOString().split("T")[0];

export const useCalendarStore = create<CalendarState>((set) => ({
  viewMode: "month",
  selectedDate: getTodayString(),
  filterProjectId: "all",
  filterAssigneeId: "all",

  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setFilterProjectId: (filterProjectId) => set({ filterProjectId }),
  setFilterAssigneeId: (filterAssigneeId) => set({ filterAssigneeId }),
  goToToday: () => set({ selectedDate: getTodayString() }),
}));
