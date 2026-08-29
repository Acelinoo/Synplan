"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  Users2,
  BarChart3,
  Settings,
  Plus,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { useUiStore } from "@/store";

export function CommandPalette() {
  const router = useRouter();
  const { isCommandPaletteOpen, setCommandPaletteOpen, setCreateTaskModalOpen, setTheme } = useUiStore();
  const [query, setQuery] = React.useState("");

  // Keyboard shortcut listener for Command + K / Ctrl + K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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

  if (!isCommandPaletteOpen) return null;

  const actions = [
    {
      category: "Navigation",
      items: [
        { label: "Go to Dashboard", icon: LayoutDashboard, action: () => router.push("/") },
        { label: "Go to Projects", icon: FolderKanban, action: () => router.push("/projects") },
        { label: "Go to Tasks & Kanban", icon: CheckSquare, action: () => router.push("/tasks") },
        { label: "Go to Calendar", icon: CalendarDays, action: () => router.push("/calendar") },
        { label: "Go to Team & Workload", icon: Users2, action: () => router.push("/team") },
        { label: "Go to Reports & Analytics", icon: BarChart3, action: () => router.push("/reports") },
        { label: "Go to Settings", icon: Settings, action: () => router.push("/settings") },
      ],
    },
    {
      category: "Quick Actions",
      items: [
        {
          label: "Create New Project",
          icon: Plus,
          action: () => {
            setCommandPaletteOpen(false);
            router.push("/projects?create=true");
          },
        },
        {
          label: "Create New Task",
          icon: Plus,
          action: () => {
            setCommandPaletteOpen(false);
            router.push("/tasks?create=true");
          },
        },
        {
          label: "Switch to Dark Mode",
          icon: Moon,
          action: () => {
            setTheme("dark");
            document.documentElement.classList.add("dark");
            setCommandPaletteOpen(false);
          },
        },
        {
          label: "Switch to Light Mode",
          icon: Sun,
          action: () => {
            setTheme("light");
            document.documentElement.classList.remove("dark");
            setCommandPaletteOpen(false);
          },
        },
      ],
    },
  ];

  const filteredActions = actions
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20 backdrop-blur-sm animate-in fade-in">
      <div
        className="fixed inset-0"
        onClick={() => setCommandPaletteOpen(false)}
      />
      <div className="relative w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Input Bar */}
        <div className="flex items-center border-b border-border px-4 py-3">
          <Search className="mr-3 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredActions.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredActions.map((group) => (
              <div key={group.category} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.category}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={() => {
                        item.action();
                        setCommandPaletteOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors text-left"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span>Navigation Shortcuts</span>
          <div className="flex items-center gap-2">
            <span>Press <kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono text-[10px]">Esc</kbd> to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
