import { Role } from "@prisma/client";
import { Permission } from "@/lib/permissions";
import { ActionRiskLevel } from "@/lib/ai/types";

export type SlashCommandCategory =
  | "create"
  | "edit"
  | "delete"
  | "assign"
  | "move"
  | "status"
  | "priority"
  | "plan"
  | "general";

export type SlashArgumentType =
  | "entity_task"
  | "entity_project"
  | "entity_phase"
  | "entity_member"
  | "enum_status"
  | "enum_priority"
  | "text"
  | "date"
  | "none";

/**
 * Recursive tree node representing a slash command or nested subcommand.
 */
export interface SlashCommandNode {
  name: string;
  label?: string;
  description: string;
  aliases?: string[];
  category?: SlashCommandCategory;
  icon?: string;
  subcommands?: SlashCommandNode[];
  argumentType?: SlashArgumentType;
  argumentPlaceholder?: string;
  requiredPermission?: Permission;
  requiredRole?: Role;
  riskLevel?: ActionRiskLevel;
  isDestructive?: boolean;
  /**
   * Convert parsed command arguments to canonical natural language intent for the Phase 2-4 AI Action Engine.
   */
  toNaturalLanguage?: (args: Record<string, string>, context?: SlashAutocompleteContext) => string;
}

/**
 * An autocomplete suggestion rendered in the UI dropdown.
 */
export interface SlashSuggestion {
  id: string;
  name: string;
  label: string;
  description: string;
  icon?: string;
  type: "command" | "subcommand" | "entity" | "enum" | "custom";
  value: string;
  badge?: string;
  category?: string;
  argumentType?: SlashArgumentType;
  previewPrompt?: string;
  disabled?: boolean;
  disabledReason?: string;
  metadata?: Record<string, any>;
}

/**
 * Result of parsing a slash command input string.
 */
export interface ParsedSlashCommand {
  isSlashCommand: boolean;
  raw: string;
  tokens: string[];
  rootCommand: string | null;
  subcommandPath: string[];
  activeNode: SlashCommandNode | null;
  args: Record<string, string>;
  entityTarget?: string;
  naturalLanguagePrompt: string | null;
  isValid: boolean;
  isComplete: boolean;
  error?: string;
  warning?: string;
}

/**
 * Workspace data context passed to the slash autocomplete and parser engines.
 */
export interface SlashAutocompleteContext {
  userRole: Role;
  permissions?: readonly Permission[];
  projects: {
    id: string;
    name: string;
    status?: string;
    totalTasks?: number;
    deadline?: string | null;
  }[];
  tasks: {
    id: string;
    title: string;
    projectId: string;
    phaseId?: string | null;
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
  }[];
  phases: {
    id: string;
    name: string;
    projectId: string;
    order?: number;
  }[];
  members: {
    id: string;
    userId: string;
    name: string;
    role: Role;
    email?: string | null;
  }[];
  currentProjectId?: string;
  currentTaskId?: string;
}
