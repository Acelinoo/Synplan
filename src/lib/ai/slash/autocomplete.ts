import { hasPermission } from "@/lib/permissions";
import { SLASH_COMMAND_REGISTRY } from "./registry";
import {
  SlashCommandNode,
  SlashSuggestion,
  SlashAutocompleteContext,
} from "./types";
import { tokenizeSlashInput } from "./parser";

/**
 * Get progressive, hierarchical autocomplete suggestions for the Slash Command System.
 * Respects workspace tenant boundary, user RBAC permissions, and current project context.
 */
export function getSlashSuggestions(
  input: string,
  context: SlashAutocompleteContext
): SlashSuggestion[] {
  const trimmed = input.trimStart();

  // 1. Guardrail: Must start with '/' to trigger command suggestions
  if (!trimmed.startsWith("/")) {
    return [];
  }

  // Guardrail: Normal URLs containing '/' (e.g. https://example.com) must NOT trigger commands
  if (trimmed.startsWith("//") || trimmed.startsWith("/http:") || trimmed.startsWith("/https:")) {
    return [];
  }

  const hasTrailingSpace = input.endsWith(" ");
  const rawTokens = tokenizeSlashInput(trimmed);

  // =========================================================================
  // LEVEL 0: Root Commands (User typed "/" or "/de" or "/create")
  // =========================================================================
  if (rawTokens.length === 0 || (rawTokens.length === 1 && !hasTrailingSpace)) {
    const query = rawTokens.length > 0 ? rawTokens[0].replace(/^\//, "").toLowerCase() : "";

    return SLASH_COMMAND_REGISTRY.filter((node) => {
      if (!query) return true;
      const matchName = node.name.toLowerCase().startsWith(query);
      const matchAlias = node.aliases?.some((a) => a.toLowerCase().startsWith(query));
      return matchName || matchAlias;
    }).map((node) => {
      const isAllowed = node.requiredPermission
        ? hasPermission(context.userRole, node.requiredPermission)
        : true;

      return {
        id: `root_${node.name}`,
        name: node.name,
        label: `/${node.name}`,
        description: node.description,
        icon: node.icon || "Command",
        type: "command",
        value: `/${node.name} `,
        badge: node.isDestructive ? "Destructive" : node.riskLevel,
        category: node.category,
        disabled: !isAllowed,
        disabledReason: !isAllowed
          ? `Peran ${context.userRole} tidak memiliki izin '${node.requiredPermission}'.`
          : undefined,
      };
    });
  }

  // =========================================================================
  // LEVEL 1+: Nested Subcommands & Entity Resolution
  // =========================================================================
  const rootName = rawTokens[0].replace(/^\//, "").toLowerCase();
  const rootNode = SLASH_COMMAND_REGISTRY.find(
    (n) => n.name.toLowerCase() === rootName || n.aliases?.some((a) => a.toLowerCase() === rootName)
  );

  if (!rootNode) {
    return [];
  }

  // Walk the command tree to find the current active node
  let currentNode: SlashCommandNode = rootNode;
  const visitedNodes: SlashCommandNode[] = [rootNode];
  let tokenIdx = 1;

  // Determine if user is typing the next token or finishing the previous
  const activeTokenCount = hasTrailingSpace ? rawTokens.length : rawTokens.length - 1;

  while (tokenIdx < activeTokenCount && currentNode.subcommands && currentNode.subcommands.length > 0) {
    const candidate = rawTokens[tokenIdx].toLowerCase();
    const matchingChild = currentNode.subcommands.find(
      (sub) => sub.name.toLowerCase() === candidate || sub.aliases?.some((a) => a.toLowerCase() === candidate)
    );
    if (matchingChild) {
      currentNode = matchingChild;
      visitedNodes.push(matchingChild);
      tokenIdx++;
    } else {
      break;
    }
  }

  // Query filter for the token currently being typed (if no trailing space)
  const currentTypingQuery = !hasTrailingSpace && rawTokens.length > tokenIdx
    ? rawTokens[rawTokens.length - 1].toLowerCase()
    : "";

  // If the typed token is an exact match for a child subcommand that accepts arguments,
  // automatically advance into that child node so entity suggestions are visible immediately!
  if (!hasTrailingSpace && currentNode.subcommands && currentNode.subcommands.length > 0 && currentTypingQuery) {
    const exactChild = currentNode.subcommands.find(
      (sub) => sub.name.toLowerCase() === currentTypingQuery || sub.aliases?.some((a) => a.toLowerCase() === currentTypingQuery)
    );
    if (exactChild && exactChild.argumentType && exactChild.argumentType !== "none") {
      currentNode = exactChild;
      visitedNodes.push(exactChild);
      tokenIdx++;
    }
  }

  const baseCommandPrefix = `/${visitedNodes.map((n) => n.name).join(" ")}`;

  // -------------------------------------------------------------------------
  // Case A: Current node has subcommands to display
  // -------------------------------------------------------------------------
  if (currentNode.subcommands && currentNode.subcommands.length > 0) {
    return currentNode.subcommands
      .filter((sub) => {
        if (!currentTypingQuery) return true;
        const matchName = sub.name.toLowerCase().startsWith(currentTypingQuery);
        const matchAlias = sub.aliases?.some((a) => a.toLowerCase().startsWith(currentTypingQuery));
        return matchName || matchAlias;
      })
      .map((sub) => {
        const isAllowed = sub.requiredPermission
          ? hasPermission(context.userRole, sub.requiredPermission)
          : true;

        return {
          id: `sub_${visitedNodes.map((n) => n.name).join("_")}_${sub.name}`,
          name: sub.name,
          label: sub.label || sub.name,
          description: sub.description,
          icon: sub.icon || "ChevronRight",
          type: "subcommand",
          value: `${baseCommandPrefix} ${sub.name} `,
          badge: sub.isDestructive ? "Destructive" : sub.riskLevel,
          disabled: !isAllowed,
          disabledReason: !isAllowed
            ? `Peran ${context.userRole} tidak memiliki izin '${sub.requiredPermission}'.`
            : undefined,
        };
      });
  }

  // -------------------------------------------------------------------------
  // Case B: Current node requires Entity / Enum / Date Arguments
  // -------------------------------------------------------------------------
  const remainingTokens = rawTokens.slice(tokenIdx);
  const argType = currentNode.argumentType;

  // 1. Task Entity Selection
  if (argType === "entity_task") {
    // If user already typed the task name and there is a secondary argument (e.g. member for assign, phase for move, status, priority)
    const taskTokenCount = remainingTokens.length;
    const hasSelectedTask = hasTrailingSpace ? taskTokenCount >= 1 : taskTokenCount >= 2;

    if (hasSelectedTask) {
      const selectedTaskTitle = remainingTokens[0].toLowerCase();
      const matchedTask = context.tasks.find(
        (t) => t.title.toLowerCase() === selectedTaskTitle || t.title.toLowerCase().includes(selectedTaskTitle)
      );

      // Check if command is /assign (requires Member selection)
      if (rootNode.name === "assign" || visitedNodes.some((n) => n.name === "assignee")) {
        const memberQuery = !hasTrailingSpace && remainingTokens.length > 1 ? remainingTokens[remainingTokens.length - 1].toLowerCase() : "";
        return context.members
          .filter((m) => !memberQuery || m.name.toLowerCase().includes(memberQuery) || m.email?.toLowerCase().includes(memberQuery))
          .map((m) => ({
            id: `mem_${m.id}`,
            name: m.name,
            label: m.name,
            description: `${m.email || m.name} · Role: ${m.role}`,
            icon: "User",
            type: "entity",
            value: `${baseCommandPrefix} "${remainingTokens[0]}" ${m.name}`,
            badge: m.role,
            category: "Squad Member",
          }));
      }

      // Check if command is /move (requires Phase selection)
      if (rootNode.name === "move" || visitedNodes.some((n) => n.name === "phase")) {
        const phaseQuery = !hasTrailingSpace && remainingTokens.length > 1 ? remainingTokens[remainingTokens.length - 1].toLowerCase() : "";
        const targetProjectId = matchedTask?.projectId || context.currentProjectId;
        const validPhases = context.phases.filter((p) => !targetProjectId || p.projectId === targetProjectId);

        return validPhases
          .filter((p) => !phaseQuery || p.name.toLowerCase().includes(phaseQuery))
          .map((p) => ({
            id: `ph_${p.id}`,
            name: p.name,
            label: p.name,
            description: `Fase alur kerja (Order: ${p.order || 1})`,
            icon: "Layers",
            type: "entity",
            value: `${baseCommandPrefix} "${remainingTokens[0]}" "${p.name}"`,
            badge: "Phase",
            category: "Project Phase",
          }));
      }

      // Check if command is /status
      if (rootNode.name === "status" || visitedNodes.some((n) => n.name === "status")) {
        const statuses = [
          { value: "TODO", label: "TODO", desc: "Belum dimulai" },
          { value: "IN_PROGRESS", label: "IN PROGRESS", desc: "Sedang dikerjakan" },
          { value: "IN_REVIEW", label: "IN REVIEW", desc: "Dalam peninjauan QA/Lead" },
          { value: "DONE", label: "DONE", desc: "Selesai tuntas" },
          { value: "BLOCKED", label: "BLOCKED", desc: "Terhalang kendala/dependensi" },
        ];
        const statusQuery = !hasTrailingSpace && remainingTokens.length > 1 ? remainingTokens[remainingTokens.length - 1].toLowerCase() : "";
        return statuses
          .filter((s) => !statusQuery || s.value.toLowerCase().includes(statusQuery) || s.desc.toLowerCase().includes(statusQuery))
          .map((s) => ({
            id: `st_${s.value}`,
            name: s.value,
            label: s.label,
            description: s.desc,
            icon: "CheckSquare",
            type: "enum",
            value: `${baseCommandPrefix} "${remainingTokens[0]}" ${s.value}`,
            badge: s.value,
            category: "Status",
          }));
      }

      // Check if command is /priority
      if (rootNode.name === "priority" || visitedNodes.some((n) => n.name === "priority")) {
        const priorities = [
          { value: "LOW", label: "LOW", desc: "Prioritas rendah" },
          { value: "MEDIUM", label: "MEDIUM", desc: "Prioritas normal" },
          { value: "HIGH", label: "HIGH", desc: "Prioritas tinggi" },
          { value: "URGENT", label: "URGENT", desc: "Kritis / mendesak" },
        ];
        const prioQuery = !hasTrailingSpace && remainingTokens.length > 1 ? remainingTokens[remainingTokens.length - 1].toLowerCase() : "";
        return priorities
          .filter((p) => !prioQuery || p.value.toLowerCase().includes(prioQuery))
          .map((p) => ({
            id: `prio_${p.value}`,
            name: p.value,
            label: p.label,
            description: p.desc,
            icon: "AlertTriangle",
            type: "enum",
            value: `${baseCommandPrefix} "${remainingTokens[0]}" ${p.value}`,
            badge: p.value,
            category: "Priority",
          }));
      }
    }

    // Default: Show list of Tasks in workspace (prioritizing current project)
    const taskQuery = currentTypingQuery;
    const sortedTasks = [...context.tasks].sort((a, b) => {
      if (context.currentProjectId) {
        if (a.projectId === context.currentProjectId && b.projectId !== context.currentProjectId) return -1;
        if (a.projectId !== context.currentProjectId && b.projectId === context.currentProjectId) return 1;
      }
      return a.title.localeCompare(b.title);
    });

    return sortedTasks
      .filter((t) => !taskQuery || t.title.toLowerCase().includes(taskQuery))
      .slice(0, 15) // Limit to top 15 matches for snappy UI response
      .map((t) => {
        const proj = context.projects.find((p) => p.id === t.projectId);
        const projLabel = proj ? ` [${proj.name}]` : "";
        return {
          id: `tsk_${t.id}`,
          name: t.title,
          label: t.title,
          description: `Status: ${t.status || "TODO"} · Priority: ${t.priority || "MEDIUM"}${projLabel}`,
          icon: "CheckSquare",
          type: "entity",
          value: `${baseCommandPrefix} "${t.title}" `,
          badge: t.status || "TODO",
          category: proj?.name || "Workspace Task",
        };
      });
  }

  // 2. Project Entity Selection
  if (argType === "entity_project") {
    const projQuery = currentTypingQuery;
    return context.projects
      .filter((p) => !projQuery || p.name.toLowerCase().includes(projQuery))
      .map((p) => ({
        id: `prj_${p.id}`,
        name: p.name,
        label: p.name,
        description: `Status: ${p.status || "ACTIVE"} · Tasks: ${p.totalTasks || 0}${p.deadline ? ` · Deadline: ${p.deadline.split("T")[0]}` : ""}`,
        icon: "FolderKanban",
        type: "entity",
        value: `${baseCommandPrefix} "${p.name}" `,
        badge: p.status || "ACTIVE",
        category: "Project",
      }));
  }

  // 3. Phase Entity Selection
  if (argType === "entity_phase") {
    const phaseQuery = currentTypingQuery;
    const validPhases = context.currentProjectId
      ? context.phases.filter((p) => p.projectId === context.currentProjectId)
      : context.phases;

    return validPhases
      .filter((p) => !phaseQuery || p.name.toLowerCase().includes(phaseQuery))
      .map((p) => {
        const proj = context.projects.find((pr) => pr.id === p.projectId);
        return {
          id: `ph_${p.id}`,
          name: p.name,
          label: p.name,
          description: `Fase alur kerja (Project: ${proj?.name || "Workspace"})`,
          icon: "Layers",
          type: "entity",
          value: `${baseCommandPrefix} "${p.name}" `,
          badge: "Phase",
          category: proj?.name || "Phase",
        };
      });
  }

  // 4. Member Entity Selection
  if (argType === "entity_member") {
    const memQuery = currentTypingQuery;
    return context.members
      .filter((m) => !memQuery || m.name.toLowerCase().includes(memQuery) || m.email?.toLowerCase().includes(memQuery))
      .map((m) => ({
        id: `mem_${m.id}`,
        name: m.name,
        label: m.name,
        description: `${m.email || m.name} · Peran: ${m.role}`,
        icon: "User",
        type: "entity",
        value: `${baseCommandPrefix} ${m.name} `,
        badge: m.role,
        category: "Squad Member",
      }));
  }

  // 5. Enum Status Selection
  if (argType === "enum_status") {
    const statuses = [
      { value: "TODO", label: "TODO", desc: "Belum dimulai" },
      { value: "IN_PROGRESS", label: "IN PROGRESS", desc: "Sedang dikerjakan" },
      { value: "IN_REVIEW", label: "IN REVIEW", desc: "Dalam peninjauan QA/Lead" },
      { value: "DONE", label: "DONE", desc: "Selesai tuntas" },
      { value: "BLOCKED", label: "BLOCKED", desc: "Terhalang kendala/dependensi" },
    ];
    return statuses
      .filter((s) => !currentTypingQuery || s.value.toLowerCase().includes(currentTypingQuery))
      .map((s) => ({
        id: `st_${s.value}`,
        name: s.value,
        label: s.label,
        description: s.desc,
        icon: "CheckSquare",
        type: "enum",
        value: `${baseCommandPrefix} ${s.value}`,
        badge: s.value,
        category: "Status",
      }));
  }

  // 6. Enum Priority Selection
  if (argType === "enum_priority") {
    const priorities = [
      { value: "LOW", label: "LOW", desc: "Prioritas rendah" },
      { value: "MEDIUM", label: "MEDIUM", desc: "Prioritas normal" },
      { value: "HIGH", label: "HIGH", desc: "Prioritas tinggi" },
      { value: "URGENT", label: "URGENT", desc: "Kritis / mendesak" },
    ];
    return priorities
      .filter((p) => !currentTypingQuery || p.value.toLowerCase().includes(currentTypingQuery))
      .map((p) => ({
        id: `prio_${p.value}`,
        name: p.value,
        label: p.label,
        description: p.desc,
        icon: "AlertTriangle",
        type: "enum",
        value: `${baseCommandPrefix} ${p.value}`,
        badge: p.value,
        category: "Priority",
      }));
  }

  return [];
}
