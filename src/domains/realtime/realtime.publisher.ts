import { RealtimeEnvelope } from "./realtime.types";
import { RealtimeChannels } from "./realtime.channels";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type BroadcastTransport = (channel: string, event: RealtimeEnvelope) => Promise<boolean>;

export class RealtimePublisher {
  private static supabaseClient: SupabaseClient | null = null;
  private static customTransport: BroadcastTransport | null = null;

  /**
   * Overrides transport mechanism (used in automated test suites).
   */
  static setTransport(transport: BroadcastTransport | null): void {
    this.customTransport = transport;
  }

  private static getClient(): SupabaseClient | null {
    if (this.supabaseClient) return this.supabaseClient;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) return null;

    try {
      this.supabaseClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return this.supabaseClient;
    } catch {
      return null;
    }
  }

  /**
   * Server-side non-blocking broadcast.
   * Dispatches to `workspace:{workspaceId}` and `project:{projectId}` if applicable.
   * A failure NEVER throws or rolls back database transactions.
   */
  static async publish(envelope: RealtimeEnvelope): Promise<boolean> {
    try {
      if (!envelope.workspaceId) {
        console.warn("[RealtimePublisher] Refusing to publish: No workspaceId in envelope");
        return false;
      }

      const workspaceChannel = RealtimeChannels.getWorkspaceChannel(envelope.workspaceId);

      // 1. Custom/Mock Transport (for tests or local buses)
      if (this.customTransport) {
        const successWs = await this.customTransport(workspaceChannel, envelope).catch(() => false);
        if (envelope.projectId) {
          const projectChannel = RealtimeChannels.getProjectChannel(envelope.projectId);
          await this.customTransport(projectChannel, envelope).catch(() => false);
        }
        return successWs;
      }

      // 2. Supabase Realtime Broadcast
      const supabase = this.getClient();
      if (!supabase) {
        return true; // Graceful fallback when Supabase is not configured
      }

      const channel = supabase.channel(workspaceChannel);
      await channel.send({
        type: "broadcast",
        event: envelope.type,
        payload: envelope,
      });
      await supabase.removeChannel(channel);

      // If project-scoped, also broadcast to the dedicated project channel
      if (envelope.projectId) {
        const projectChannelName = RealtimeChannels.getProjectChannel(envelope.projectId);
        const pChannel = supabase.channel(projectChannelName);
        await pChannel.send({
          type: "broadcast",
          event: envelope.type,
          payload: envelope,
        });
        await supabase.removeChannel(pChannel);
      }

      return true;
    } catch (err: any) {
      // Non-fatal broadcast warning
      console.warn(`[RealtimePublisher] Non-fatal broadcast failure for [${envelope.type}]:`, err?.message || err);
      return false;
    }
  }
}
