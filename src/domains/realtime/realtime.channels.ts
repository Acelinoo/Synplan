/**
 * SYNPLAN 2.0 — Realtime Channel Architecture
 *
 * Enforces stable, scoped channels:
 * - workspace:{workspaceId}
 * - project:{projectId}
 *
 * Micro-channels (e.g. task-event-123) are strictly prohibited.
 */

export class RealtimeChannels {
  static getWorkspaceChannel(workspaceId: string): string {
    if (!workspaceId) throw new Error("Invalid channel: workspaceId is required");
    return `workspace:${workspaceId}`;
  }

  static getProjectChannel(projectId: string): string {
    if (!projectId) throw new Error("Invalid channel: projectId is required");
    return `project:${projectId}`;
  }

  static parseChannel(channelName: string): { type: "workspace" | "project"; id: string } | null {
    if (!channelName || typeof channelName !== "string") return null;

    const parts = channelName.split(":");
    if (parts.length !== 2) return null;

    const [type, id] = parts;
    if (type === "workspace" || type === "project") {
      return { type, id };
    }

    return null;
  }
}
