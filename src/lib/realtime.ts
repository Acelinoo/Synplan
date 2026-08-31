/**
 * SYNPLAN — Supabase Realtime Client Infrastructure
 * Phase 3: Real-Time Sync & Live Collaboration Engine
 */

import {
  RealtimeConnectionState,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeEventHandler,
  RealtimeWildcardHandler,
  RealtimeSubscription,
} from "@/types/realtime";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

type StateListener = (state: RealtimeConnectionState) => void;

class SynplanRealtimeManager {
  private supabase: SupabaseClient | null = null;
  private activeChannels: Map<string, RealtimeChannel> = new Map();
  private connectionState: RealtimeConnectionState = "DISCONNECTED";
  private stateListeners: Set<StateListener> = new Set();
  private reconnectListeners: Set<() => void> = new Set();

  // Multiplexed channel subscriptions: topic -> Set of handlers
  private channelHandlers: Map<string, Set<RealtimeWildcardHandler>> = new Map();
  // Typed event listeners: `${topic}:${eventType}` -> Set of handlers
  private eventHandlers: Map<string, Set<RealtimeEventHandler<any>>> = new Map();

  // Bounded LRU Deduplication Cache: eventId -> timestamp (500 items, 60s TTL)
  private processedEventIds: Map<string, number> = new Map();
  private readonly MAX_EVENT_CACHE = 500;
  private readonly EVENT_TTL_MS = 60000;

  // Local Cross-Tab Broadcast Channel (guarantees same-browser multi-tab sync)
  private broadcastChannel: BroadcastChannel | null = null;
  private tabId: string = Math.random().toString(36).substring(2, 9);

  // Configuration
  private isConfigured: boolean = false;
  private isDev: boolean = process.env.NODE_ENV === "development";

  constructor() {
    if (typeof window !== "undefined") {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      this.isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

      if (this.isConfigured) {
        try {
          this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          });
        } catch (e) {
          if (this.isDev) console.warn("[Realtime] Supabase client init fallback:", e);
        }
      }

      // Initialize local cross-tab communication bus
      if ("BroadcastChannel" in window) {
        try {
          this.broadcastChannel = new BroadcastChannel("synplan_realtime_local_bus");
          this.broadcastChannel.onmessage = (msgEvent) => {
            if (
              msgEvent.data &&
              typeof msgEvent.data === "object" &&
              msgEvent.data.channel &&
              msgEvent.data.event &&
              msgEvent.data.senderTabId !== this.tabId // Prevent loop / echo to self
            ) {
              this.dispatchToLocalListeners(msgEvent.data.channel, msgEvent.data.event);
            }
          };
        } catch (e) {
          if (this.isDev) console.warn("[Realtime] BroadcastChannel init fallback:", e);
        }
      }
    }
  }

  // --- Deduplication & LRU Cache Helper ---

  public isDuplicateEvent(eventId: string): boolean {
    if (!eventId) return false;
    const now = Date.now();

    // Auto-prune expired items
    if (this.processedEventIds.has(eventId)) {
      const recordedAt = this.processedEventIds.get(eventId)!;
      if (now - recordedAt <= this.EVENT_TTL_MS) {
        return true;
      }
    }

    this.processedEventIds.set(eventId, now);

    // Evict oldest entries if cache exceeds maximum bound
    if (this.processedEventIds.size > this.MAX_EVENT_CACHE) {
      for (const [id, ts] of this.processedEventIds.entries()) {
        if (now - ts > this.EVENT_TTL_MS || this.processedEventIds.size > this.MAX_EVENT_CACHE) {
          this.processedEventIds.delete(id);
        }
      }
    }

    return false;
  }

  // --- Realtime Authorization Token ---

  public setAuthToken(token: string) {
    if (this.supabase && token) {
      try {
        this.supabase.realtime.setAuth(token);
      } catch (err) {
        if (this.isDev) console.warn("[Realtime] Failed to set realtime auth token:", err);
      }
    }
  }

  // --- State & Lifecycle ---

  public getState(): RealtimeConnectionState {
    return this.connectionState;
  }

  public onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.connectionState);
    return () => this.stateListeners.delete(listener);
  }

  public onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  private setState(newState: RealtimeConnectionState) {
    if (this.connectionState !== newState) {
      const wasReconnecting = this.connectionState === "RECONNECTING" || this.connectionState === "DISCONNECTED";
      this.connectionState = newState;

      if (this.isDev) {
        console.log(`[Realtime] Connection state -> ${newState}`);
      }

      this.stateListeners.forEach((fn) => {
        try {
          fn(newState);
        } catch (e) {
          console.error("[Realtime] Error in state listener:", e);
        }
      });

      if (newState === "CONNECTED" && wasReconnecting) {
        this.reconnectListeners.forEach((fn) => {
          try {
            fn();
          } catch (err) {
            console.error("[Realtime] Error in reconnect catch-up handler:", err);
          }
        });
      }
    }
  }

  public connect() {
    if (typeof window === "undefined") return;

    if (!this.isConfigured || !this.supabase) {
      if (this.isDev) {
        console.info("[Realtime] Running in local multi-tab broadcast mode (Supabase keys unconfigured).");
      }
      this.setState("CONNECTED");
      return;
    }

    this.setState("CONNECTING");
    // Ensure all active channels are subscribed
    this.resubscribeAllChannels();
  }

  public disconnect() {
    if (this.supabase) {
      for (const [name, channel] of this.activeChannels.entries()) {
        try {
          this.supabase.removeChannel(channel);
        } catch (e) {}
      }
      this.activeChannels.clear();
    }
    this.setState("DISCONNECTED");
  }

  // --- Channel Subscriptions ---

  public subscribe(channelName: string, onEvent: RealtimeWildcardHandler): RealtimeSubscription {
    if (!this.channelHandlers.has(channelName)) {
      this.channelHandlers.set(channelName, new Set());
      this.joinSupabaseChannel(channelName);
    }

    this.channelHandlers.get(channelName)!.add(onEvent);

    if (this.connectionState === "DISCONNECTED") {
      this.connect();
    }

    return {
      channel: channelName,
      unsubscribe: () => {
        const handlers = this.channelHandlers.get(channelName);
        if (handlers) {
          handlers.delete(onEvent);
          if (handlers.size === 0) {
            this.channelHandlers.delete(channelName);
            this.leaveSupabaseChannel(channelName);
          }
        }
      },
    };
  }

  public subscribeEvent<T extends RealtimeEventType>(
    channelName: string,
    eventType: T,
    handler: RealtimeEventHandler<T>
  ): RealtimeSubscription {
    const key = `${channelName}:${eventType}`;
    if (!this.eventHandlers.has(key)) {
      this.eventHandlers.set(key, new Set());
    }
    this.eventHandlers.get(key)!.add(handler);

    if (channelName !== "*") {
      this.joinSupabaseChannel(channelName);
    }

    return {
      channel: channelName,
      unsubscribe: () => {
        const handlers = this.eventHandlers.get(key);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this.eventHandlers.delete(key);
          }
        }
        const hasChannelHandlers = (this.channelHandlers.get(channelName)?.size ?? 0) > 0;
        const hasEventHandlers = Array.from(this.eventHandlers.keys()).some(
          (k) => k.startsWith(`${channelName}:`) && (this.eventHandlers.get(k)?.size ?? 0) > 0
        );
        if (!hasChannelHandlers && !hasEventHandlers && channelName !== "*") {
          this.leaveSupabaseChannel(channelName);
        }
      },
    };
  }

  private joinSupabaseChannel(channelName: string) {
    if (!this.supabase) return;

    if (this.activeChannels.has(channelName)) return;

    const channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    channel
      .on("broadcast", { event: "*" }, (message: any) => {
        if (message && message.payload) {
          const event = message.payload as RealtimeEvent;
          this.dispatchToLocalListeners(channelName, event);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.setState("CONNECTED");
          if (this.isDev) console.log(`[Realtime] Subscribed to Supabase channel: ${channelName}`);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.setState("ERROR");
          if (this.isDev) console.warn(`[Realtime] Channel status [${channelName}]: ${status}`);
        } else if (status === "CLOSED") {
          if (this.connectionState !== "DISCONNECTED") {
            this.setState("RECONNECTING");
          }
        }
      });

    this.activeChannels.set(channelName, channel);
  }

  private leaveSupabaseChannel(channelName: string) {
    if (!this.supabase) return;
    const channel = this.activeChannels.get(channelName);
    if (channel) {
      this.supabase.removeChannel(channel);
      this.activeChannels.delete(channelName);
      if (this.isDev) console.log(`[Realtime] Left Supabase channel: ${channelName}`);
    }
  }

  private resubscribeAllChannels() {
    for (const channelName of this.channelHandlers.keys()) {
      this.joinSupabaseChannel(channelName);
    }
  }

  // --- Broadcast & Ingestion ---

  public broadcast<T extends RealtimeEventType>(
    channelName: string,
    type: T,
    payload: any,
    metadata?: { workspaceId?: string; projectId?: string; taskId?: string; actorId?: string }
  ) {
    const uniqueId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const event: RealtimeEvent<T> = {
      id: uniqueId,
      eventId: uniqueId,
      type,
      workspaceId: metadata?.workspaceId || channelName.replace(/^workspace:/, ""),
      projectId: metadata?.projectId,
      taskId: metadata?.taskId,
      actorId: metadata?.actorId,
      timestamp: new Date().toISOString(),
      payload,
    };

    // 1. Dispatch locally in current browser tab
    this.dispatchToLocalListeners(channelName, event);

    // 2. Broadcast to other tabs on the same browser
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          channel: channelName,
          event,
          senderTabId: this.tabId,
        });
      } catch (e) {}
    }

    // 3. Broadcast to Supabase Realtime channel
    const channel = this.activeChannels.get(channelName);
    if (channel) {
      channel.send({
        type: "broadcast",
        event: type,
        payload: event,
      });
    }
  }

  public dispatchToLocalListeners(channelName: string, event: RealtimeEvent) {
    if (!event || !event.type) return;

    // Deduplication check
    const eventId = event.eventId || event.id;
    if (eventId && this.isDuplicateEvent(eventId)) {
      if (this.isDev) {
        console.log(`[Realtime] Duplicate event suppressed: ${eventId} (${event.type})`);
      }
      return;
    }

    if (this.isDev) {
      console.log(`[Realtime] Dispatched event on [${channelName}]:`, event.type, event.payload);
    }

    // 1. Channel wildcard handlers
    const handlers = this.channelHandlers.get(channelName);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error("[Realtime] Error in channel handler:", err);
        }
      });
    }

    // 2. Global wildcard handlers ("*")
    const globalHandlers = this.channelHandlers.get("*");
    if (globalHandlers) {
      globalHandlers.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error("[Realtime] Error in global wildcard handler:", err);
        }
      });
    }

    // 3. Typed event handlers
    const eventKey = `${channelName}:${event.type}`;
    const specificHandlers = this.eventHandlers.get(eventKey);
    if (specificHandlers) {
      specificHandlers.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error("[Realtime] Error in specific event handler:", err);
        }
      });
    }

    // 4. Global typed handlers
    const globalEventKey = `*:${event.type}`;
    const globalSpecificHandlers = this.eventHandlers.get(globalEventKey);
    if (globalSpecificHandlers) {
      globalSpecificHandlers.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error("[Realtime] Error in global event handler:", err);
        }
      });
    }
  }
}

// Global Singleton Export
export const realtimeClient = new SynplanRealtimeManager();
