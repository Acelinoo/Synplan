"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FolderKanban,
  CheckSquare,
  Users2,
  X,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useWorkspaceStore } from "@/store";
import { Skeleton, SkeletonAvatar } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const router = useRouter();
  const { activeWorkspace } = useWorkspaceStore();
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [results, setResults] = React.useState<{
    projects: any[];
    tasks: any[];
    members: any[];
  }>({
    projects: [],
    tasks: [],
    members: [],
  });

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K / Cmd+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults({ projects: [], tasks: [], members: [] });
    }
  }, [isOpen]);

  // Debounced search query
  React.useEffect(() => {
    if (!query.trim()) {
      setResults({ projects: [], tasks: [], members: [] });
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await apiClient.globalSearch(query.trim(), activeWorkspace?.id);
        if (res.success && res.data) {
          setResults(res.data);
        }
      } catch (err) {
        console.warn("Global search error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, activeWorkspace?.id]);

  const handleSelect = (url: string) => {
    setIsOpen(false);
    router.push(url);
  };

  const totalResults = results.projects.length + results.tasks.length + results.members.length;

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 dark:bg-card/70 px-3.5 py-1.5 text-xs text-white/90 hover:bg-white/20 transition-all cursor-pointer shadow-xs"
      >
        <Search className="h-3.5 w-3.5 text-white/70" />
        <span className="hidden sm:inline text-white/80">Search anything...</span>
        <kbd className="hidden sm:inline-flex items-center rounded border border-white/20 bg-white/10 px-1.5 py-0.2 text-[9px] font-mono text-white/70">
          ⌘K
        </kbd>
      </button>

      {/* Search Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="fixed inset-0" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-10 animate-in zoom-in-95">
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 bg-card">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, tasks, squad members..."
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden"
              />
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Results Body */}
            <div className="max-h-96 overflow-y-auto p-3 space-y-4">
              {!query.trim() ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Type a keyword to quickly navigate across projects, delivery tasks, and squad members.
                </div>
              ) : isLoading ? (
                <div className="space-y-2 p-1" aria-busy="true">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg border border-border/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                        <div className="space-y-1 flex-1">
                          <Skeleton className="h-3.5 w-32 rounded" />
                          <Skeleton className="h-2.5 w-48 rounded" />
                        </div>
                      </div>
                      <Skeleton className="h-3 w-8 rounded" />
                    </div>
                  ))}
                </div>
              ) : totalResults === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No matching projects, tasks, or squad members found for &quot;{query}&quot;.
                </div>
              ) : (
                <>
                  {/* Projects */}
                  {results.projects.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-2 text-[10px] font-mono font-bold uppercase text-muted-foreground">
                        <FolderKanban className="h-3 w-3 text-primary" />
                        <span>Projects ({results.projects.length})</span>
                      </div>
                      <div className="space-y-1">
                        {results.projects.map((p) => (
                          <div
                            key={p.id}
                            tabIndex={0}
                            role="button"
                            aria-label={`Go to project ${p.name}`}
                            onClick={() => handleSelect(`/projects/${p.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSelect(`/projects/${p.id}`);
                              }
                            }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 focus:bg-muted/40 focus:outline-hidden transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: p.color || "#0284C7" }}
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground group-hover:text-primary group-focus:text-primary transition-colors truncate">
                                  {p.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate max-w-xs">
                                  {p.description || "Workspace initiative"}
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              {p.progress}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tasks */}
                  {results.tasks.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-2 text-[10px] font-mono font-bold uppercase text-muted-foreground">
                        <CheckSquare className="h-3 w-3 text-status-done" />
                        <span>Tasks ({results.tasks.length})</span>
                      </div>
                      <div className="space-y-1">
                        {results.tasks.map((t) => (
                          <div
                            key={t.id}
                            tabIndex={0}
                            role="button"
                            aria-label={`Go to task ${t.title}`}
                            onClick={() => handleSelect(`/tasks?projectId=${t.projectId}&taskId=${t.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSelect(`/tasks?projectId=${t.projectId}&taskId=${t.id}`);
                              }
                            }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 focus:bg-muted/40 focus:outline-hidden transition-colors cursor-pointer group"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground group-hover:text-primary group-focus:text-primary transition-colors truncate">
                                {t.title}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{t.projectName}</span>
                                {t.phaseName && <span>· {t.phaseName}</span>}
                              </div>
                            </div>
                            <span className="rounded-full border border-border/80 bg-muted px-2 py-0.5 text-[9px] font-mono uppercase text-muted-foreground shrink-0">
                              {t.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Members */}
                  {results.members.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-2 text-[10px] font-mono font-bold uppercase text-muted-foreground">
                        <Users2 className="h-3 w-3 text-status-review" />
                        <span>Squad Members ({results.members.length})</span>
                      </div>
                      <div className="space-y-1">
                        {results.members.map((m) => (
                          <div
                            key={m.id}
                            tabIndex={0}
                            role="button"
                            aria-label={`View squad member ${m.name}`}
                            onClick={() => handleSelect("/team")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSelect("/team");
                              }
                            }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 focus:bg-muted/40 focus:outline-hidden transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                                {m.name ? m.name.charAt(0).toUpperCase() : "U"}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-foreground group-hover:text-primary group-focus:text-primary transition-colors">
                                  {m.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{m.email}</p>
                              </div>
                            </div>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">
                              {m.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-2.5 bg-muted/10 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Press <kbd className="font-mono text-foreground font-semibold">ESC</kbd> to exit</span>
              <span className="font-mono">{totalResults} matches found</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
