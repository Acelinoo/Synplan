"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users2,
  Settings,
} from "lucide-react";
import { useUiStore } from "@/store";
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
  { title: "Team", href: "/team", icon: Users2 },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isSidebarCollapsed, toggleSidebar } = useUiStore();

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {!isSidebarCollapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out select-none z-40 h-full",
          isSidebarCollapsed
            ? "hidden md:flex md:w-16"
            : "fixed inset-y-0 left-0 w-60 md:relative md:w-60 shadow-2xl md:shadow-none"
        )}
      >
        {/* Brand Logo Header */}
        <div className="flex h-16 items-center gap-3 px-5 border-b border-border/50">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/80 text-primary-foreground shadow-xs">
            <div className="h-3.5 w-3.5 rounded-xs bg-card" />
          </div>
          {!isSidebarCollapsed && (
            <span className="text-base font-bold tracking-tight text-foreground">
              Synplan
            </span>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs"
                    : "text-sidebar-foreground/80 hover:bg-muted/50 hover:text-foreground font-medium",
                  isSidebarCollapsed && "justify-center px-0"
                )}
                title={isSidebarCollapsed ? item.title : undefined}
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

        {/* Bottom User Profile Section */}
        <div className="border-t border-border/80 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary font-mono border border-border">
              A
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  Acelino
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  Product Manager
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
