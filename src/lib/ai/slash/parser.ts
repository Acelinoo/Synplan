import { SLASH_COMMAND_REGISTRY } from "./registry";
import { SlashCommandNode, ParsedSlashCommand, SlashAutocompleteContext } from "./types";

/**
 * Tokenize input string supporting quoted segments and preserving spaces inside quotes.
 */
export function tokenizeSlashInput(input: string): string[] {
  const tokens: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else {
      tokens.push(match[0]);
    }
  }
  return tokens;
}

/**
 * Deterministic Slash Command Parser.
 * Tokenizes, walks the generic command tree, checks validity without guessing,
 * and maps valid commands to canonical natural language for the Phase 2-4 Action Engine.
 */
export function parseSlashCommand(
  input: string,
  context?: SlashAutocompleteContext
): ParsedSlashCommand {
  const trimmed = input.trim();

  // 1. Trigger Check: Must start strictly with '/'
  if (!trimmed.startsWith("/")) {
    return {
      isSlashCommand: false,
      raw: input,
      tokens: [],
      rootCommand: null,
      subcommandPath: [],
      activeNode: null,
      args: {},
      naturalLanguagePrompt: null,
      isValid: false,
      isComplete: false,
    };
  }

  // Edge Case: Check for URL-like strings (e.g. /http or /https or //)
  if (trimmed.startsWith("//") || trimmed.startsWith("/http:") || trimmed.startsWith("/https:")) {
    return {
      isSlashCommand: false,
      raw: input,
      tokens: [],
      rootCommand: null,
      subcommandPath: [],
      activeNode: null,
      args: {},
      naturalLanguagePrompt: null,
      isValid: false,
      isComplete: false,
    };
  }

  const rawTokens = tokenizeSlashInput(trimmed);
  if (rawTokens.length === 0) {
    return {
      isSlashCommand: true,
      raw: input,
      tokens: [],
      rootCommand: null,
      subcommandPath: [],
      activeNode: null,
      args: {},
      naturalLanguagePrompt: null,
      isValid: false,
      isComplete: false,
    };
  }

  // 2. Extract Root Command Token
  const firstToken = rawTokens[0];
  const rootName = firstToken.startsWith("/") ? firstToken.slice(1).toLowerCase() : firstToken.toLowerCase();

  // Find Root Command Node in Registry
  const rootNode = SLASH_COMMAND_REGISTRY.find(
    (node) =>
      node.name.toLowerCase() === rootName ||
      (node.aliases && node.aliases.some((a) => a.toLowerCase() === rootName))
  );

  if (!rootNode) {
    return {
      isSlashCommand: true,
      raw: input,
      tokens: rawTokens,
      rootCommand: rootName,
      subcommandPath: [],
      activeNode: null,
      args: {},
      naturalLanguagePrompt: null,
      isValid: false,
      isComplete: false,
      error: `Perintah tidak dikenal '/${rootName}'. Ketik '/' untuk melihat daftar perintah yang tersedia.`,
    };
  }

  // 3. Recursive Tree Traversal for Subcommands
  let currentNode: SlashCommandNode = rootNode;
  const subcommandPath: string[] = [];
  let tokenIndex = 1;

  while (tokenIndex < rawTokens.length && currentNode.subcommands && currentNode.subcommands.length > 0) {
    const candidateToken = rawTokens[tokenIndex].toLowerCase();
    const matchingSub = currentNode.subcommands.find(
      (sub) =>
        sub.name.toLowerCase() === candidateToken ||
        (sub.aliases && sub.aliases.some((a) => a.toLowerCase() === candidateToken))
    );

    if (matchingSub) {
      currentNode = matchingSub;
      subcommandPath.push(matchingSub.name);
      tokenIndex++;
    } else {
      // If candidateToken does NOT match any known subcommand at this level:
      // Check if current node accepts arguments (e.g. entity name) or if this is an invalid subcommand
      if (!currentNode.argumentType || currentNode.argumentType === "none") {
        const validOptions = currentNode.subcommands.map((s) => s.name).join(", ");
        return {
          isSlashCommand: true,
          raw: input,
          tokens: rawTokens,
          rootCommand: rootNode.name,
          subcommandPath,
          activeNode: currentNode,
          args: {},
          naturalLanguagePrompt: null,
          isValid: false,
          isComplete: false,
          error: `Subcommand '${rawTokens[tokenIndex]}' tidak valid untuk /${[rootNode.name, ...subcommandPath].join(" ")}. Pilihan yang tersedia: ${validOptions}.`,
        };
      }
      // If the node itself accepts arguments, break subcommand traversal and treat as arguments
      break;
    }
  }

  // 4. Collect Remaining Tokens as Arguments
  const remainingTokens = rawTokens.slice(tokenIndex);
  const args: Record<string, string> = {};

  if (remainingTokens.length > 0) {
    const rawArgText = remainingTokens.join(" ");
    args.text = rawArgText;

    if (currentNode.argumentType) {
      if (currentNode.argumentType === "entity_task") {
        // May contain task title followed by second argument (e.g. member, phase, status, priority, date, or new title)
        if (remainingTokens.length === 1) {
          args.entity_task = remainingTokens[0];
          args.task = remainingTokens[0];
        } else {
          // Check if last token is enum status or priority or date or member
          const lastToken = remainingTokens[remainingTokens.length - 1];
          const secondLastToken = remainingTokens.slice(0, remainingTokens.length - 1).join(" ");
          
          const isStatus = ["todo", "in_progress", "in_review", "done", "blocked"].includes(lastToken.toLowerCase());
          const isPriority = ["low", "medium", "high", "urgent"].includes(lastToken.toLowerCase());

          if (isStatus) {
            args.entity_task = secondLastToken;
            args.task = secondLastToken;
            args.enum_status = lastToken.toUpperCase();
            args.status = lastToken.toUpperCase();
          } else if (isPriority) {
            args.entity_task = secondLastToken;
            args.task = secondLastToken;
            args.enum_priority = lastToken.toUpperCase();
            args.priority = lastToken.toUpperCase();
          } else if (subcommandPath.includes("assignee") || rootNode.name === "assign") {
            args.entity_task = secondLastToken;
            args.task = secondLastToken;
            args.entity_member = lastToken;
            args.member = lastToken;
          } else if (subcommandPath.includes("phase") || rootNode.name === "move") {
            args.entity_task = secondLastToken;
            args.task = secondLastToken;
            args.entity_phase = lastToken;
            args.phase = lastToken;
          } else if (subcommandPath.includes("deadline")) {
            args.entity_task = secondLastToken;
            args.task = secondLastToken;
            args.date = lastToken;
          } else if (subcommandPath.includes("title")) {
            args.entity_task = secondLastToken;
            args.task = secondLastToken;
            args.title = lastToken;
          } else {
            args.entity_task = rawArgText;
            args.task = rawArgText;
          }
        }
      } else if (currentNode.argumentType === "entity_project") {
        if (remainingTokens.length > 1 && (subcommandPath.includes("name") || subcommandPath.includes("deadline"))) {
          args.entity_project = remainingTokens[0];
          args.project = remainingTokens[0];
          if (subcommandPath.includes("name")) {
            args.name = remainingTokens.slice(1).join(" ");
          } else if (subcommandPath.includes("deadline")) {
            args.date = remainingTokens.slice(1).join(" ");
          }
        } else {
          args.entity_project = rawArgText;
          args.project = rawArgText;
        }
      } else if (currentNode.argumentType === "entity_phase") {
        if (remainingTokens.length > 1 && subcommandPath.includes("name")) {
          args.entity_phase = remainingTokens[0];
          args.phase = remainingTokens[0];
          args.name = remainingTokens.slice(1).join(" ");
        } else {
          args.entity_phase = rawArgText;
          args.phase = rawArgText;
        }
      } else if (currentNode.argumentType === "entity_member") {
        args.entity_member = rawArgText;
        args.member = rawArgText;
      } else if (currentNode.argumentType === "enum_status") {
        args.enum_status = rawArgText.toUpperCase();
        args.status = rawArgText.toUpperCase();
      } else if (currentNode.argumentType === "enum_priority") {
        args.enum_priority = rawArgText.toUpperCase();
        args.priority = rawArgText.toUpperCase();
      } else if (currentNode.argumentType === "date") {
        args.date = rawArgText;
      }
    }
  }

  // 5. Check Completeness & Convert to Natural Language Prompt
  let isComplete = false;
  let naturalLanguagePrompt: string | null = null;

  // Node is complete if it has a toNaturalLanguage function and meets required args
  if (currentNode.toNaturalLanguage) {
    // If node requires subcommands but user didn't provide one, it's incomplete
    const hasRemainingSubcommands = currentNode.subcommands && currentNode.subcommands.length > 0;
    if (!hasRemainingSubcommands) {
      if (currentNode.argumentType && currentNode.argumentType !== "none") {
        if (Object.keys(args).length > 0) {
          isComplete = true;
          naturalLanguagePrompt = currentNode.toNaturalLanguage(args, context);
        }
      } else {
        isComplete = true;
        naturalLanguagePrompt = currentNode.toNaturalLanguage(args, context);
      }
    }
  }

  return {
    isSlashCommand: true,
    raw: input,
    tokens: rawTokens,
    rootCommand: rootNode.name,
    subcommandPath,
    activeNode: currentNode,
    args,
    naturalLanguagePrompt,
    isValid: true,
    isComplete,
  };
}
