import { ExplicitProjectConstraints } from "./types";
import { resolveNaturalDate } from "./dateResolver";

/**
 * Extracts explicit structural requirements from user prompts.
 * Used by Strict Mode validator to prevent unauthorized AI expansion.
 */
export function extractExplicitRequirements(prompt: string, serverTime?: string): ExplicitProjectConstraints {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  let exactPhaseCount: number | undefined = undefined;
  const exactPhaseNames: string[] = [];
  let exactTaskCount: number | undefined = undefined;
  const exactTaskTitles: string[] = [];
  let exactDeadline: string | undefined = undefined;
  const exactMembers: string[] = [];

  // 1. Extract Explicit Phase Count (e.g., "3 phase", "3 fase", "4 delivery phases")
  const phaseCountMatch = clean.match(/(?:dengan\s+)?([0-9]{1,2})\s+(?:delivery\s+)?(?:phase|fase|tahapan)/i);
  if (phaseCountMatch && phaseCountMatch[1]) {
    exactPhaseCount = parseInt(phaseCountMatch[1], 10);
  }

  // 2. Extract Explicit Phase Names
  // Pattern A: Numbered/Bulleted list under "Phase:" / "Fase:" / "Tahapan:"
  const phaseBlockMatch = clean.match(/(?:phases?|fase|tahapan)\s*:\s*\n?((?:(?:\d+\.|\-|\*)\s*[^\n]+\n?)+)/i);
  if (phaseBlockMatch && phaseBlockMatch[1]) {
    const lines = phaseBlockMatch[1].split("\n");
    for (const l of lines) {
      const pName = l.replace(/^(?:\d+\.|\-|\*|\•)\s*/, "").trim();
      if (pName && !pName.toLowerCase().startsWith("task") && !pName.toLowerCase().startsWith("tugas")) {
        exactPhaseNames.push(pName);
      }
    }
  }

  // Pattern B: Inline comma/colon separated (e.g. "3 phase: Planning, Design, Development" or "fase Planning, Design dan Testing")
  if (exactPhaseNames.length === 0) {
    const inlinePhaseMatch = clean.match(/(?:(?:dengan\s+)?[0-9]{1,2}\s+)?(?:phase|fase|tahapan)(?:\s*:\s*|\s+adalah\s+|\s+yaitu\s+)([^.\n]+?)(?:\.|\n|Planning:|Design:|Development:|Testing:|Deployment:|$)/i);
    if (inlinePhaseMatch && inlinePhaseMatch[1]) {
      const rawParts = inlinePhaseMatch[1].split(/,|\s+dan\s+|\s+and\s+/i);
      for (const part of rawParts) {
        const pName = part.replace(/^(?:\d+\.|\-|\*)\s*/, "").trim();
        if (pName && pName.length > 1 && !["dan", "and", "dengan", "deadline", "task", "tugas"].includes(pName.toLowerCase())) {
          exactPhaseNames.push(pName);
        }
      }
    }
  }

  if (exactPhaseNames.length > 0) {
    exactPhaseCount = exactPhaseNames.length;
  }

  // 3. Extract Explicit Task Count and Titles
  // Pattern A: Inline task specification (e.g. "dengan 2 task: Buat homepage, Buat halaman produk")
  const taskCountMatch = clean.match(/(?:dengan\s+)?([0-9]{1,2})\s+(?:task|tasks|tugas)/i);
  if (taskCountMatch && taskCountMatch[1]) {
    exactTaskCount = parseInt(taskCountMatch[1], 10);
  }

  const inlineTaskMatch = clean.match(/(?:(?:dengan\s+)?[0-9]{1,2}\s+)?(?:task|tasks|tugas)(?:\s*:\s*|\s+adalah\s+|\s+yaitu\s+)([^.\n]+?)(?:\.|\n|$)/i);
  if (inlineTaskMatch && inlineTaskMatch[1]) {
    const rawTasks = inlineTaskMatch[1].split(/,|\s+dan\s+|\s+and\s+/i);
    for (const rt of rawTasks) {
      const tTitle = rt.replace(/^(?:\d+\.|\-|\*)\s*/, "").trim();
      if (tTitle && tTitle.length > 2 && !["dan", "and", "dengan", "deadline", "phase", "fase"].includes(tTitle.toLowerCase())) {
        exactTaskTitles.push(tTitle);
      }
    }
  }

  // Pattern B: Phase-grouped task blocks (e.g. "Planning:\n- Requirement gathering\n- Sitemap")
  const phaseSections = clean.split(/\n(?=[A-Za-z0-9\s]+:)/);
  for (const sec of phaseSections) {
    const headerMatch = sec.match(/^([A-Za-z0-9\s]+):/);
    if (headerMatch && !["phase", "phases", "fase", "tahapan", "project", "projek", "proyek", "deadline", "team", "tim"].includes(headerMatch[1].toLowerCase().trim())) {
      const taskLines = sec.split("\n").slice(1);
      for (const tl of taskLines) {
        const cleanTl = tl.replace(/^(?:\d+\.|\-|\*|\•)\s*/, "").trim();
        if (cleanTl && cleanTl.length > 2) {
          exactTaskTitles.push(cleanTl);
        }
      }
    }
  }

  if (exactTaskTitles.length > 0 && !exactTaskCount) {
    exactTaskCount = exactTaskTitles.length;
  }

  // 4. Extract Explicit Deadline
  const deadlineMatch = clean.match(
    /(?:deadline|tenggat|target|due|selesai(?: tanggal)?)\s*(?::|\s)?\s*([0-9]{1,2}\s+[A-Za-z]+(?:\s+[0-9]{4})?|[0-9]{4}-[0-9]{2}-[0-9]{2}|satu\s+[A-Za-z]+|besok|lusa|next\s+week|minggu\s+depan|next\s+month|bulan\s+depan|akhir\s+bulan)/i
  );
  if (deadlineMatch && deadlineMatch[1]) {
    const resolved = resolveNaturalDate(deadlineMatch[1], serverTime);
    if (resolved) {
      exactDeadline = resolved.isoDate;
    }
  }

  // 5. Extract Explicit Members
  const memberBlockMatch = clean.match(/(?:tambahkan|tambah|libatkan|masukkan|anggota|member|serta)\s+([^.\n]+?)(?:\s+ke\s+tim|\s+ke\s+team|\s+ikut|\s+sebagai|\.|\n|$)/i);
  if (memberBlockMatch && memberBlockMatch[1]) {
    const rawMembers = memberBlockMatch[1].split(/,|\s+dan\s+|\s+and\s+|\s+serta\s+/i);
    for (const rm of rawMembers) {
      const name = rm.trim();
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

  const hasExplicitStructure =
    exactPhaseCount !== undefined ||
    exactPhaseNames.length > 0 ||
    exactTaskCount !== undefined ||
    exactTaskTitles.length > 0;

  return {
    exactPhaseCount,
    exactPhaseNames: exactPhaseNames.length > 0 ? exactPhaseNames : undefined,
    exactTaskCount,
    exactTaskTitles: exactTaskTitles.length > 0 ? exactTaskTitles : undefined,
    exactDeadline,
    exactMembers: exactMembers.length > 0 ? exactMembers : undefined,
    hasExplicitStructure,
  };
}
