import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { SessionValidationResult } from "./types";

export const SESSION_COOKIE_NAME = "synplan_session_token";
export const OAUTH_STATE_COOKIE_NAME = "synplan_oauth_state";
export const SESSION_DURATION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60;

/**
 * Generates a cryptographically random session token (64 hex characters)
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Creates a persistent database session for the given user ID
 */
export async function createSession(userId: string) {
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expiresAt,
    },
  });

  return { sessionToken, expiresAt, session };
}

/**
 * Validates a session token against the database.
 * If expired, automatically cleans up the expired record and returns null.
 */
export async function validateSessionToken(token: string): Promise<SessionValidationResult | null> {
  if (!token || typeof token !== "string" || token.length < 16) {
    return null;
  }

  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Check if session has expired
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return {
      session: {
        id: session.id,
        sessionToken: session.sessionToken,
        userId: session.userId,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      user: session.user,
    };
  } catch (error) {
    console.error("validateSessionToken error:", error);
    return null;
  }
}

/**
 * Invalidates a single session by token (used on Logout)
 */
export async function invalidateSession(token: string): Promise<void> {
  if (!token) return;
  try {
    await prisma.session.deleteMany({
      where: { sessionToken: token },
    });
  } catch (error) {
    console.error("invalidateSession error:", error);
  }
}

/**
 * Invalidates all active sessions for a given user
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await prisma.session.deleteMany({
      where: { userId },
    });
  } catch (error) {
    console.error("invalidateAllUserSessions error:", error);
  }
}

/**
 * Returns standard cookie options for the session token
 */
export function getSessionCookieOptions(isProduction: boolean = process.env.NODE_ENV === "production") {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
