import { z } from "zod";

/**
 * Enums matching Prisma Database Schema definitions
 */
export const RoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export const ProjectStatusSchema = z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]);
export const TaskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"]);
export const TaskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const HexColorSchema = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, "Color must be a valid hex code (e.g. #0284C7)");

/**
 * ============================================================================
 * 1. PROJECT SCHEMAS
 * ============================================================================
 */
export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(100, "Project name cannot exceed 100 characters"),
  description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").optional().nullable(),
  color: HexColorSchema.optional().default("#0284C7"),
  deadline: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  status: ProjectStatusSchema.optional().default("ACTIVE"),
  memberIds: z.array(z.string()).optional().default([]),
  workspaceId: z.string().optional(), // Authorized workspaceId overrides this
});

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name cannot be empty").max(100, "Project name cannot exceed 100 characters").optional(),
  description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").optional().nullable(),
  color: HexColorSchema.optional(),
  deadline: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  status: ProjectStatusSchema.optional(),
  memberIds: z.array(z.string()).optional(),
  workspaceId: z.string().optional(),
});

/**
 * ============================================================================
 * 2. TASK SCHEMAS
 * ============================================================================
 */
export const SubtaskInputSchema = z.object({
  title: z.string().trim().min(1, "Subtask title cannot be empty").max(200, "Subtask title cannot exceed 200 characters"),
  completed: z.boolean().optional().default(false),
});

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200, "Task title cannot exceed 200 characters"),
  description: z.string().trim().max(2000, "Description cannot exceed 2000 characters").optional().nullable(),
  status: TaskStatusSchema.optional().default("TODO"),
  priority: TaskPrioritySchema.optional().default("MEDIUM"),
  projectId: z.string().optional(),
  phaseId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  tags: z.array(z.string().trim().max(30)).max(10, "Maximum 10 tags allowed").optional().default([]),
  subtasks: z.array(SubtaskInputSchema).optional().default([]),
  workspaceId: z.string().optional(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().trim().min(1, "Task title cannot be empty").max(200, "Task title cannot exceed 200 characters").optional(),
  description: z.string().trim().max(2000, "Description cannot exceed 2000 characters").optional().nullable(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  projectId: z.string().optional(),
  phaseId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  tags: z.array(z.string().trim().max(30)).max(10).optional(),
  order: z.number().int().min(0).optional(),
  workspaceId: z.string().optional(),
});

export const UpdateTaskStatusSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  status: TaskStatusSchema,
  actorId: z.string().optional(),
});

export const CreateTaskCommentSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty").max(2000, "Comment cannot exceed 2000 characters"),
});

/**
 * ============================================================================
 * 3. PHASE SCHEMAS
 * ============================================================================
 */
export const CreatePhaseSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  name: z.string().trim().min(1, "Phase name is required").max(100, "Phase name cannot exceed 100 characters"),
  description: z.string().trim().max(500, "Description cannot exceed 500 characters").optional().nullable(),
  order: z.number().int().min(0).optional().default(0),
  workspaceId: z.string().optional(),
});

export const UpdatePhaseSchema = z.object({
  name: z.string().trim().min(1, "Phase name cannot be empty").max(100, "Phase name cannot exceed 100 characters").optional(),
  description: z.string().trim().max(500, "Description cannot exceed 500 characters").optional().nullable(),
  order: z.number().int().min(0).optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
});

export const ReorderPhasesSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  phaseOrders: z.array(
    z.object({
      id: z.string().min(1, "Phase id is required"),
      order: z.number().int().min(0),
    })
  ).min(1, "At least one phase order item is required"),
  workspaceId: z.string().optional(),
});

/**
 * ============================================================================
 * 4. WORKSPACE SCHEMAS
 * ============================================================================
 */
export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(100, "Workspace name cannot exceed 100 characters"),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase alphanumeric characters and dashes").optional(),
});

export const UpdateWorkspaceSettingsSchema = z.object({
  workspaceId: z.string().optional(),
  name: z.string().trim().min(1, "Workspace name cannot be empty").max(100, "Workspace name cannot exceed 100 characters").optional(),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase alphanumeric characters and dashes").optional(),
  logoUrl: z.string().url("Invalid URL format").optional().nullable(),
});

/**
 * ============================================================================
 * 5. TEAM MEMBERS SCHEMAS
 * ============================================================================
 */
export const InviteMemberSchema = z.object({
  workspaceId: z.string().optional(),
  name: z.string().trim().min(1, "Member name is required").max(100, "Name cannot exceed 100 characters"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  role: RoleSchema.optional().default("MEMBER"),
});

export const UpdateMemberRoleSchema = z.object({
  memberId: z.string().min(1, "memberId is required"),
  role: RoleSchema,
});

/**
 * ============================================================================
 * 6. SEARCH & NOTIFICATION SCHEMAS
 * ============================================================================
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().max(200, "Search query too long").optional().default(""),
  workspaceId: z.string().optional(),
});

export const MarkNotificationSchema = z.object({
  id: z.string().optional(),
  markAll: z.boolean().optional(),
});

/**
 * ============================================================================
 * 7. AI ASSISTANT SCHEMAS
 * ============================================================================
 */
export const AiPlanRequestSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(2000, "Prompt exceeds 2000 character limit"),
  mode: z.enum(["STRICT", "SMART"]).optional().default("STRICT"),
  conversationId: z.string().optional(),
  currentProjectId: z.string().optional(),
  currentPhaseId: z.string().optional(),
  currentTaskId: z.string().optional(),
  currentMemberId: z.string().optional(),
  currentView: z.string().optional(),
  activePath: z.string().optional(),
  conversationHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(2000),
    })
  ).max(20, "Maximum 20 conversation turns allowed").optional(),
  pendingClarification: z.any().optional(),
});

export const AiExecuteRequestSchema = z.object({
  plan: z.record(z.string(), z.any()).refine((p) => p && typeof p === "object" && p.id && Array.isArray(p.actions), {
    message: "Invalid AI plan payload structure",
  }),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  planFingerprint: z.string().optional(),
  idempotencyKey: z.string().optional(),
  conversationId: z.string().optional(),
});
