"use client";

import * as React from "react";
import { useRealtimeWorkspace } from "@/hooks/useRealtimeWorkspace";
import {
  RealtimeConnectionState,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeEventHandler,
} from "@/types/realtime";

interface RealtimeContextType {
  connectionState: RealtimeConnectionState;
  isConnected: boolean;
  workspaceId?: string;
  lastEvent: RealtimeEvent | null;
  onEvent: <T extends RealtimeEventType>(eventType: T, handler: RealtimeEventHandler<T>) => () => void;
  broadcast: <T extends RealtimeEventType>(
    eventType: T,
    payload: any,
    metadata?: { projectId?: string; taskId?: string }
  ) => void;
  onReconnect: (callback: () => void) => () => void;
}

const RealtimeContext = React.createContext<RealtimeContextType | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const realtime = useRealtimeWorkspace();

  return (
    <RealtimeContext.Provider value={realtime}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextType {
  const context = React.useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return context;
}
