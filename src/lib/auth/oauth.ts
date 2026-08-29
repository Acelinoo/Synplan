import crypto from "crypto";
import { OAuthUserProfile } from "./types";

/**
 * Returns the base application URL configured in environment or default localhost
 */
export function getAppBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

/**
 * Generates a cryptographically secure random state token for OAuth CSRF protection
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Builds the Google OAuth authorization URL
 */
export function getGoogleAuthorizationUrl(state: string, redirectUri?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const callbackUrl = redirectUri || `${getAppBaseUrl()}/api/auth/callback/google`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Builds the GitHub OAuth authorization URL
 */
export function getGitHubAuthorizationUrl(state: string, redirectUri?: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID || "";
  const callbackUrl = redirectUri || `${getAppBaseUrl()}/api/auth/callback/github`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: "read:user user:email",
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges Google authorization code for tokens and user profile
 */
export async function exchangeGoogleCode(code: string, redirectUri?: string): Promise<OAuthUserProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = redirectUri || `${getAppBaseUrl()}/api/auth/callback/google`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not configured in environment variables.");
  }

  // 1. Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errorData = await tokenRes.text();
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${errorData}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const idToken = tokenData.id_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in;

  // 2. Fetch User Profile using Access Token
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    throw new Error(`Failed to fetch Google user profile: ${profileRes.statusText}`);
  }

  const profile = await profileRes.json();

  if (!profile.email) {
    throw new Error("Google account does not have an associated email address.");
  }

  return {
    provider: "google",
    providerAccountId: profile.sub,
    email: profile.email.toLowerCase().trim(),
    name: profile.name || profile.given_name || profile.email.split("@")[0],
    avatarUrl: profile.picture || null,
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
    idToken,
  };
}

/**
 * Exchanges GitHub authorization code for tokens and user profile
 */
export async function exchangeGitHubCode(code: string, redirectUri?: string): Promise<OAuthUserProfile> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl = redirectUri || `${getAppBaseUrl()}/api/auth/callback/github`;

  if (!clientId || !clientSecret) {
    throw new Error("GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is not configured in environment variables.");
  }

  // 1. Exchange authorization code for tokens
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
    }),
  });

  if (!tokenRes.ok) {
    const errorData = await tokenRes.text();
    throw new Error(`GitHub token exchange failed (${tokenRes.status}): ${errorData}`);
  }

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    throw new Error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
  }

  const accessToken = tokenData.access_token;
  const tokenType = tokenData.token_type;
  const scope = tokenData.scope;

  // 2. Fetch User Profile
  const profileRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "Synplan-App",
      Accept: "application/vnd.github+json",
    },
  });

  if (!profileRes.ok) {
    throw new Error(`Failed to fetch GitHub user profile: ${profileRes.statusText}`);
  }

  const profile = await profileRes.json();
  let email = profile.email;

  // If primary public email is null, fetch from user/emails endpoint
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Synplan-App",
        Accept: "application/vnd.github+json",
      },
    });

    if (emailsRes.ok) {
      const emails: Array<{ email: string; primary: boolean; verified: boolean }> = await emailsRes.json();
      const primaryEmail = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
      if (primaryEmail) {
        email = primaryEmail.email;
      }
    }
  }

  if (!email) {
    throw new Error("Could not retrieve a verified email address from GitHub account.");
  }

  return {
    provider: "github",
    providerAccountId: String(profile.id),
    email: email.toLowerCase().trim(),
    name: profile.name || profile.login || email.split("@")[0],
    avatarUrl: profile.avatar_url || null,
    accessToken,
    tokenType,
    scope,
  };
}
