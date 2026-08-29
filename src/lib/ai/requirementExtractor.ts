import { ExplicitProjectConstraints } from "./types";
import { resolveNaturalDate } from "./dateResolver";

/**
 * Extracts explicit structural requirements from user prompts.
 * Used by Strict Mode validator and Planner to prevent unauthorized AI expansion
 * and faithfully extract markdown-structured project definitions.
 */
export function extractExplicitRequirements(prompt: string, serverTime?: string): ExplicitProjectConstraints {
  const clean = prompt.trim();

  let exactProjectName: string | undefined = undefined;
  let exactPhaseCount: number | undefined = undefined;
  const exactPhaseNames: string[] = [];
  let exactTaskCount: number | undefined = undefined;
  const exactTaskTitles: string[] = [];
  const structuredTasks: Array<{
    title: string;
    phaseName?: string;
    assigneeName?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  }> = [];
  let exactDeadline: string | undefined = undefined;
  const exactMembers: string[] = [];

  // 1. Extract Explicit Project Name
  // e.g. "bernama **StepUp Sandals**", "bernama 'StepUp Sandals'", "bernama StepUp Sandals", "nama project: StepUp Sandals"
  const bernamaMatch = clean.match(
    /(?:bernama|berjudul|nama(?:nya)?|named|titled)\s+[*"']{0,2}([^*"'.,\n\r]+?)[*"']{0,2}(?:\.|\n|\r|,|\s+dengan|\s+deadline|\s+fase|\s+phase|$)/i
  );
  if (bernamaMatch && bernamaMatch[1]) {
    const candidateName = bernamaMatch[1].replace(/[*_"`]/g, "").trim();
    if (candidateName.length > 1 && !["project", "projek", "proyek", "website", "web"].includes(candidateName.toLowerCase())) {
      exactProjectName = candidateName;
    }
  }

  // 2. Extract Explicit Phase Count (e.g., "3 phase", "3 fase", "tepat 4 fase", "4 delivery phases")
  const phaseCountMatch = clean.match(/(?:dengan\s+|tepat\s+)?(?:\*\*)?([0-9]{1,2})(?:\*\*)?\s+(?:delivery\s+)?(?:phase|phases|fase|tahapan)/i);
  if (phaseCountMatch && phaseCountMatch[1]) {
    exactPhaseCount = parseInt(phaseCountMatch[1], 10);
  }

  // 3. Extract Explicit Phase Names
  // Pattern A: Numbered/Bulleted list under Phase section
  const phaseBlockMatch = clean.match(
    /(?:###\s*)?(?:phases?|fase\s+project|fase|tahapan)\s*(?:[:\n]|\s*(?:tepat\s+)?(?:\*\*)?[0-9]{1,2}\s+(?:fase|phase|tahapan)(?:\*\*)?\s*[:\n])\s*((?:(?:\d+\.|\-|\*|\•)\s*[^\n]+\n?)+)/i
  );
  if (phaseBlockMatch && phaseBlockMatch[1]) {
    const lines = phaseBlockMatch[1].split("\n");
    for (const l of lines) {
      const pName = l.replace(/^(?:\d+\.|\-|\*|\•)\s*/, "").replace(/[*_"`]/g, "").trim();
      if (pName && !pName.toLowerCase().startsWith("task") && !pName.toLowerCase().startsWith("tugas") && !pName.toLowerCase().startsWith("jangan")) {
        if (!exactPhaseNames.includes(pName)) {
          exactPhaseNames.push(pName);
        }
      }
    }
  }

  // Pattern B: Inline comma/colon separated (e.g. "3 phase: Planning, Design, Development" or "fase Planning, Design dan Testing")
  if (exactPhaseNames.length === 0) {
    const inlinePhaseMatch = clean.match(
      /(?:(?:dengan\s+)?[0-9]{1,2}\s+)?(?:phase|fase|tahapan)(?:\s*:\s*|\s+adalah\s+|\s+yaitu\s+)([^.\n]+?)(?:\.|\n|Planning:|Design:|Development:|Testing:|Deployment:|$)/i
    );
    if (inlinePhaseMatch && inlinePhaseMatch[1]) {
      const rawParts = inlinePhaseMatch[1].split(/,|\s+dan\s+|\s+and\s+/i);
      for (const part of rawParts) {
        const pName = part.replace(/^(?:\d+\.|\-|\*)\s*/, "").replace(/[*_"`]/g, "").trim();
        if (pName && pName.length > 1 && !["dan", "and", "dengan", "deadline", "task", "tugas"].includes(pName.toLowerCase())) {
          if (!exactPhaseNames.includes(pName)) {
            exactPhaseNames.push(pName);
          }
        }
      }
    }
  }

  if (exactPhaseNames.length > 0) {
    exactPhaseCount = exactPhaseNames.length;
  }

  // 4. Extract Explicit Team Members
  // Pattern A: Bulleted list under Tim / Team section (e.g. "* **Acelino** — Project Manager")
  const timSectionMatch = clean.match(/(?:###\s*)?(?:tim|team|anggota\s+tim|members?)\s*[:\n]\s*((?:(?:\*|\-|\•|\d+\.)\s*[^\n]+\n?)+)/i);
  if (timSectionMatch && timSectionMatch[1]) {
    const lines = timSectionMatch[1].split("\n");
    for (const l of lines) {
      const cleanLine = l.replace(/^(?:\*|\-|\•|\d+\.)\s*/, "").trim();
      const memberNameMatch = cleanLine.match(/^[*_"`]{0,2}([A-Za-z0-9\s]+?)[*_"`]{0,2}(?:\s*[-—:]|\s+sebagai|\s+as|$)/i);
      if (memberNameMatch && memberNameMatch[1]) {
        const mName = memberNameMatch[1].trim();
        if (mName && mName.length > 1 && !["tim", "team", "anggota", "member", "gunakan"].includes(mName.toLowerCase())) {
          if (!exactMembers.includes(mName)) {
            exactMembers.push(mName);
          }
        }
      }
    }
  }

  // Pattern B: Inline member block (e.g. "tambahkan Andi, Sarah, Budi ke tim")
  if (exactMembers.length === 0) {
    const memberBlockMatch = clean.match(/(?:tambahkan|tambah|libatkan|masukkan|anggota|member|serta)\s+([^.\n]+?)(?:\s+ke\s+tim|\s+ke\s+team|\s+ikut|\s+sebagai|\.|\n|$)/i);
    if (memberBlockMatch && memberBlockMatch[1]) {
      const rawMembers = memberBlockMatch[1].split(/,|\s+dan\s+|\s+and\s+|\s+serta\s+/i);
      for (const rm of rawMembers) {
        const name = rm.replace(/[*_"`]/g, "").trim();
        if (
          name &&
          name.length > 0 &&
          !["project", "projek", "proyek", "website", "web", "phase", "fase", "tugas", "task", "tim", "team", "ini", "ke", "dan", "and", "serta"].includes(name.toLowerCase())
        ) {
          if (!exactMembers.includes(name)) {
            exactMembers.push(name);
          }
        }
      }
    }
  }

  // 5. Extract Structured Tasks Grouped by Phase (e.g. "**Planning**\n* Analisis kebutuhan website — Acelino")
  const phaseNamesToCheck = exactPhaseNames.length > 0
    ? exactPhaseNames
    : ["Planning", "UI/UX Design", "Design", "Development", "Testing & Launch", "Testing", "Deployment"];

  // Split document by lines
  const allLines = clean.split("\n");
  let currentActivePhase: string | undefined = undefined;

  for (const rawLine of allLines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check if this line is a Phase header (e.g. "**Planning**", "### Planning", "1. Planning")
    const cleanedHeader = line.replace(/^(?:###|##|#|\d+\.)\s*/, "").replace(/[*_"`:]/g, "").trim();
    const matchedPhase = phaseNamesToCheck.find(
      (p) => p.toLowerCase() === cleanedHeader.toLowerCase() || cleanedHeader.toLowerCase().startsWith(p.toLowerCase())
    );

    if (matchedPhase) {
      currentActivePhase = matchedPhase;
      continue;
    }

    // Check if this line is a task under the active phase (e.g. "* Analisis kebutuhan website — Acelino")
    if (line.startsWith("*") || line.startsWith("-") || line.startsWith("•") || /^\d+\./.test(line)) {
      const taskBody = line.replace(/^(?:\*|\-|\•|\d+\.)\s*/, "").trim();
      if (taskBody.length > 2) {
        // Check if there is an assignee denoted by "—", "-", or ":"
        const assigneeMatch = taskBody.match(/^(.+?)\s*(?:[-—:]|\s+assignee:\s*|\s+ke\s+)\s*([A-Za-z0-9\s]+)$/);
        let taskTitle = taskBody;
        let assigneeName: string | undefined = undefined;

        if (assigneeMatch && assigneeMatch[1] && assigneeMatch[2]) {
          const possibleAssignee = assigneeMatch[2].replace(/[*_"`]/g, "").trim();
          const isKnownMember = exactMembers.some((m) => m.toLowerCase() === possibleAssignee.toLowerCase());
          if (isKnownMember || exactMembers.length === 0) {
            taskTitle = assigneeMatch[1].replace(/[*_"`]/g, "").trim();
            assigneeName = possibleAssignee;
          }
        }

        if (taskTitle && taskTitle.length > 2 && !["dan", "and", "dengan", "deadline", "phase", "fase"].includes(taskTitle.toLowerCase())) {
          exactTaskTitles.push(taskTitle);
          structuredTasks.push({
            title: taskTitle,
            phaseName: currentActivePhase,
            assigneeName,
            priority: "HIGH",
          });
        }
      }
    }
  }

  // 6. Extract Explicit Task Count and Inline Task Titles if structured tasks were empty
  if (structuredTasks.length === 0) {
    const taskCountMatch = clean.match(/(?:dengan\s+)?([0-9]{1,2})\s+(?:task|tasks|tugas)/i);
    if (taskCountMatch && taskCountMatch[1]) {
      exactTaskCount = parseInt(taskCountMatch[1], 10);
    }

    const inlineTaskMatch = clean.match(
      /(?:(?:dengan\s+)?[0-9]{1,2}\s+)?(?:task|tasks|tugas)(?:\s*:\s*|\s+adalah\s+|\s+yaitu\s+)([^.\n]+?)(?:\.|\n|$)/i
    );
    if (inlineTaskMatch && inlineTaskMatch[1]) {
      const rawTasks = inlineTaskMatch[1].split(/,|\s+dan\s+|\s+and\s+/i);
      for (const rt of rawTasks) {
        const tTitle = rt.replace(/^(?:\d+\.|\-|\*)\s*/, "").replace(/[*_"`]/g, "").trim();
        if (tTitle && tTitle.length > 2 && !["dan", "and", "dengan", "deadline", "phase", "fase"].includes(tTitle.toLowerCase())) {
          exactTaskTitles.push(tTitle);
        }
      }
    }
  }

  if (exactTaskTitles.length > 0 && !exactTaskCount) {
    exactTaskCount = exactTaskTitles.length;
  }

  // 7. Extract Explicit Deadline
  const deadlineMatch = clean.match(
    /(?:deadline|tenggat|target|due|selesai(?: tanggal)?)\s*(?::|\s)?\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|satu\s+[A-Za-z]+|besok|lusa|next\s+week|minggu\s+depan|next\s+month|bulan\s+depan|akhir\s+bulan)/i
  );
  if (deadlineMatch && deadlineMatch[1]) {
    const resolved = resolveNaturalDate(deadlineMatch[1], serverTime);
    if (resolved) {
      exactDeadline = resolved.isoDate;
    }
  }

  const hasExplicitStructure =
    exactProjectName !== undefined ||
    exactPhaseCount !== undefined ||
    exactPhaseNames.length > 0 ||
    exactTaskCount !== undefined ||
    exactTaskTitles.length > 0 ||
    structuredTasks.length > 0;

  return {
    exactProjectName,
    exactPhaseCount,
    exactPhaseNames: exactPhaseNames.length > 0 ? exactPhaseNames : undefined,
    exactTaskCount,
    exactTaskTitles: exactTaskTitles.length > 0 ? exactTaskTitles : undefined,
    structuredTasks: structuredTasks.length > 0 ? structuredTasks : undefined,
    exactDeadline,
    exactMembers: exactMembers.length > 0 ? exactMembers : undefined,
    hasExplicitStructure,
  };
}
