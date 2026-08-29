/**
 * SYNPLAN — Deterministic Natural Date Resolver
 * Normalizes Indonesian & English relative/natural dates into explicit ISO strings (YYYY-MM-DD).
 */

export interface ResolvedDate {
  isoDate: string;
  formattedDisplay: string;
  source: string;
  confidence: number;
}

const MONTH_MAP: Record<string, number> = {
  januari: 0, january: 0, jan: 0,
  februari: 1, february: 1, feb: 1,
  maret: 2, march: 2, mar: 2,
  april: 3, apr: 3,
  mei: 4, may: 4,
  juni: 5, june: 5, jun: 5,
  juli: 6, july: 6, jul: 6,
  agustus: 7, august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  oktober: 9, october: 9, oct: 9,
  november: 10, nov: 10,
  desember: 11, december: 11, dec: 11,
};

const DAY_MAP: Record<string, number> = {
  minggu: 0, sunday: 0, sun: 0,
  senin: 1, monday: 1, mon: 1,
  selasa: 2, tuesday: 2, tue: 2,
  rabu: 3, wednesday: 3, wed: 3,
  kamis: 4, thursday: 4, thu: 4,
  jumat: 5, friday: 5, fri: 5,
  sabtu: 6, saturday: 6, sat: 6,
};

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveNaturalDate(
  input: string | undefined,
  baseDateInput: Date | string = new Date()
): ResolvedDate | null {
  if (!input || typeof input !== "string" || !input.trim()) {
    return null;
  }

  const baseDate = typeof baseDateInput === "string" ? new Date(baseDateInput) : baseDateInput;
  const clean = input.trim().toLowerCase();
  const year = baseDate.getFullYear();

  // 1. Direct ISO Date: YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(input);
    if (!isNaN(d.getTime())) {
      return {
        isoDate: formatIsoDate(d),
        formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
        source: input,
        confidence: 1.0,
      };
    }
  }

  // 2. Relative keywords: today / hari ini
  if (clean === "today" || clean === "hari ini") {
    const d = new Date(baseDate);
    return {
      isoDate: formatIsoDate(d),
      formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
      source: input,
      confidence: 1.0,
    };
  }

  // 3. Tomorrow / besok
  if (clean === "tomorrow" || clean === "besok") {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 1);
    return {
      isoDate: formatIsoDate(d),
      formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
      source: input,
      confidence: 1.0,
    };
  }

  // 4. Day after tomorrow / lusa
  if (clean === "day after tomorrow" || clean === "lusa") {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 2);
    return {
      isoDate: formatIsoDate(d),
      formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
      source: input,
      confidence: 1.0,
    };
  }

  // 5. Next week / minggu depan
  if (clean.includes("next week") || clean.includes("minggu depan")) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 7);
    return {
      isoDate: formatIsoDate(d),
      formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
      source: input,
      confidence: 0.95,
    };
  }

  // 6. Next month / bulan depan
  if (clean.includes("next month") || clean.includes("bulan depan")) {
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() + 1);
    return {
      isoDate: formatIsoDate(d),
      formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
      source: input,
      confidence: 0.95,
    };
  }

  // 7. End of month / akhir bulan
  if (clean.includes("end of month") || clean.includes("akhir bulan")) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    return {
      isoDate: formatIsoDate(d),
      formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
      source: input,
      confidence: 0.95,
    };
  }

  // 8. Day of week: "jumat", "friday", "next friday"
  for (const [dayName, targetDay] of Object.entries(DAY_MAP)) {
    if (clean.includes(dayName)) {
      const d = new Date(baseDate);
      const currentDay = d.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return {
        isoDate: formatIsoDate(d),
        formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
        source: input,
        confidence: 0.9,
      };
    }
  }

  // 9. Natural Day + Month [Year]: "1 September", "15 September 2026", "September 1st"
  const dayMonthMatch = clean
    .replace(/(?:st|nd|rd|th)/g, "")
    .replace(/satu/g, "1")
    .match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/) ||
    clean.match(/([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?/);

  if (dayMonthMatch) {
    let day = parseInt(dayMonthMatch[1], 10);
    let monthStr = dayMonthMatch[2];
    let targetYear = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : year;

    // Handle inverted format: "September 1"
    if (isNaN(day) && MONTH_MAP[dayMonthMatch[1]] !== undefined) {
      monthStr = dayMonthMatch[1];
      day = parseInt(dayMonthMatch[2], 10);
    }

    const monthIndex = MONTH_MAP[monthStr];
    if (!isNaN(day) && monthIndex !== undefined) {
      const d = new Date(targetYear, monthIndex, day);
      return {
        isoDate: formatIsoDate(d),
        formattedDisplay: d.toLocaleDateString("id-ID", { dateStyle: "long" }),
        source: input,
        confidence: 0.98,
      };
    }
  }

  // Fallback try standard date parse
  const fallbackDate = new Date(input);
  if (!isNaN(fallbackDate.getTime())) {
    return {
      isoDate: formatIsoDate(fallbackDate),
      formattedDisplay: fallbackDate.toLocaleDateString("id-ID", { dateStyle: "long" }),
      source: input,
      confidence: 0.8,
    };
  }

  return null;
}
