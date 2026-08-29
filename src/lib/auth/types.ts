import { Role, User, Account, Session } from "@prisma/client";

export interface OAuthUserProfile {
  provider: "google" | "github";
  providerAccountId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  idToken?: string;
}

export interface SessionValidationResult {
  session: Session;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface AuthApiResponse {
  authenticated: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: Role;
  };
  workspaces?: Array<{
    id: string;
    name: string;
    slug: string;
    role: Role;
  }>;
}
