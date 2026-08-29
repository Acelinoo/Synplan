import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/workspaces - Fetch all workspaces
export async function GET() {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        projects: {
          select: { id: true, name: true, progress: true, status: true },
        },
        _count: {
          select: { projects: true, tasks: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: workspaces,
    });
  } catch (error: any) {
    console.error("GET /api/workspaces error:", error?.message);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch workspaces",
      },
      { status: 500 }
    );
  }
}

// POST /api/workspaces - Create a new workspace
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, slug, ownerId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Workspace name is required" },
        { status: 400 }
      );
    }

    const cleanSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Check if slug is already taken
    const existingSlug = await prisma.workspace.findUnique({
      where: { slug: cleanSlug },
    });

    if (existingSlug) {
      return NextResponse.json(
        { success: false, error: "Workspace slug already exists. Please pick a unique slug." },
        { status: 409 }
      );
    }

    // Default owner fallback if none provided
    let effectiveOwnerId = ownerId;
    if (!effectiveOwnerId) {
      const defaultUser = await prisma.user.findFirst();
      if (!defaultUser) {
        const newUser = await prisma.user.create({
          data: {
            name: "Acelino (Marchelino K.)",
            email: "acelino@synplan.dev",
            role: "OWNER",
          },
        });
        effectiveOwnerId = newUser.id;
      } else {
        effectiveOwnerId = defaultUser.id;
      }
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        slug: cleanSlug,
        ownerId: effectiveOwnerId,
        members: {
          create: {
            userId: effectiveOwnerId,
            role: "OWNER",
            workloadScore: 20,
          },
        },
        auditLogs: {
          create: {
            actorId: effectiveOwnerId,
            action: "WORKSPACE_CREATE",
            target: `Workspace "${name.trim()}" created`,
          },
        },
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: workspace,
        message: "Workspace created successfully",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/workspaces error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create workspace",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
