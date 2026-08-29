"use client";

import * as React from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { CommandPalette } from "@/components/common/CommandPalette";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { AiAssistantDrawer } from "@/components/ai/AiAssistantDrawer";
import { AiAssistantTrigger } from "@/components/ai/AiAssistantTrigger";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        {/* Persistent / Collapsible Sidebar */}
        <Sidebar />

        {/* Main App Content Viewport */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopHeader />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-[1440px]">
              {children}
            </div>
          </main>
        </div>

        {/* Global Command Palette Modal */}
        <CommandPalette />

        {/* AI Project & Task Assistant Drawer & Trigger */}
        <AiAssistantDrawer />
        <AiAssistantTrigger variant="floating" />
      </div>
    </RealtimeProvider>
  );
}
