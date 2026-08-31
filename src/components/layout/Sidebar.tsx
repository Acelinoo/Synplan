"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users2,
  Calendar,
  BarChart3,
  Settings,
  X,
} from "lucide-react";
import { useUiStore, useWorkspaceStore } from "@/store";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderKanban },
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
  { title: "Calendar", href: "/calendar", icon: Calendar },
  { title: "Team", href: "/team", icon: Users2 },
  { title: "Reports", href: "/reports", icon: BarChart3 },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isSidebarCollapsed, toggleSidebar } = useUiStore();
  const { currentUser } = useWorkspaceStore();

  const userInitial = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U";
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
      {/* Mobile Overlay Backdrop */}
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
          "flex flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out select-none z-40 h-full",
          isSidebarCollapsed
            ? "hidden md:flex md:w-16"
            : "fixed inset-y-0 left-0 w-60 md:relative md:w-60 shadow-2xl md:shadow-none"
        )}
      >
        {/* Brand Logo Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-border/50">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs transition-transform group-hover:scale-105">
              <div className="h-3.5 w-3.5 rounded-xs bg-card" />
            </div>
            {!isSidebarCollapsed && (
              <span className="font-bold text-sm tracking-tight text-foreground">
                Synplan
              </span>
            )}
          </Link>

          {/* Close button on mobile */}
          {!isSidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted md:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation Link List */}
        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto" aria-label="Sidebar Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname?.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (!isSidebarCollapsed && window.innerWidth < 768) {
                    toggleSidebar();
                  }
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-xs transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs"
                    : "text-sidebar-foreground/80 hover:bg-muted/60 hover:text-foreground font-medium",
                  isSidebarCollapsed && "justify-center px-0"
                )}
                title={isSidebarCollapsed ? item.title : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/70"
                  )}
                />
                {!isSidebarCollapsed && (
                  <span className="truncate">{item.title}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Authenticated User Profile Section */}
        <div className="border-t border-border/80 p-3.5">
          <div className="flex items-center gap-3">
            {currentUser?.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={currentUser.avatarUrl}
                alt={userName}
                loading="lazy"
                className="h-8 w-8 shrink-0 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary font-mono border border-border">
                {userInitial}
              </div>
            )}

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
