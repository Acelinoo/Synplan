"use client";

import * as React from "react";
import { realtimeClient } from "@/lib/realtime";
import { useWorkspaceStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import {
  RealtimeConnectionState,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeEventHandler,
} from "@/types/realtime";

export function useRealtimeWorkspace() {
  const { activeWorkspace, setActiveWorkspace, setWorkspaces } = useWorkspaceStore();
  const workspaceId = activeWorkspace?.id;

  const [connectionState, setConnectionState] = React.useState<RealtimeConnectionState>(
    realtimeClient.getState()
  );
  const [lastEvent, setLastEvent] = React.useState<RealtimeEvent | null>(null);

  // 1. Auto-hydrate and validate active workspace against authenticated user's memberships
  React.useEffect(() => {
    let isMounted = true;
    async function syncWorkspace() {
      try {
        // Preferred authoritative source: Authenticated session
        const sessionRes = await apiClient.getSession();
        if (!isMounted) return;

        if (sessionRes.success && sessionRes.data?.authenticated) {
          const userWorkspaces = Array.isArray(sessionRes.data.workspaces) ? sessionRes.data.workspaces : [];
          if (userWorkspaces.length > 0) {
            setWorkspaces(userWorkspaces);
            const currentActive = useWorkspaceStore.getState().activeWorkspace;
            const validActive = currentActive && userWorkspaces.find((w: any) => w.id === currentActive.id);
            if (validActive) {
              setActiveWorkspace(validActive);
            } else {
              setActiveWorkspace(userWorkspaces[0]);
            }
            return;
          }
        }

        // Fallback: User-scoped workspaces endpoint
        const wsRes = await apiClient.getWorkspaces();
        if (!isMounted) return;

        if (wsRes.success && Array.isArray(wsRes.data) && wsRes.data.length > 0) {
          setWorkspaces(wsRes.data);
          const currentActive = useWorkspaceStore.getState().activeWorkspace;
          const validActive = currentActive && wsRes.data.find((w: any) => w.id === currentActive.id);
          if (validActive) {
            setActiveWorkspace(validActive);
          } else {
            setActiveWorkspace(wsRes.data[0]);
          }
        }
      } catch (err) {
        console.warn("[Realtime] Failed to sync workspace:", err);
      }
    }

    if (!activeWorkspace) {
      syncWorkspace();
    }

    return () => {
      isMounted = false;
    };
  }, [activeWorkspace, setActiveWorkspace, setWorkspaces]);

  // 2. Track global connection state
  React.useEffect(() => {
    const unsub = realtimeClient.onStateChange((state) => {
      setConnectionState(state);
    });
    return unsub;
  }, []);

  // 3. Subscribe to workspace channel
  React.useEffect(() => {
    if (!workspaceId) {
      // Subscribe to global fallback while waiting for workspace ID
      const sub = realtimeClient.subscribe("*", (event) => {
        setLastEvent(event);
      });
      return () => sub.unsubscribe();
    }

    const channelName = `workspace:${workspaceId}`;
    const sub = realtimeClient.subscribe(channelName, (event) => {
      setLastEvent(event);
    });

    return () => {
      sub.unsubscribe();
    };
  }, [workspaceId]);

  // 4. Helper to subscribe to specific typed events in current workspace
  const onEvent = React.useCallback(
    <T extends RealtimeEventType>(eventType: T, handler: RealtimeEventHandler<T>) => {
      const wrappedHandler: RealtimeEventHandler<T> = (ev) => {
        // Only accept if event matches current workspace OR if workspace is unspecified
        if (!ev.workspaceId || !workspaceId || ev.workspaceId === workspaceId) {
          handler(ev);
        }
      };

      if (workspaceId) {
        const channelName = `workspace:${workspaceId}`;
        const sub = realtimeClient.subscribeEvent(channelName, eventType, wrappedHandler);
        const globalSub = realtimeClient.subscribeEvent("*", eventType, wrappedHandler);
        return () => {
          sub.unsubscribe();
          globalSub.unsubscribe();
        };
      } else {
        const globalSub = realtimeClient.subscribeEvent("*", eventType, wrappedHandler);
        return () => globalSub.unsubscribe();
      }
    },
    [workspaceId]
  );

  // 5. Helper to broadcast an event to current workspace channel
  const broadcast = React.useCallback(
    <T extends RealtimeEventType>(eventType: T, payload: any, metadata?: { workspaceId?: string; projectId?: string; taskId?: string }) => {
      const targetWsId = metadata?.workspaceId || workspaceId || "ws-default";
      const channelName = `workspace:${targetWsId}`;
      realtimeClient.broadcast(channelName, eventType, payload, {
        workspaceId: targetWsId,
        projectId: metadata?.projectId,
        taskId: metadata?.taskId,
      });
    },
    [workspaceId]
  );

  // 6. Helper to register reconnect catch-up listeners
  const onReconnect = React.useCallback((callback: () => void) => {
    return realtimeClient.onReconnect(callback);
  }, []);

  return {
    workspaceId,
    connectionState,
    isConnected: connectionState === "CONNECTED",
    lastEvent,
    onEvent,
    broadcast,
    onReconnect,
  };
}
