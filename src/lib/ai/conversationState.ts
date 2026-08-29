import { ClarificationState } from "./types";

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  planId?: string;
  timestamp: string;
}

export interface ConversationSession {
  sessionId: string;
  workspaceId: string;
  userId: string;
  lastActiveProjectId?: string;
  lastActiveProjectName?: string;
  pendingClarification?: ClarificationState;
  turns: ConversationTurn[];
  updatedAt: number;
}

const sessionStore = new Map<string, ConversationSession>();

export function getOrCreateSession(sessionId: string, workspaceId: string, userId: string): ConversationSession {
  let session = sessionStore.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      workspaceId,
      userId,
      turns: [],
      updatedAt: Date.now(),
    };
    sessionStore.set(sessionId, session);
  }
  return session;
}

export function updateSessionContext(
  sessionId: string,
  updates: { lastActiveProjectId?: string; lastActiveProjectName?: string }
): void {
  const session = sessionStore.get(sessionId);
  if (session) {
    if (updates.lastActiveProjectId) session.lastActiveProjectId = updates.lastActiveProjectId;
    if (updates.lastActiveProjectName) session.lastActiveProjectName = updates.lastActiveProjectName;
    session.updatedAt = Date.now();
  }
}

export function setSessionPendingClarification(
  sessionId: string,
  clarification: ClarificationState | undefined
): void {
  const session = sessionStore.get(sessionId);
  if (session) {
    session.pendingClarification = clarification;
    session.updatedAt = Date.now();
  }
}

export function getSessionPendingClarification(sessionId: string): ClarificationState | undefined {
  const session = sessionStore.get(sessionId);
  return session?.pendingClarification;
}

export function clearSessionPendingClarification(sessionId: string): void {
  const session = sessionStore.get(sessionId);
  if (session) {
    session.pendingClarification = undefined;
    session.updatedAt = Date.now();
  }
}

export function addSessionTurn(
  sessionId: string,
  turn: Omit<ConversationTurn, "id" | "timestamp">
): void {
  const session = sessionStore.get(sessionId);
  if (session) {
    session.turns.push({
      ...turn,
      id: `turn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    });
    // Keep max 20 recent turns
    if (session.turns.length > 20) {
      session.turns = session.turns.slice(-20);
    }
    session.updatedAt = Date.now();
  }
}
