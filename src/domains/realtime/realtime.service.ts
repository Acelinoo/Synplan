import { eventBus } from "../events/event-bus";
import { DomainEvent } from "../events/types";
import { RealtimePublisher } from "./realtime.publisher";
import { RealtimeEnvelope, RealtimeEventType } from "./realtime.types";

export class RealtimeService {
  private static isInitialized = false;

  /**
   * Initializes the bridge between in-process domain events and the Realtime Publisher.
   * Ensures domain layer remains infrastructure-agnostic.
   */
  static init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    eventBus.subscribeAll(async (event: DomainEvent) => {
      try {
        const envelope = this.mapDomainEventToRealtime(event);
        if (envelope) {
          await RealtimePublisher.publish(envelope);
        }
      } catch (err) {
        console.warn("[RealtimeService] Error bridging domain event to realtime:", err);
      }
    });
  }

  /**
   * Transforms an in-process DomainEvent into an immutable, transportable RealtimeEnvelope.
   */
  static mapDomainEventToRealtime(event: DomainEvent): RealtimeEnvelope | null {
    const payload = event.payload as any;

    const entityId =
      payload.taskId ||
      payload.projectId ||
      payload.dependencyId ||
      payload.commentId ||
      payload.notificationId ||
      event.id;

    return {
      id: event.id,
      type: event.type as RealtimeEventType,
      workspaceId: event.workspaceId,
      projectId: event.projectId || payload.projectId,
      entityId,
      actorId: event.actorId,
      timestamp: event.timestamp,
      payload: event.payload,
    };
  }
}

// Auto-initialize bridge
RealtimeService.init();
