/**
 * SYNPLAN — Supabase Realtime & Multi-Channel Client Infrastructure
 * Phase 12B: Realtime Foundation Layer
 */

import {
  RealtimeConnectionState,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeEventHandler,
  RealtimeWildcardHandler,
  RealtimeSubscription,
} from "@/types/realtime";

type StateListener = (state: RealtimeConnectionState) => void;

class SynplanRealtimeManager {
  private socket: WebSocket | null = null;
  private connectionState: RealtimeConnectionState = "DISCONNECTED";
  private stateListeners: Set<StateListener> = new Set();
  private reconnectListeners: Set<() => void> = new Set();
  
  // Multiplexed channel subscriptions: topic -> Set of handlers
  private channelHandlers: Map<string, Set<RealtimeWildcardHandler>> = new Map();
  // Typed event listeners: `${topic}:${eventType}` -> Set of handlers
  private eventHandlers: Map<string, Set<RealtimeEventHandler<any>>> = new Map();

  // Deduplication cache: eventId -> timestamp
  private processedEventIds: Map<string, number> = new Map();

  // Heartbeat & reconnect timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000;

  // Local Cross-Tab Broadcast Channel (guarantees multi-tab sync even when offline)
  private broadcastChannel: BroadcastChannel | null = null;
  private tabId: string = Math.random().toString(36).substring(2, 9);

  // Configuration
  private supabaseUrl: string = "";
  private supabaseAnonKey: string = "";
  private isConfigured: boolean = false;
  private isDev: boolean = process.env.NODE_ENV === "development";

  constructor() {
    if (typeof window !== "undefined") {
      this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      this.supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      this.isConfigured = Boolean(this.supabaseUrl && this.supabaseAnonKey);

      // Initialize local cross-tab communication
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

  // --- Deduplication Helper ---

  private isDuplicateEvent(eventId: string): boolean {
    if (!eventId) return false;
    const now = Date.now();
    if (this.processedEventIds.has(eventId)) {
      return true;
    }
    this.processedEventIds.set(eventId, now);

    // Evict old entries (> 30s) if cache exceeds 200 items
    if (this.processedEventIds.size > 200) {
      for (const [id, ts] of this.processedEventIds.entries()) {
        if (now - ts > 30000) {
          this.processedEventIds.delete(id);
        }
      }
    }
    return false;
  }

  // --- Connection State Management ---

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
      this.connectionState = newState;
      if (this.isDev) {
        console.log(`[Realtime] State changed -> ${newState}`);
      }
      this.stateListeners.forEach((fn) => {
        try {
          fn(newState);
        } catch (e) {
          console.error("[Realtime] Error in state listener:", e);
        }
      });
    }
  }

  // --- Lifecycle: Connect / Disconnect ---

  public connect() {
    if (typeof window === "undefined") return;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (!this.isConfigured) {
      // Graceful fallback: If Supabase keys are not set, remain in DISCONNECTED or local mode
      if (this.isDev) {
        console.info(
          "[Realtime] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set. Running in local multi-tab sync mode."
        );
      }
      this.setState("CONNECTED");
      return;
    }

    this.setState(this.reconnectAttempts > 0 ? "RECONNECTING" : "CONNECTING");

    try {
      // Build Supabase Realtime WebSocket URL
      const cleanUrl = this.supabaseUrl.replace(/^http/, "ws");
      const wsUrl = `${cleanUrl}/realtime/v1/websocket?apikey=${encodeURIComponent(
        this.supabaseAnonKey
      )}&vsn=1.0.0`;

      // Connection timeout handler (8000ms)
      if (this.connectionTimeoutTimer) clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
          if (this.isDev) console.warn("[Realtime] Connection timeout reached (8s). Aborting and scheduling retry.");
          try {
            this.socket.close();
          } catch (e) {}
          this.socket = null;
          this.setState("ERROR");
          this.scheduleReconnect();
        }
      }, 8000);

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        if (this.connectionTimeoutTimer) {
          clearTimeout(this.connectionTimeoutTimer);
          this.connectionTimeoutTimer = null;
        }
        const wasReconnecting = this.reconnectAttempts > 0 || this.connectionState === "RECONNECTING";
        this.reconnectAttempts = 0;
        this.setState("CONNECTED");
        this.startHeartbeat();
        this.resubscribeAllChannels();

        if (wasReconnecting) {
          if (this.isDev) console.log("[Realtime] Reconnection established -> Triggering state catch-up");
          this.reconnectListeners.forEach((fn) => {
            try {
              fn();
            } catch (err) {
              console.error("[Realtime] Error in reconnect catch-up listener:", err);
            }
          });
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingSocketMessage(data);
        } catch (err) {
          if (this.isDev) console.warn("[Realtime] Failed to parse socket message:", err);
        }
      };

      this.socket.onerror = (err) => {
        if (this.isDev) console.warn("[Realtime] WebSocket error:", err);
        this.setState("ERROR");
      };

      this.socket.onclose = (ev) => {
        if (this.connectionTimeoutTimer) {
          clearTimeout(this.connectionTimeoutTimer);
          this.connectionTimeoutTimer = null;
        }
        this.stopHeartbeat();
        this.socket = null;
        if (this.connectionState !== "DISCONNECTED") {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      if (this.isDev) console.warn("[Realtime] Connection initiation error:", err);
      this.setState("ERROR");
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;

    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
        // ignore
      }
      this.socket = null;
    }
    this.setState("DISCONNECTED");
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.isDev) console.warn("[Realtime] Max reconnect attempts reached. Remaining in local multi-tab mode.");
      this.setState("DISCONNECTED");
      return;
    }

    this.setState("RECONNECTING");
    this.reconnectAttempts++;
    const jitter = Math.floor(Math.random() * 400);
    const delay = Math.min(this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1) + jitter, 10000);

    if (this.isDev) console.log(`[Realtime] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(
            JSON.stringify({
              topic: "phoenix",
              event: "heartbeat",
              payload: {},
              ref: Date.now().toString(),
            })
          );
        } catch (e) {
          // ignore
        }
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // --- Channel Joining & Subscriptions ---

  public subscribe(channel: string, onEvent: RealtimeWildcardHandler): RealtimeSubscription {
    if (!this.channelHandlers.has(channel)) {
      this.channelHandlers.set(channel, new Set());
      this.joinChannelOnServer(channel);
    }

    this.channelHandlers.get(channel)!.add(onEvent);

    // Auto-connect if not connected
    if (this.connectionState === "DISCONNECTED") {
      this.connect();
    }

    return {
      channel,
      unsubscribe: () => {
        const handlers = this.channelHandlers.get(channel);
        if (handlers) {
          handlers.delete(onEvent);
          if (handlers.size === 0) {
            this.channelHandlers.delete(channel);
            this.leaveChannelOnServer(channel);
          }
        }
      },
    };
  }

  public subscribeEvent<T extends RealtimeEventType>(
    channel: string,
    eventType: T,
    handler: RealtimeEventHandler<T>
  ): RealtimeSubscription {
    const key = `${channel}:${eventType}`;
    if (!this.eventHandlers.has(key)) {
      this.eventHandlers.set(key, new Set());
    }
    this.eventHandlers.get(key)!.add(handler);

    // Ensure channel itself is subscribed
    const baseSub = this.subscribe(channel, (ev) => {
      if (ev.type === eventType) {
        handler(ev as RealtimeEvent<T>);
      }
    });

    return {
      channel,
      unsubscribe: () => {
        baseSub.unsubscribe();
        const handlers = this.eventHandlers.get(key);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this.eventHandlers.delete(key);
          }
        }
      },
    };
  }

  private joinChannelOnServer(channel: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const joinMsg = {
        topic: `realtime:${channel}`,
        event: "phx_join",
        payload: {
          config: {
            broadcast: { ack: false, self: false },
            postgres_changes: [],
          },
        },
        ref: Date.now().toString(),
      };
      this.socket.send(JSON.stringify(joinMsg));
      if (this.isDev) console.log(`[Realtime] Joined channel topic: realtime:${channel}`);
    }
  }

  private leaveChannelOnServer(channel: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const leaveMsg = {
        topic: `realtime:${channel}`,
        event: "phx_leave",
        payload: {},
        ref: Date.now().toString(),
      };
      this.socket.send(JSON.stringify(leaveMsg));
      if (this.isDev) console.log(`[Realtime] Left channel topic: realtime:${channel}`);
    }
  }

  private resubscribeAllChannels() {
    for (const channel of this.channelHandlers.keys()) {
      this.joinChannelOnServer(channel);
    }
  }

  // --- Broadcast & Event Ingestion ---

  public broadcast<T extends RealtimeEventType>(
    channel: string,
    type: T,
    payload: any,
    metadata?: { workspaceId?: string; projectId?: string; taskId?: string; actorId?: string }
  ) {
    const event: RealtimeEvent<T> = {
      id: `rt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      workspaceId: metadata?.workspaceId || channel.replace(/^workspace:/, ""),
      projectId: metadata?.projectId,
      taskId: metadata?.taskId,
      actorId: metadata?.actorId,
      timestamp: new Date().toISOString(),
      payload,
    };

    // 1. Dispatch locally in this browser tab
    this.dispatchToLocalListeners(channel, event);

    // 2. Broadcast to other browser tabs via BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          channel,
          event,
          senderTabId: this.tabId,
        });
      } catch (e) {
        // ignore
      }
    }

    // 3. Broadcast to remote WebSocket server if connected
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        const msg = {
          topic: `realtime:${channel}`,
          event: "broadcast",
          payload: {
            type: "broadcast",
            event: type,
            payload: event,
          },
          ref: Date.now().toString(),
        };
        this.socket.send(JSON.stringify(msg));
      } catch (e) {
        if (this.isDev) console.warn("[Realtime] Failed to send WebSocket broadcast:", e);
      }
    }
  }

  private handleIncomingSocketMessage(data: any) {
    if (!data || !data.topic) return;

    // Phoenix / Supabase Realtime format: topic = "realtime:workspace:xxx"
    const channel = data.topic.replace(/^realtime:/, "");

    if (data.event === "broadcast" && data.payload?.payload) {
      const event = data.payload.payload as RealtimeEvent;
      this.dispatchToLocalListeners(channel, event);
    } else if (data.event === "postgres_changes" && data.payload?.data) {
      // Postgres CDC fallback format
      const cdc = data.payload.data;
      const eventType = (cdc.type ? `DB_${cdc.type}` : "DB_CHANGE") as RealtimeEventType;
      const event: RealtimeEvent = {
        id: `cdc_${Date.now()}`,
        type: eventType,
        workspaceId: cdc.record?.workspace_id || cdc.record?.workspaceId || "",
        projectId: cdc.record?.project_id || cdc.record?.projectId,
        taskId: cdc.record?.id,
        timestamp: new Date().toISOString(),
        payload: cdc.record,
      };
      this.dispatchToLocalListeners(channel, event);
    }
  }

  private dispatchToLocalListeners(channel: string, event: RealtimeEvent) {
    if (!event || !event.type) return;

    // Deduplication check
    if (event.id && this.isDuplicateEvent(event.id)) {
      if (this.isDev) {
        console.log(`[Realtime] Duplicate event suppressed: ${event.id} (${event.type})`);
      }
      return;
    }

    if (this.isDev) {
      console.log(`[Realtime] Received event on [${channel}]:`, event.type, event.payload);
    }

    // 1. Direct channel wildcard handlers
    const handlers = this.channelHandlers.get(channel);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error("[Realtime] Error in channel handler:", err);
        }
      });
    }

    // 2. Global wildcard channel handlers ("*")
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

    // 3. Specific event handlers (e.g. "workspace:ws_123:TASK_CREATED")
    const eventKey = `${channel}:${event.type}`;
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

    // 4. Global typed event handlers (e.g. "*:TASK_CREATED")
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
