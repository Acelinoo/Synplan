"use client";

import * as React from "react";
import { useWorkspaceStore } from "@/store";
import { realtimeClient } from "@/lib/realtime";

export interface PresenceUser {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: string;
  lastActive: string;
  currentPath?: string;
}

const PRESENCE_STORAGE_KEY = "synplan_presence_heartbeat";
const HEARTBEAT_INTERVAL_MS = 25000;
const PRESENCE_TIMEOUT_MS = 60000;

export function usePresence() {
  const { activeWorkspace, currentUser } = useWorkspaceStore();
  const workspaceId = activeWorkspace?.id;
  const [onlineUsers, setOnlineUsers] = React.useState<PresenceUser[]>([]);

  React.useEffect(() => {
    if (!workspaceId || !currentUser?.id) return;

    const userPayload: PresenceUser = {
      userId: currentUser.id,
      name: currentUser.name || "Team Member",
      email: currentUser.email || "",
      avatarUrl: currentUser.avatarUrl,
      role: currentUser.role,
      lastActive: new Date().toISOString(),
      currentPath: typeof window !== "undefined" ? window.location.pathname : "",
    };

    // User map stored locally for peer resolution
    const peersMap = new Map<string, PresenceUser>();
    peersMap.set(currentUser.id, userPayload);

    const updateStateFromMap = () => {
      const cutoff = Date.now() - PRESENCE_TIMEOUT_MS;
      const active: PresenceUser[] = [];
      peersMap.forEach((user) => {
        const time = new Date(user.lastActive).getTime();
        if (!isNaN(time) && time >= cutoff) {
          active.push(user);
        }
      });
      setOnlineUsers(active);
    };

    // 1. Subscribe to presence broadcasts on workspace channel
    const channelName = `workspace:${workspaceId}`;
    const subHeartbeat = realtimeClient.subscribeEvent(
      channelName,
      "USER_HEARTBEAT" as any,
      (event: any) => {
        const user = event.payload as PresenceUser;
        if (user && user.userId) {
          peersMap.set(user.userId, {
            ...user,
            lastActive: new Date().toISOString(),
          });
          updateStateFromMap();
        }
      }
    );

    const subLeave = realtimeClient.subscribeEvent(
      channelName,
      "USER_LEFT" as any,
      (event: any) => {
        const user = event.payload;
        if (user?.userId) {
          peersMap.delete(user.userId);
          updateStateFromMap();
        }
      }
    );

    // 2. Send initial heartbeat
    const sendHeartbeat = () => {
      const payload: PresenceUser = {
        ...userPayload,
        lastActive: new Date().toISOString(),
        currentPath: typeof window !== "undefined" ? window.location.pathname : "",
      };
      peersMap.set(currentUser.id, payload);
      updateStateFromMap();

      realtimeClient.broadcast(channelName, "USER_HEARTBEAT" as any, payload, {
        workspaceId,
      });
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Prune stale peers timer
    const pruneInterval = setInterval(updateStateFromMap, 15000);

    // 3. Send leave event on window unload
    const handleUnload = () => {
      realtimeClient.broadcast(channelName, "USER_LEFT" as any, { userId: currentUser.id }, {
        workspaceId,
      });
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      clearInterval(pruneInterval);
      window.removeEventListener("beforeunload", handleUnload);
      subHeartbeat.unsubscribe();
      subLeave.unsubscribe();
      handleUnload();
    };
  }, [workspaceId, currentUser]);

  return {
    onlineUsers,
    totalOnline: onlineUsers.length,
  };
}
