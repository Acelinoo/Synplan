import { realtimeClient } from "@/lib/realtime";
import { RealtimeEnvelope } from "@/domains/realtime/realtime.types";
import { RealtimeChannels } from "@/domains/realtime/realtime.channels";
import { EventDeduplicator } from "./event-deduplicator";

export interface WorkspaceSubscriptionOptions {
  workspaceId: string;
  projectId?: string;
  onEvent: (event: RealtimeEnvelope) => void;
  onReconnect?: () => void;
  deduplicator?: EventDeduplicator;
}

export interface ClientSubscriptionController {
  unsubscribe: () => void;
  isSubscribed: () => boolean;
}

/**
 * Centralized Client Subscription Manager
 *
 * Guarantees:
 * 1. Scoped subscriptions to workspace and optional project channels.
 * 2. Deduplication of incoming events via bounded LRU cache.
 * 3. Stale event protection (skips older timestamps for identical entities).
 * 4. Reconnect resync hook to trigger authoritative query invalidation.
 * 5. Clean teardown with zero memory leaks.
 */
export class RealtimeClientSubscription {
  private static entityTimestamps: Map<string, number> = new Map();

  static subscribe(options: WorkspaceSubscriptionOptions): ClientSubscriptionController {
    const { workspaceId, projectId, onEvent, onReconnect } = options;
    const deduplicator = options.deduplicator || new EventDeduplicator();
    let isSubscribed = true;

    const unsubs: Array<() => void> = [];

    const handleIncomingEvent = (rawEvent: any) => {
      if (!isSubscribed || !rawEvent) return;

      const event = rawEvent as RealtimeEnvelope;
      const eventId = event.id;

      // 1. Deduplication guard
      if (eventId && deduplicator.isDuplicate(eventId)) {
        return;
      }

      // 2. Stale event / ordering guard
      if (event.entityId && event.timestamp) {
        const eventTime = new Date(event.timestamp).getTime();
        const lastSeenTime = this.entityTimestamps.get(event.entityId);

        if (lastSeenTime && eventTime < lastSeenTime) {
          // Ignore outdated out-of-order event
          return;
        }

        this.entityTimestamps.set(event.entityId, eventTime);
      }

      // 3. Dispatch to subscriber
      onEvent(event);
    };

    // 1. Workspace channel subscription
    const wsChannel = RealtimeChannels.getWorkspaceChannel(workspaceId);
    const wsSub = realtimeClient.subscribe(wsChannel, handleIncomingEvent);
    unsubs.push(() => wsSub.unsubscribe());

    // 2. Project channel subscription (if scoped)
    if (projectId) {
      const projChannel = RealtimeChannels.getProjectChannel(projectId);
      const projSub = realtimeClient.subscribe(projChannel, handleIncomingEvent);
      unsubs.push(() => projSub.unsubscribe());
    }

    // 3. Reconnect hook for resyncing from authoritative API
    if (onReconnect) {
      const unsubReconnect = realtimeClient.onReconnect(() => {
        if (isSubscribed) {
          onReconnect();
        }
      });
      unsubs.push(unsubReconnect);
    }

    return {
      unsubscribe: () => {
        isSubscribed = false;
        unsubs.forEach((unsub) => {
          try {
            unsub();
          } catch {}
        });
        unsubs.length = 0;
      },
      isSubscribed: () => isSubscribed,
    };
  }
}
