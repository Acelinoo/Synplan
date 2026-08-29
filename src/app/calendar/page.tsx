"use client";

import * as React from "react";
import { useCalendarStore, useTaskStore, useWorkspaceStore } from "@/store";
import { Task } from "@/types";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekView } from "@/components/calendar/WeekView";
import { DayView } from "@/components/calendar/DayView";
import { TaskDetailDrawer } from "@/components/kanban/TaskDetailDrawer";
import { AnimatedGrid } from "@/components/ui/animated-grid";
import { apiClient } from "@/lib/apiClient";

export default function CalendarPage() {
  const { viewMode, selectedDate, setSelectedDate, filterProjectId } = useCalendarStore();
  const { tasks, setTasks } = useTaskStore();
  const { projects, setProjects } = useWorkspaceStore();

  const [currentDateObj, setCurrentDateObj] = React.useState<Date>(new Date());
  const [inspectingTask, setInspectingTask] = React.useState<Task | null>(null);

  React.useEffect(() => {
    async function loadCalendarData() {
      try {
        const [taskRes, projRes] = await Promise.all([
          apiClient.getTasks(),
          apiClient.getProjects(),
        ]);
        if (taskRes.success && Array.isArray(taskRes.data)) {
          setTasks(taskRes.data);
        }
        if (projRes.success && Array.isArray(projRes.data)) {
          setProjects(projRes.data);
        }
      } catch (e) {
        console.warn("Calendar load error:", e);
      }
    }
    loadCalendarData();
  }, [setTasks, setProjects]);

  const filteredTasks = tasks.filter((t) => {
    if (filterProjectId === "all") return true;
    return t.projectId === filterProjectId;
  });

  const handlePrev = () => {
    const nextDate = new Date(currentDateObj);
    if (viewMode === "month") {
      nextDate.setMonth(nextDate.getMonth() - 1);
    } else if (viewMode === "week") {
      nextDate.setDate(nextDate.getDate() - 7);
    } else {
      nextDate.setDate(nextDate.getDate() - 1);
    }
    setCurrentDateObj(nextDate);
  };

  const handleNext = () => {
    const nextDate = new Date(currentDateObj);
    if (viewMode === "month") {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else if (viewMode === "week") {
      nextDate.setDate(nextDate.getDate() + 7);
    } else {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    setCurrentDateObj(nextDate);
  };

  const titleString =
    viewMode === "month"
      ? currentDateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : viewMode === "week"
      ? `Week of ${currentDateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : currentDateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="relative flex flex-col gap-6">
      <AnimatedGrid />

      {/* Calendar Header with Navigation and View Toggles */}
      <CalendarHeader
        currentTitle={titleString}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      {/* Calendar Grid Body */}
      {viewMode === "month" && (
        <MonthView
          currentDate={currentDateObj}
          tasks={filteredTasks}
          onSelectTask={(task) => setInspectingTask(task)}
        />
      )}

      {viewMode === "week" && (
        <WeekView
          currentDate={currentDateObj}
          tasks={filteredTasks}
          onSelectTask={(task) => setInspectingTask(task)}
        />
      )}

      {viewMode === "day" && (
        <DayView
          currentDate={currentDateObj}
          tasks={filteredTasks}
          onSelectTask={(task) => setInspectingTask(task)}
        />
      )}

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={inspectingTask}
        onClose={() => setInspectingTask(null)}
        onEdit={(task) => setInspectingTask(task)}
      />
    </div>
  );
}
