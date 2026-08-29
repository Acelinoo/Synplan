# SYNPLAN — PHASE 15: GOOGLE & GITHUB AUTHENTICATION

> **Status**: IMPLEMENTED & AUTOMATED TESTS PASSED  
> **Date**: 2026-08-30  
> **Environment**: Next.js 15 App Router, Prisma ORM, PostgreSQL (Supabase), TypeScript  

---

## 1. Overview & Architecture

Synplan enforces an **OAuth-Only Authentication Standard** supporting Google and GitHub. It deliberately omits password storage, password resets, and email verification to maximize user account security and reduce credential leakage vulnerabilities.

### Authentication Flow Architecture
```text
User Browser
    │
    ├── [ Continue with Google ] ──► /api/auth/login/google (Sets CSRF State Cookie)
    │                                         │
    └── [ Continue with GitHub ] ──► /api/auth/login/github (Sets CSRF State Cookie)
                                              │
                                              ▼
                                 OAuth Provider Authorization
                                              │
                                              ▼
                                 /api/auth/callback/{provider}
                                              │
                                ┌─────────────┴─────────────┐
                                ▼                           ▼
                     Existing Synplan User?       New Synplan User?
                                │                           │
                       Link Provider Account        Create User + Default Workspace
                                └─────────────┬─────────────┘
                                              ▼
                                   Create Database Session
                                              │
                                   Set HttpOnly Cookie
                                (synplan_session_token)
                                              │
                                              ▼
                                    Redirect to / (Dashboard)
```

---

## 2. Supported OAuth Providers

### 2.1 Google OAuth 2.0
* **Authorization URL**: `https://accounts.google.com/o/oauth2/v2/auth`
* **Token Exchange**: `https://oauth2.googleapis.com/token`
* **User Profile**: `https://www.googleapis.com/oauth2/v3/userinfo`
* **Scopes**: `openid email profile`
* **Local Callback URL**: `http://localhost:3000/api/auth/callback/google`

### 2.2 GitHub OAuth App
* **Authorization URL**: `https://github.com/login/oauth/authorize`
* **Token Exchange**: `https://github.com/login/oauth/access_token`
* **User Profile & Emails**: `https://api.github.com/user`, `https://api.github.com/user/emails`
* **Scopes**: `read:user user:email`
* **Local Callback URL**: `http://localhost:3000/api/auth/callback/github`

---

## 3. User Identity & Account Linking Policy

Synplan unifies identities under a single internal `User` record:
```text
Synplan User (id, name, email, avatarUrl, role)
    │
    ├── Account 1: Google OAuth (provider: "google", providerAccountId: "sub-12345")
    │
    └── Account 2: GitHub OAuth (provider: "github", providerAccountId: "id-67890")
```

### Safe Account Linking Invariants:
1. **Existing Provider Match**: If an `Account` record with `(provider, providerAccountId)` exists, the session is created directly for that user.
2. **Verified Email Match**: If a user logs in via GitHub with the same verified email address as an existing Google user (or vice versa), the new `Account` is safely linked to the existing `User` identity without creating duplicate accounts or losing workspace access.
3. **New User Initialization**: If no matching `Account` or `User` email exists, a new `User` is created along with an initial personal workspace (`"${name}'s Workspace"`) and assigned role `OWNER`.

---

## 4. Session Lifecycle & Storage

* **Session Model (`model Session`)**: Stores `id`, `sessionToken` (cryptographically random 64 hex characters), `userId`, `expiresAt` (30 days), `createdAt`, `updatedAt`.
* **Cookie Configuration**:
  * Name: `synplan_session_token`
  * Flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (in production).
* **Validation & Auto-Cleanup**:
  * Validated server-side via `validateSessionToken(token)`.
  * Expired sessions are automatically deleted from the database.
* **Logout (`POST /api/auth/logout`)**:
  * Deletes the session token from the database.
  * Clears the `synplan_session_token` cookie with `maxAge: 0`.

---

## 5. Auth Guard & RBAC Protection

`requireAuthGuard(req, requiredRole)` enforces the following pipeline:
```text
Request
   ↓
Cookie/Header Session Token
   ↓
validateSessionToken (Prisma Database Verification)
   ↓
Authenticated User Identity
   ↓
Workspace Membership Check (where: { workspaceId, userId })
   ↓
RBAC Hierarchy Check (OWNER > ADMIN > MEMBER > VIEWER)
   ↓
Route / AI Execution
```

---

## 6. Environment Variables

Add the following to your `.env` file:

```env
# Google OAuth 2.0 (Phase 15)
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# GitHub OAuth App (Phase 15)
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

---

## 7. Manual Configuration Guide (Google & GitHub)

### 7.1 Google Cloud Console Setup
1. Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials** $\rightarrow$ **OAuth client ID**.
3. Select Application type: **Web application**.
4. Set Name: `Synplan Local Dev`.
5. Under **Authorized redirect URIs**, add:
   `http://localhost:3000/api/auth/callback/google`
6. Click **Create** and copy:
   - Client ID $\rightarrow$ `GOOGLE_CLIENT_ID`
   - Client Secret $\rightarrow$ `GOOGLE_CLIENT_SECRET`

### 7.2 GitHub Developer Settings Setup
1. Open [GitHub Developer Settings](https://github.com/settings/developers).
2. Under **OAuth Apps**, click **New OAuth App**.
3. Set Application name: `Synplan Local`.
4. Set Homepage URL: `http://localhost:3000`.
5. Set **Authorization callback URL**:
   `http://localhost:3000/api/auth/callback/github`
6. Click **Register application**.
7. Copy **Client ID** $\rightarrow$ `GITHUB_CLIENT_ID`.
8. Click **Generate a new client secret** and copy $\rightarrow$ `GITHUB_CLIENT_SECRET`.

---

## 8. Automated Test Results

* **Auth Test Suite**: [`scripts/test-auth-oauth.ts`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/scripts/test-auth-oauth.ts) (46/46 passed, 100.0%)
* **Cumulative Automated Assertions**: **592 / 592 passed (100.0%)**
* **TypeScript Diagnostics**: `npx tsc --noEmit` (0 errors)
* **Production Build**: `npm run build` (All routes clean)
