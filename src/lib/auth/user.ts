import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { OAuthUserProfile } from "./types";

/**
 * Finds an existing user or creates a new one from an OAuth profile.
 * Follows safe identity linking principles:
 * 1. Matches existing OAuth Account record (provider + providerAccountId).
 * 2. If no Account exists, checks for existing User with the same verified email.
 *    - If found: links new OAuth Account to existing Synplan User identity.
 * 3. If no User exists: creates new User + default Workspace + workspace owner membership.
 */
export async function findOrCreateOAuthUser(profile: OAuthUserProfile) {
  const { provider, providerAccountId, email, name, avatarUrl, accessToken, refreshToken, expiresAt, tokenType, scope, idToken } = profile;

  // 1. Check if OAuth Account already exists
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },
    include: {
      user: true,
    },
  });

  if (existingAccount) {
    // Update token details if they changed
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: {
        accessToken: accessToken ?? existingAccount.accessToken,
        refreshToken: refreshToken ?? existingAccount.refreshToken,
        expiresAt: expiresAt ?? existingAccount.expiresAt,
        tokenType: tokenType ?? existingAccount.tokenType,
        scope: scope ?? existingAccount.scope,
        idToken: idToken ?? existingAccount.idToken,
      },
    }).catch((err) => console.warn("Failed to update account tokens:", err));

    // Update avatar if currently missing
    if (avatarUrl && !existingAccount.user.avatarUrl) {
      await prisma.user.update({
        where: { id: existingAccount.user.id },
        data: { avatarUrl },
      }).catch((err) => console.warn("Failed to update user avatar:", err));
    }

    return {
      user: existingAccount.user,
      isNewUser: false,
      account: existingAccount,
    };
  }

  // 2. Check if a Synplan User exists with the same verified email
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    // Link the new OAuth provider to this existing verified user identity
    const newAccount = await prisma.account.create({
      data: {
        userId: existingUserByEmail.id,
        type: "oauth",
        provider,
        providerAccountId,
        accessToken,
        refreshToken,
        expiresAt,
        tokenType,
        scope,
        idToken,
      },
    });

    // Update avatar if currently null
    if (avatarUrl && !existingUserByEmail.avatarUrl) {
      await prisma.user.update({
        where: { id: existingUserByEmail.id },
        data: { avatarUrl },
      }).catch(() => {});
    }

    return {
      user: existingUserByEmail,
      isNewUser: false,
      account: newAccount,
    };
  }

  // 3. New User Registration Flow:
  // Create User, default personal Workspace, WorkspaceMember as OWNER, and Account
  const cleanName = name?.trim() || email.split("@")[0];
  const user = await prisma.user.create({
    data: {
      name: cleanName,
      email,
      avatarUrl: avatarUrl || null,
      role: Role.OWNER,
    },
  });

  // Create default workspace for new user
  const wsSlugBase = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const uniqueSlug = `${wsSlugBase}-${Math.random().toString(36).substring(2, 7)}`;

  const workspace = await prisma.workspace.create({
    data: {
      name: `${cleanName}'s Workspace`,
      slug: uniqueSlug,
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
          role: Role.OWNER,
          workloadScore: 0,
        },
      },
    },
  });

  // Create linked Account record
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      type: "oauth",
      provider,
      providerAccountId,
      accessToken,
      refreshToken,
      expiresAt,
      tokenType,
      scope,
      idToken,
    },
  });

  return {
    user,
    isNewUser: true,
    account,
    workspace,
  };
}
