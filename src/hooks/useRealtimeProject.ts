"use client";

import * as React from "react";
import { realtimeClient } from "@/lib/realtime";
import {
  RealtimeEvent,
  RealtimeEventType,
  RealtimeEventHandler,
} from "@/types/realtime";

export function useRealtimeProject(projectId?: string | null) {
  const [lastEvent, setLastEvent] = React.useState<RealtimeEvent | null>(null);

  React.useEffect(() => {
    if (!projectId) return;

    const channelName = `project:${projectId}`;
    const sub = realtimeClient.subscribe(channelName, (event) => {
      setLastEvent(event);
    });

    return () => {
      sub.unsubscribe();
    };
  }, [projectId]);

  const onEvent = React.useCallback(
    <T extends RealtimeEventType>(eventType: T, handler: RealtimeEventHandler<T>) => {
      if (!projectId) return () => {};
      const channelName = `project:${projectId}`;
      const sub = realtimeClient.subscribeEvent(channelName, eventType, handler);
      return () => sub.unsubscribe();
    },
    [projectId]
  );

  const broadcast = React.useCallback(
    <T extends RealtimeEventType>(eventType: T, payload: any, metadata?: { workspaceId?: string; taskId?: string }) => {
      if (!projectId) return;
      const channelName = `project:${projectId}`;
      realtimeClient.broadcast(channelName, eventType, payload, {
        projectId,
        workspaceId: metadata?.workspaceId,
        taskId: metadata?.taskId,
      });
    },
    [projectId]
  );

  return {
    projectId,
    lastEvent,
    onEvent,
    broadcast,
  };
}
