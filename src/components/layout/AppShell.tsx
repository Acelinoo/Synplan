"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { CommandPalette } from "@/components/common/CommandPalette";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { AiAssistantDrawer } from "@/components/ai/AiAssistantDrawer";
import { AiAssistantTrigger } from "@/components/ai/AiAssistantTrigger";
import { ToastContainer } from "@/components/ui/toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/login");

  if (isAuthPage) {
    return (
      <main className="min-h-screen w-screen overflow-x-hidden bg-background text-foreground">
        {children}
        <ToastContainer />
      </main>
    );
  }

  return (
    <RealtimeProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        {/* Persistent / Collapsible Navigation Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopHeader />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-[1440px]">
              {children}
            </div>
          </main>
        </div>

        {/* Global Command & Search Palette */}
        <CommandPalette />

        {/* AI Assistant Drawer & Subtle Floating Entry Point */}
        <AiAssistantDrawer />
        <AiAssistantTrigger variant="floating" />

        {/* Global Accessible Toast Notifications */}
        <ToastContainer />
      </div>
    </RealtimeProvider>
  );
}
