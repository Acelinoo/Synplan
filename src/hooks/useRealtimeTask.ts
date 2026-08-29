"use client";

import * as React from "react";
import { realtimeClient } from "@/lib/realtime";
import {
  RealtimeEvent,
  RealtimeEventType,
  RealtimeEventHandler,
} from "@/types/realtime";

export function useRealtimeTask(taskId?: string | null) {
  const [lastEvent, setLastEvent] = React.useState<RealtimeEvent | null>(null);

  React.useEffect(() => {
    if (!taskId) return;

    const channelName = `task:${taskId}`;
    const sub = realtimeClient.subscribe(channelName, (event) => {
      setLastEvent(event);
    });

    return () => {
      sub.unsubscribe();
    };
  }, [taskId]);

  const onEvent = React.useCallback(
    <T extends RealtimeEventType>(eventType: T, handler: RealtimeEventHandler<T>) => {
      if (!taskId) return () => {};
      const channelName = `task:${taskId}`;
      const sub = realtimeClient.subscribeEvent(channelName, eventType, handler);
      return () => sub.unsubscribe();
    },
    [taskId]
  );

  const broadcast = React.useCallback(
    <T extends RealtimeEventType>(eventType: T, payload: any, metadata?: { workspaceId?: string; projectId?: string }) => {
      if (!taskId) return;
      const channelName = `task:${taskId}`;
      realtimeClient.broadcast(channelName, eventType, payload, {
        taskId,
        workspaceId: metadata?.workspaceId,
        projectId: metadata?.projectId,
      });
    },
    [taskId]
  );

  return {
    taskId,
    lastEvent,
    onEvent,
    broadcast,
  };
}
