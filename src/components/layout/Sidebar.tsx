"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckCircle2,
  FolderKanban,
  CheckSquare,
  Activity,
  Calendar,
  BarChart3,
  Users2,
  Bell,
  Settings,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Check,
  X,
  Plus,
} from "lucide-react";
import { useUiStore, useWorkspaceStore, useNotificationStore } from "@/store";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavGroup {
  category?: string;
  items: {
    title: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

const navGroups: NavGroup[] = [
  {
    category: "Work",
    items: [
      { title: "Dashboard", href: "/", icon: LayoutDashboard },
      { title: "My Work", href: "/my-work", icon: CheckCircle2 },
      { title: "Projects", href: "/projects", icon: FolderKanban },
      { title: "Tasks", href: "/tasks", icon: CheckSquare },
      { title: "Activity", href: "/activity", icon: Activity },
    ],
  },
  {
    category: "Planning",
    items: [
      { title: "Calendar", href: "/calendar", icon: Calendar },
      { title: "Reports", href: "/reports", icon: BarChart3 },
      { title: "Team", href: "/team", icon: Users2 },
    ],
  },
  {
    category: "Workspace",
    items: [
      { title: "Notifications", href: "/notifications", icon: Bell },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isSidebarCollapsed, toggleSidebar, setCreateProjectModalOpen } = useUiStore();
  const { activeWorkspace, workspaces, setActiveWorkspace, currentUser } = useWorkspaceStore();
  const { unreadCount } = useNotificationStore();

  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = React.useState(false);

  const userName = currentUser?.name || "Synplan User";
  const userRole = currentUser?.role ? currentUser.role.charAt(0) + currentUser.role.slice(1).toLowerCase() : "Member";

  // Handle ESC key to close mobile sidebar
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isSidebarCollapsed && window.innerWidth < 768) {
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarCollapsed, toggleSidebar]);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {!isSidebarCollapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in transition-opacity"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main Navigation"
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-200 ease-in-out select-none z-40 h-full",
          isSidebarCollapsed
            ? "hidden md:flex md:w-16"
            : "fixed inset-y-0 left-0 w-60 md:relative md:w-60 shadow-2xl md:shadow-none"
        )}
      >
        {/* Workspace Identity & Switcher Header */}
        <div className="relative flex h-14 items-center justify-between border-b border-border px-3.5 bg-sidebar">
          {!isSidebarCollapsed ? (
            <div className="relative min-w-0 flex-1 mr-2">
              <button
                type="button"
                onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                className="flex w-full items-center justify-between rounded-md p-1.5 text-left hover:bg-muted/70 transition-colors cursor-pointer"
                aria-expanded={isWorkspaceMenuOpen}
                aria-label="Select Workspace"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
                    {activeWorkspace?.name ? activeWorkspace.name.charAt(0).toUpperCase() : "S"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground leading-tight">
                      {activeWorkspace?.name || "Synplan Workspace"}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase">
                      Workspace
                    </p>
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
              </button>

              {/* Workspace Switcher Popover */}
              {isWorkspaceMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsWorkspaceMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute left-0 top-12 z-50 w-56 rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Switch Workspace
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {workspaces.map((ws) => (
                        <button
                          key={ws.id}
                          onClick={() => {
                            setActiveWorkspace(ws);
                            setIsWorkspaceMenuOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs transition-colors cursor-pointer text-left",
                            activeWorkspace?.id === ws.id
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-foreground hover:bg-muted/70"
                          )}
                        >
                          <span className="truncate">{ws.name}</span>
                          {activeWorkspace?.id === ws.id && (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex w-full items-center justify-center">
              <Tooltip content={activeWorkspace?.name || "Synplan"} side="right">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs shadow-2xs">
                  {activeWorkspace?.name ? activeWorkspace.name.charAt(0).toUpperCase() : "S"}
                </div>
              </Tooltip>
            </div>
          )}

          {/* Desktop Collapse / Mobile Close Button */}
          <div className="flex items-center">
            {/* Mobile close button */}
            <button
              onClick={toggleSidebar}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted md:hidden cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Desktop collapse toggle */}
            {!isSidebarCollapsed && (
              <button
                onClick={toggleSidebar}
                className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Group Items */}
        <nav
          className="flex-1 space-y-4 p-2.5 overflow-y-auto"
          aria-label="Sidebar Navigation"
        >
          {navGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-1">
              {!isSidebarCollapsed && group.category && (
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                  {group.category}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname?.startsWith(item.href + "/");

                const navLink = (
                  <Link
                    href={item.href}
                    onClick={() => {
                      if (!isSidebarCollapsed && window.innerWidth < 768) {
                        toggleSidebar();
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer",
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                        : "text-sidebar-foreground hover:bg-muted/70 hover:text-foreground font-medium",
                      isSidebarCollapsed && "justify-center px-0 py-2"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <div className="relative shrink-0">
                      <Icon
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isActive ? "text-primary-foreground" : "text-muted-foreground"
                        )}
                      />
                      {isSidebarCollapsed && item.href === "/notifications" && unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" />
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <>
                        <span className="truncate flex-1">{item.title}</span>
                        {item.href === "/notifications" && unreadCount > 0 && (
                          <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 font-mono text-[9px] font-bold text-primary">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );

                if (isSidebarCollapsed) {
                  const tooltipLabel = item.href === "/notifications" && unreadCount > 0 
                    ? `${item.title} (${unreadCount})`
                    : item.title;
                  return (
                    <Tooltip key={item.href} content={tooltipLabel} side="right">
                      {navLink}
                    </Tooltip>
                  );
                }

                return <div key={item.href}>{navLink}</div>;
              })}
            </div>
          ))}
        </nav>

        {/* Expand button when collapsed on desktop */}
        {isSidebarCollapsed && (
          <div className="border-t border-border p-2 hidden md:flex justify-center">
            <button
              onClick={toggleSidebar}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Authenticated User Footer */}
        <div className="border-t border-border p-3 bg-sidebar">
          <div className={cn("flex items-center gap-2.5", isSidebarCollapsed && "justify-center")}>
            <Avatar
              src={currentUser?.avatarUrl}
              name={userName}
              size="sm"
            />
            {!isSidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {userName}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {userRole}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
