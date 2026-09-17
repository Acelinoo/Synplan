"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  CheckCircle2,
  FolderKanban,
  CheckSquare,
  Activity,
  CalendarDays,
  Users2,
  BarChart3,
  Settings,
  Plus,
  Moon,
  Sun,
  Sparkles,
  X,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useUiStore, useWorkspaceStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const router = useRouter();
  const { isCommandPaletteOpen, setCommandPaletteOpen, setTheme } = useUiStore();
  const { activeWorkspace } = useWorkspaceStore();

  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [searchResults, setSearchResults] = React.useState<{
    projects: any[];
    tasks: any[];
    members: any[];
  }>({
    projects: [],
    tasks: [],
    members: [],
  });
  const [isSearching, setIsSearching] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
      if (e.key === "Escape" && isCommandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  // Focus input on open & reset state on close
  React.useEffect(() => {
    if (isCommandPaletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery("");
      setSearchResults({ projects: [], tasks: [], members: [] });
    }
  }, [isCommandPaletteOpen]);

  // Debounced live search
  React.useEffect(() => {
    if (!query.trim()) {
      setSearchResults({ projects: [], tasks: [], members: [] });
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiClient.globalSearch(query.trim(), activeWorkspace?.id);
        if (res.success && res.data) {
          setSearchResults(res.data);
        }
      } catch (err) {
        console.warn("CommandPalette search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, activeWorkspace?.id]);

  if (!isCommandPaletteOpen) return null;

  const navigationItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "My Work", href: "/my-work", icon: CheckCircle2 },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Tasks & Work Views", href: "/tasks", icon: CheckSquare },
    { label: "Activity Audit Stream", href: "/activity", icon: Activity },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Team & Workload", href: "/team", icon: Users2 },
    { label: "Reports & Analytics", href: "/reports", icon: BarChart3 },
    { label: "Workspace Settings", href: "/settings", icon: Settings },
  ];

  const quickActionItems = [
    {
      label: "Create New Task",
      icon: Plus,
      action: () => router.push("/tasks?create=true"),
    },
    {
      label: "Create New Project",
      icon: Plus,
      action: () => router.push("/projects?create=true"),
    },
    {
      label: "Toggle Light Mode",
      icon: Sun,
      action: () => setTheme("light"),
    },
    {
      label: "Toggle Dark Mode",
      icon: Moon,
      action: () => setTheme("dark"),
    },
  ];

  const filteredNav = navigationItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const filteredActions = quickActionItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const hasEntityResults =
    searchResults.projects.length > 0 ||
    searchResults.tasks.length > 0 ||
    searchResults.members.length > 0;

  const handleSelect = (action: () => void) => {
    setCommandPaletteOpen(false);
    action();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-16 sm:pt-24 p-4 backdrop-blur-xs animate-in fade-in">
      <div
        className="fixed inset-0"
        onClick={() => setCommandPaletteOpen(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Menu"
        className="relative w-full max-w-xl rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-border px-3.5 py-2.5 bg-surface-muted/30">
          <Search className="mr-2.5 h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command, project, task, or team member..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            aria-label="Search or command"
          />
          {isSearching && (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label="Close command palette"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable Results */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-border/40">
          {/* Entity Search Results */}
          {hasEntityResults && (
            <div className="pb-2">
              {searchResults.projects.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Projects
                  </div>
                  {searchResults.projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => handleSelect(() => router.push(`/projects/${proj.id}`))}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-medium">{proj.name}</span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {searchResults.tasks.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Tasks
                  </div>
                  {searchResults.tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => handleSelect(() => router.push(`/projects/${task.projectId}?taskId=${task.id}`))}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckSquare className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate font-medium">{task.title}</span>
                      </div>
                      <span className="ml-2 text-[10px] uppercase font-mono text-muted-foreground shrink-0">
                        {task.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.members.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Team Members
                  </div>
                  {searchResults.members.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => handleSelect(() => router.push("/team"))}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Users2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="font-medium">{member.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{member.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Navigation Items */}
          {filteredNav.length > 0 && (
            <div className="py-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Navigation
              </div>
              {filteredNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => handleSelect(() => router.push(item.href))}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors text-left cursor-pointer"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Actions */}
          {filteredActions.length > 0 && (
            <div className="pt-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Quick Actions
              </div>
              {filteredActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => handleSelect(item.action)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors text-left cursor-pointer"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {filteredNav.length === 0 && filteredActions.length === 0 && !hasEntityResults && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No matching commands or entities found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-border bg-surface-muted/50 px-3.5 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono text-[10px]">↵</kbd> select
            </span>
            <span>
              <kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono text-[10px]">esc</kbd> close
            </span>
          </div>
          <span className="font-medium text-[10px]">Synplan Command & Search</span>
        </div>
      </div>
    </div>
  );
}
