import { RealtimeEventType, RealtimeEvent, RealtimeEventPayloadMap } from "@/types/realtime";
import { AuthContext } from "@/lib/authGuard";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let serverSupabaseClient: SupabaseClient | null = null;

function getServerSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  if (!serverSupabaseClient) {
    serverSupabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverSupabaseClient;
}

export interface PublishOptions {
  projectId?: string;
  taskId?: string;
  actorId?: string;
}

/**
 * Server-authoritative event publisher for Synplan.
 * Guarantees workspace isolation, builds immutable event envelopes, and publishes
 * to Supabase Realtime Broadcast.
 *
 * CRITICAL RULE: Failures in broadcast are caught and logged as non-blocking warnings.
 * A broadcast failure NEVER throws or causes a database transaction rollback.
 */
export async function publishWorkspaceEvent<T extends RealtimeEventType>(
  authOrWorkspaceId: AuthContext | string,
  eventType: T,
  payload: RealtimeEventPayloadMap[T],
  options?: PublishOptions
): Promise<boolean> {
  try {
    let workspaceId: string;
    let actorId: string | undefined = options?.actorId;

    if (typeof authOrWorkspaceId === "string") {
      workspaceId = authOrWorkspaceId;
    } else {
      workspaceId = authOrWorkspaceId.workspaceId;
      actorId = actorId || authOrWorkspaceId.userId;
    }

    if (!workspaceId || workspaceId === "undefined") {
      console.warn("[RealtimeServer] Refusing to publish: No valid workspaceId provided");
      return false;
    }

    const uniqueId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const eventEnvelope: RealtimeEvent<T> = {
      id: uniqueId,
      eventId: uniqueId,
      type: eventType,
      workspaceId,
      projectId: options?.projectId,
      taskId: options?.taskId,
      actorId,
      timestamp: new Date().toISOString(),
      payload,
    };

    const supabase = getServerSupabase();
    if (!supabase) {
      // Graceful fallback when Supabase is not yet configured
      return true;
    }

    const channelName = `workspace:${workspaceId}`;
    const channel = supabase.channel(channelName);

    await channel.send({
      type: "broadcast",
      event: eventType,
      payload: eventEnvelope,
    });

    await supabase.removeChannel(channel);

    return true;
  } catch (err: any) {
    // Non-blocking failure: Log warning but do not throw
    console.warn(`[RealtimeServer] Non-fatal broadcast failure for [${eventType}]:`, err?.message || err);
    return false;
  }
}
