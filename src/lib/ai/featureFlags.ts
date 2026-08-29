/**
 * SYNPLAN — AI Assistant Feature Flags & Configuration
 * Controls availability and safety boundaries of AI capabilities.
 */

export interface AiFeatureFlags {
  AI_ASSISTANT_ENABLED: boolean;
  AI_PROJECT_CREATION_ENABLED: boolean;
  AI_TASK_COMMANDS_ENABLED: boolean;
  AI_AUTO_EXECUTION_ENABLED: boolean;
  AI_AUDIT_LOG_ENABLED: boolean;
}

export function getAiFeatureFlags(): AiFeatureFlags {
  return {
    AI_ASSISTANT_ENABLED: process.env.AI_ASSISTANT_ENABLED !== "false",
    AI_PROJECT_CREATION_ENABLED: process.env.AI_PROJECT_CREATION_ENABLED !== "false",
    AI_TASK_COMMANDS_ENABLED: process.env.AI_TASK_COMMANDS_ENABLED !== "false",
    AI_AUTO_EXECUTION_ENABLED: process.env.AI_AUTO_EXECUTION_ENABLED === "true", // Default false: requires confirmation
    AI_AUDIT_LOG_ENABLED: process.env.AI_AUDIT_LOG_ENABLED !== "false",
  };
}
