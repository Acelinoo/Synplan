import { eventBus } from "../events/event-bus";
import { DomainEvent } from "../events/types";
import { AutomationService } from "./automation.service";

/**
 * Event Bus Bridge for Automation Engine.
 *
 * Execution Order:
 * 1. Database Transaction (Authoritative)
 * 2. Domain Event Emitted
 * 3. AuditLog Consumer
 * 4. Notification Consumer
 * 5. Automation Consumer (Rules evaluation & Domain actions)
 * 6. Realtime Consumer (Supabase broadcast)
 *
 * Guarantees zero circular dependency:
 * - Automation calls Domain Services
 * - Realtime only transports facts
 * - Internal events (e.g. NOTIFICATION_CREATED) are skipped from recursive task triggering
 */
export class AutomationEvents {
  private static isInitialized = false;

  static init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    eventBus.subscribeAll(async (event: DomainEvent) => {
      // Do not run automation on internal notification dispatches to prevent unintended loops
      if (event.type === "NOTIFICATION_CREATED") {
        return;
      }

      try {
        await AutomationService.processEvent(event);
      } catch (err) {
        console.warn("[AutomationEvents] Non-fatal automation execution error:", err);
      }
    });
  }
}

// Auto-initialize subscriber
AutomationEvents.init();
