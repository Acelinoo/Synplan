import {
  AiExecutionContext,
  EntityType,
  EntityMatchStatus,
  ResolvedEntityCandidate,
  MemberResolutionResult,
  ProjectResolutionResult,
  TaskResolutionResult,
  UniversalResolutionResult,
  ClarificationState,
} from "./types";

// ============================================================================
// 1. DETERMINISTIC STRING SIMILARITY ALGORITHMS (Levenshtein & Jaro-Winkler)
// ============================================================================

/**
 * Calculates standard Levenshtein Edit Distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) matrix[i] = [i];
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;

  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Normalized Levenshtein similarity score [0.0 - 1.0].
 */
export function normalizedLevenshtein(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Jaro-Winkler distance algorithm for typo and transposition tolerance.
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0 || l2 === 0) return 0.0;

  const matchDistance = Math.floor(Math.max(l1, l2) / 2) - 1;
  const s1Matches = new Array(l1).fill(false);
  const s2Matches = new Array(l2).fill(false);

  let matches = 0;
  for (let i = 0; i < l1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, l2);
    for (let k = start; k < end; k++) {
      if (!s2Matches[k] && s1[i] === s2[k]) {
        s1Matches[i] = true;
        s2Matches[k] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
  }

  const jaro =
    (matches / l1 + matches / l2 + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix adjustment
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(l1, l2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Multi-Signal Composite String Matching Score.
 * Computes deterministic score based on exact match, token match, prefix match,
 * substring inclusion, multi-token overlap, and character-level edit distance
 * with length-ratio penalty to prevent false positives.
 */
export function calculateCandidateScore(rawQuery: string, rawTarget: string): number {
  const query = rawQuery.trim().toLowerCase();
  const target = rawTarget.trim().toLowerCase();

  if (!query || !target) return 0.0;

  // Signal 1: Exact Case-Insensitive Match
  if (query === target) return 1.0;

  const queryTokens = query.split(/[\s\-_\.]+/).filter(Boolean);
  const targetTokens = target.split(/[\s\-_\.]+/).filter(Boolean);

  // Signal 2: Exact Token Match (e.g. "marchel" matches "Marchel" in "Marchelino Kurniawan")
  if (queryTokens.length === 1 && targetTokens.some((t) => t === query)) {
    return 0.98;
  }

  // Signal 3: Multi-token query — all query tokens present in target
  if (queryTokens.length > 1) {
    const matchedTokens = queryTokens.filter((qt) =>
      targetTokens.some((tt) => tt === qt || tt.startsWith(qt) || qt.startsWith(tt))
    );
    if (matchedTokens.length === queryTokens.length) {
      // Full token overlap — "toko roti" vs "Website Toko Roti" → 0.95
      return 0.95;
    }
    // Partial token match — penalize proportionally
    const tokenCoverage = matchedTokens.length / queryTokens.length;
    if (tokenCoverage > 0 && tokenCoverage < 1) {
      // e.g. "toko roti" vs "Website Toko Buah" → only "toko" matches → coverage 0.5
      return 0.50 + tokenCoverage * 0.25; // 0.50 - 0.75
    }
    // No token overlap at all for multi-token → fall through to edit distance
  }

  // Signal 4: Exact Prefix / Startswith Match (single-token)
  if (target.startsWith(query)) {
    const ratio = query.length / target.length;
    return 0.90 + ratio * 0.05; // 0.90 - 0.95
  }

  // Signal 5: Substring Inclusion (full query found inside target)
  if (target.includes(query)) {
    return 0.85;
  }

  // Signal 6: Token-level Prefix Match (single-token query, ≥3 chars)
  if (queryTokens.length === 1 && targetTokens.some((t) => t.startsWith(query) && query.length >= 3)) {
    return 0.88;
  }

  // Signal 7: Character Edit Distance & Jaro-Winkler with strict Levenshtein threshold
  // Typo match allowed if:
  // - normalized Levenshtein >= 0.70 OR
  // - normalized Levenshtein >= 0.60 AND Jaro-Winkler >= 0.85 (handles transpositions / double letters like 'mmaan' -> 'maman')
  const lenRatio = Math.min(query.length, target.length) / Math.max(query.length, target.length);

  let bestTokenSim = 0;
  if (queryTokens.length === 1) {
    for (const token of targetTokens) {
      const tokenLenRatio = Math.min(query.length, token.length) / Math.max(query.length, token.length);
      if (tokenLenRatio < 0.6) continue;

      const tLev = normalizedLevenshtein(query, token);
      const tJw = jaroWinkler(query, token);
      if (tLev >= 0.70 || (tLev >= 0.60 && tJw >= 0.85)) {
        const tSim = Math.max(tLev, (tLev + tJw) / 2) * (0.8 + 0.2 * tokenLenRatio);
        if (tSim > bestTokenSim) bestTokenSim = tSim;
      }
    }
  }

  // Full-string edit similarity
  let fullEditSim = 0;
  const fullLev = normalizedLevenshtein(query, target);
  const fullJw = jaroWinkler(query, target);
  if (fullLev >= 0.70 || (fullLev >= 0.60 && fullJw >= 0.85)) {
    fullEditSim = Math.max(fullLev, (fullLev + fullJw) / 2) * (0.8 + 0.2 * lenRatio);
  }

  const editSim = Math.max(fullEditSim, bestTokenSim);
  return editSim;
}

// ============================================================================
// 2. CANDIDATE THRESHOLDS & RELATIVE CONFIDENCE ENGINE
// ============================================================================

export const MATCHING_THRESHOLDS = {
  MIN_CANDIDATE_THRESHOLD: 0.65, // Below this score is discarded as NO_MATCH
  HIGH_CONFIDENCE_THRESHOLD: 0.85, // Above this score is eligible for auto-resolve
  DOMINANT_MARGIN: 0.12, // Top candidate must lead 2nd candidate by at least 0.12 to auto-resolve
  MAX_CANDIDATES_BEFORE_TOO_MANY: 4, // More than 4 candidates triggers TOO_MANY_CANDIDATES
};

/**
 * Universal Entity Matcher
 * Generic ranking & relative confidence evaluator for any entity pool.
 */
export function matchCandidateEntities<T>(
  query: string,
  entities: T[],
  getName: (e: T) => string,
  getId: (e: T) => string,
  getSecondaryText?: (e: T) => string | undefined,
  entityType: EntityType = "MEMBER"
): UniversalResolutionResult<T> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      entityType,
      query: cleanQuery,
      status: "NO_MATCH",
      isAmbiguous: false,
      notFound: true,
      candidates: [],
      candidateNames: [],
      confidence: 0,
    };
  }

  // 1. Score all authorized entities
  const scoredList: ResolvedEntityCandidate<T>[] = entities
    .map((e) => {
      const name = getName(e);
      const score = calculateCandidateScore(cleanQuery, name);
      return {
        id: getId(e),
        name,
        secondaryText: getSecondaryText ? getSecondaryText(e) : undefined,
        score,
        data: e,
      };
    })
    .filter((c) => c.score >= MATCHING_THRESHOLDS.MIN_CANDIDATE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  // 2. No candidates found
  if (scoredList.length === 0) {
    return {
      entityType,
      query: cleanQuery,
      status: "NO_MATCH",
      isAmbiguous: false,
      notFound: true,
      candidates: [],
      candidateNames: [],
      clarificationPrompt: `Saya tidak menemukan ${entityType.toLowerCase()} yang cocok dengan "${cleanQuery}". Coba gunakan nama yang lebih lengkap.`,
      confidence: 0,
    };
  }

  // 3. Exact Match (Top candidate has score 1.0 or 0.98 token match)
  if (scoredList[0].score >= 0.98) {
    // Check if there are other identical exact matches (rare, e.g. two people with exact identical name)
    const exactDuplicates = scoredList.filter((c) => c.score >= 0.98);
    if (exactDuplicates.length > 1) {
      return {
        entityType,
        query: cleanQuery,
        status: "AMBIGUOUS",
        isAmbiguous: true,
        notFound: false,
        candidates: exactDuplicates,
        candidateNames: exactDuplicates.map((c) => c.name),
        clarificationPrompt: `Ditemukan beberapa ${entityType.toLowerCase()} dengan nama identik "${cleanQuery}": ${exactDuplicates
          .map((c) => `${c.name}${c.secondaryText ? ` (${c.secondaryText})` : ""}`)
          .join(", ")}. Yang mana yang Anda maksud?`,
        confidence: 0.6,
      };
    }

    return {
      entityType,
      query: cleanQuery,
      status: "EXACT_MATCH",
      isAmbiguous: false,
      notFound: false,
      selectedEntity: scoredList[0].data,
      selectedEntities: [scoredList[0].data],
      candidates: scoredList,
      candidateNames: scoredList.map((c) => c.name),
      confidence: 1.0,
    };
  }

  // 4. Too many candidates (e.g. "ma" matching Maman, Maul, Marshel, Marchel, Marlo)
  if (scoredList.length > MATCHING_THRESHOLDS.MAX_CANDIDATES_BEFORE_TOO_MANY) {
    return {
      entityType,
      query: cleanQuery,
      status: "TOO_MANY_CANDIDATES",
      isAmbiguous: true,
      notFound: false,
      candidates: scoredList.slice(0, 5),
      candidateNames: scoredList.slice(0, 5).map((c) => c.name),
      clarificationPrompt: `Saya menemukan ${scoredList.length} ${entityType.toLowerCase()} yang cocok dengan "${cleanQuery}". Bisakah Anda memberikan nama yang lebih spesifik?`,
      confidence: 0.4,
    };
  }

  // 5. Single candidate evaluation
  if (scoredList.length === 1) {
    const single = scoredList[0];
    if (single.score >= MATCHING_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD) {
      return {
        entityType,
        query: cleanQuery,
        status: "SINGLE_HIGH_CONFIDENCE",
        isAmbiguous: false,
        notFound: false,
        selectedEntity: single.data,
        selectedEntities: [single.data],
        candidates: scoredList,
        candidateNames: [single.name],
        confidence: single.score,
      };
    } else {
      return {
        entityType,
        query: cleanQuery,
        status: "LOW_CONFIDENCE",
        isAmbiguous: true,
        notFound: false,
        candidates: scoredList,
        candidateNames: [single.name],
        clarificationPrompt: `Apakah yang Anda maksud adalah ${single.name}?`,
        confidence: single.score,
      };
    }
  }

  // 6. Multiple candidates: Relative Confidence Margin check
  const top1 = scoredList[0];
  const top2 = scoredList[1];
  const margin = top1.score - top2.score;

  if (
    top1.score >= MATCHING_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD &&
    margin >= MATCHING_THRESHOLDS.DOMINANT_MARGIN
  ) {
    // Top candidate is clearly dominant
    return {
      entityType,
      query: cleanQuery,
      status: "SINGLE_HIGH_CONFIDENCE",
      isAmbiguous: false,
      notFound: false,
      selectedEntity: top1.data,
      selectedEntities: [top1.data],
      candidates: scoredList,
      candidateNames: scoredList.map((c) => c.name),
      confidence: top1.score,
    };
  }

  // Relative margin is close -> AMBIGUOUS (Ask user to clarify)
  return {
    entityType,
    query: cleanQuery,
    status: "AMBIGUOUS",
    isAmbiguous: true,
    notFound: false,
    candidates: scoredList,
    candidateNames: scoredList.map((c) => c.name),
    clarificationPrompt: `Saya menemukan beberapa ${entityType.toLowerCase()} yang cocok dengan "${cleanQuery}": ${scoredList
      .map((c) => c.name)
      .join(", ")}. Yang Anda maksud yang mana?`,
    confidence: top1.score,
  };
}

export interface ClarificationResolution<T = any> {
  resolved: boolean;
  isCancelled?: boolean;
  selectedEntities: T[];
  selectedNames: string[];
  selectionMode: "SINGLE" | "MULTI" | "ORDINAL" | "ALL_CANDIDATES" | "CANCEL" | "NONE";
}

/**
 * Resolves user's clarification answer against active pending candidates.
 * Supports: "Marchel", "Marshel", "keduanya", "dua-duanya", "both", "yang pertama", "yang kedua", "semuanya",
 * user corrections ("bukan, yang Marshel", "bukan yang pertama, yang kedua"), and cancellations ("batal", "cancel").
 * NOTE: "semuanya" is strictly bounded to the candidate set from the clarification, never the entire workspace!
 */
export function resolveClarificationAnswer<T>(
  userAnswer: string,
  candidates: ResolvedEntityCandidate<T>[]
): ClarificationResolution<T> {
  if (!userAnswer || !userAnswer.trim() || !candidates || candidates.length === 0) {
    return { resolved: false, selectedEntities: [], selectedNames: [], selectionMode: "NONE" };
  }

  let clean = userAnswer.trim().toLowerCase();

  // 0. Cancellation Check: "batal", "cancel", "batalkan", "gak jadi", "jangan", "stop"
  if (
    clean === "batal" ||
    clean === "cancel" ||
    clean === "batalkan" ||
    clean === "gak jadi" ||
    clean === "nggak jadi" ||
    clean === "jangan" ||
    clean === "stop" ||
    clean === "abort"
  ) {
    return {
      resolved: true,
      isCancelled: true,
      selectedEntities: [],
      selectedNames: [],
      selectionMode: "CANCEL",
    };
  }

  // Handle negation/correction: "bukan yang pertama, yang kedua" -> "yang kedua", "bukan, yang Marshel" -> "yang Marshel"
  const correctionMatch = clean.match(/(?:bukan|not)\s+.*?(?:,\s*|\s+tapi\s+|\s+melainkan\s+)(.+)/i);
  if (correctionMatch && correctionMatch[1]) {
    clean = correctionMatch[1].trim();
  } else {
    clean = clean
      .replace(/^(?:bukan\s*,\s*|bukan\s+|tidak\s*,\s*|maksud\s+saya\s+|maksudku\s+|pilih\s+|ambil\s+)/i, "")
      .trim();
  }

  // 1. Multi-select: "keduanya", "dua-duanya", "both", "all", "semuanya", "semua", "yang pertama dan kedua"
  if (
    clean === "keduanya" ||
    clean === "dua-duanya" ||
    clean === "duaduanya" ||
    clean === "both" ||
    clean === "semuanya" ||
    clean === "semua" ||
    clean === "all" ||
    clean === "select both" ||
    clean === "pilih keduanya" ||
    clean === "yang pertama dan kedua" ||
    clean === "yg pertama dan kedua" ||
    clean === "pertama dan kedua" ||
    clean === "1 dan 2" ||
    clean === "1 & 2"
  ) {
    return {
      resolved: true,
      selectedEntities: candidates.map((c) => c.data),
      selectedNames: candidates.map((c) => c.name),
      selectionMode: clean.includes("semua") ? "ALL_CANDIDATES" : "MULTI",
    };
  }

  // 2. Ordinal selection: "yang pertama", "yg pertama", "pertama", "1", "nomor 1", "first"
  if (
    clean === "yang pertama" ||
    clean === "yg pertama" ||
    clean === "pertama" ||
    clean === "1" ||
    clean === "nomor 1" ||
    clean === "no 1" ||
    clean === "first" ||
    clean === "yang ke 1" ||
    clean === "yang pertama aja" ||
    clean === "yg pertama aja"
  ) {
    if (candidates[0]) {
      return {
        resolved: true,
        selectedEntities: [candidates[0].data],
        selectedNames: [candidates[0].name],
        selectionMode: "ORDINAL",
      };
    }
  }

  // 3. Ordinal selection: "yang kedua", "yg kedua", "kedua", "2", "nomor 2", "second", "yang kedua aja"
  if (
    clean === "yang kedua" ||
    clean === "yg kedua" ||
    clean === "kedua" ||
    clean === "2" ||
    clean === "nomor 2" ||
    clean === "no 2" ||
    clean === "second" ||
    clean === "yang ke 2" ||
    clean === "yang kedua aja" ||
    clean === "yg kedua aja"
  ) {
    if (candidates[1]) {
      return {
        resolved: true,
        selectedEntities: [candidates[1].data],
        selectedNames: [candidates[1].name],
        selectionMode: "ORDINAL",
      };
    }
  }

  // 4. Explicit multiple names mentioned: "Marchel dan Marshel", "Sarah, Devon"
  const mentionedEntities: ResolvedEntityCandidate<T>[] = [];
  for (const cand of candidates) {
    const candLower = cand.name.toLowerCase();
    if (
      clean.includes(candLower) ||
      candLower.split(/\s+/).some((w) => clean.includes(w) && w.length > 2)
    ) {
      if (!mentionedEntities.some((m) => m.id === cand.id)) {
        mentionedEntities.push(cand);
      }
    }
  }

  if (mentionedEntities.length > 0) {
    return {
      resolved: true,
      selectedEntities: mentionedEntities.map((c) => c.data),
      selectedNames: mentionedEntities.map((c) => c.name),
      selectionMode: mentionedEntities.length > 1 ? "MULTI" : "SINGLE",
    };
  }

  // 5. Direct single candidate match by similarity (e.g. user types "Marshel" or "yang Marshel")
  const strippedClean = clean.replace(/^(?:yang\s+|yg\s+)/i, "").replace(/\s+(?:aja|saja)$/i, "").trim();
  for (const cand of candidates) {
    const score = calculateCandidateScore(strippedClean, cand.name);
    if (score >= MATCHING_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD) {
      return {
        resolved: true,
        selectedEntities: [cand.data],
        selectedNames: [cand.name],
        selectionMode: "SINGLE",
      };
    }
  }

  return { resolved: false, selectedEntities: [], selectedNames: [], selectionMode: "NONE" };
}

// ============================================================================
// 4. WORKSPACE-SCOPED ENTITY RESOLVERS
// ============================================================================

/**
 * Resolves a requested member name against real authorized workspace members.
 * Strictly adheres to Zero-Hallucination policy: never returns fake user IDs.
 */
export function resolveWorkspaceMember(
  memberName: string | undefined,
  members: AiExecutionContext["members"],
  pendingClarification?: ClarificationState
): MemberResolutionResult {
  if (!memberName || typeof memberName !== "string" || !memberName.trim()) {
    return { isAmbiguous: false, candidates: [], matchedCandidates: [], notFound: true, confidence: 0 };
  }

  const clean = memberName.trim();

  // 1. If active clarification exists for MEMBER, attempt to resolve clarification answer
  if (
    pendingClarification &&
    pendingClarification.entityType === "MEMBER" &&
    pendingClarification.candidates.length > 0
  ) {
    const matchingCandidateObjs = pendingClarification.candidates
      .map((c) => {
        const found = members.find((m) => m.userId === c.id || m.id === c.id);
        return found ? { id: found.userId, name: found.name, score: 1.0, data: found } : null;
      })
      .filter((c): c is ResolvedEntityCandidate<AiExecutionContext["members"][0]> => c !== null);

    const clarRes = resolveClarificationAnswer(clean, matchingCandidateObjs);
    if (clarRes.resolved && clarRes.selectedEntities.length > 0) {
      return {
        member: clarRes.selectedEntities[0],
        members: clarRes.selectedEntities,
        status: clarRes.selectedEntities.length > 1 ? "EXACT_MATCH" : "SINGLE_HIGH_CONFIDENCE",
        isAmbiguous: false,
        candidates: clarRes.selectedNames,
        matchedCandidates: clarRes.selectedNames,
        notFound: false,
        confidence: 1.0,
      };
    }
  }

  // 2. Exact Email Match
  const exactEmail = members.find((m) => m.email && m.email.toLowerCase() === clean.toLowerCase());
  if (exactEmail) {
    return {
      member: exactEmail,
      members: [exactEmail],
      status: "EXACT_MATCH",
      isAmbiguous: false,
      candidates: [exactEmail.name],
      matchedCandidates: [exactEmail.name],
      notFound: false,
      confidence: 1.0,
    };
  }

  // 3. Multi-Signal Universal Candidate Matching
  const matchResult = matchCandidateEntities(
    clean,
    members,
    (m) => m.name,
    (m) => m.userId,
    (m) => m.email,
    "MEMBER"
  );

  return {
    member: matchResult.selectedEntity,
    members: matchResult.selectedEntities,
    status: matchResult.status,
    isAmbiguous: matchResult.isAmbiguous,
    candidates: matchResult.candidateNames,
    matchedCandidates: matchResult.candidateNames,
    candidateDetails: matchResult.candidates,
    clarificationPrompt: matchResult.clarificationPrompt,
    notFound: matchResult.notFound,
    confidence: matchResult.confidence,
  };
}

/**
 * Resolves a requested project identifier or contextual reference against workspace projects.
 */
export function resolveWorkspaceProject(
  projectIdentifier: string | undefined,
  context: AiExecutionContext,
  pendingClarification?: ClarificationState
): ProjectResolutionResult {
  // If no identifier specified, resolve to currently active project context
  if (!projectIdentifier || !projectIdentifier.trim()) {
    if (context.currentProjectId) {
      const active = context.projects.find((p) => p.id === context.currentProjectId);
      if (active) {
        return {
          project: active,
          status: "EXACT_MATCH",
          isAmbiguous: false,
          candidates: [active.name],
          notFound: false,
          confidence: 1.0,
        };
      }
    }
    if (context.projects.length === 1) {
      return {
        project: context.projects[0],
        status: "SINGLE_HIGH_CONFIDENCE",
        isAmbiguous: false,
        candidates: [context.projects[0].name],
        notFound: false,
        confidence: 0.9,
      };
    }
    return { isAmbiguous: false, candidates: context.projects.map((p) => p.name), notFound: true, confidence: 0 };
  }

  const clean = projectIdentifier.trim();

  // Contextual phrases: "project ini", "di sini", "current project"
  const cleanLower = clean.toLowerCase();
  if (
    cleanLower === "project ini" ||
    cleanLower === "projek ini" ||
    cleanLower === "proyek ini" ||
    cleanLower === "di sini" ||
    cleanLower === "current project"
  ) {
    if (context.currentProjectId) {
      const active = context.projects.find((p) => p.id === context.currentProjectId);
      if (active) {
        return {
          project: active,
          status: "EXACT_MATCH",
          isAmbiguous: false,
          candidates: [active.name],
          notFound: false,
          confidence: 1.0,
        };
      }
    }
  }

  // Exact ID Match
  const exactId = context.projects.find((p) => p.id === projectIdentifier);
  if (exactId) {
    return {
      project: exactId,
      status: "EXACT_MATCH",
      isAmbiguous: false,
      candidates: [exactId.name],
      notFound: false,
      confidence: 1.0,
    };
  }

  // Multi-Signal Universal Candidate Matching
  const matchResult = matchCandidateEntities(
    clean,
    context.projects,
    (p) => p.name,
    (p) => p.id,
    (p) => p.status,
    "PROJECT"
  );

  return {
    project: matchResult.selectedEntity,
    status: matchResult.status,
    isAmbiguous: matchResult.isAmbiguous,
    candidates: matchResult.candidateNames,
    candidateDetails: matchResult.candidates,
    clarificationPrompt: matchResult.clarificationPrompt,
    notFound: matchResult.notFound,
    confidence: matchResult.confidence,
  };
}

/**
 * Resolves a task by title or ID within a project/workspace context.
 */
export function resolveWorkspaceTask(
  taskIdentifier: string | undefined,
  context: AiExecutionContext,
  projectId?: string
): TaskResolutionResult {
  if (!taskIdentifier || !taskIdentifier.trim()) {
    return { isAmbiguous: false, candidates: [], notFound: true, confidence: 0 };
  }

  const pool = projectId ? context.tasks.filter((t) => t.projectId === projectId) : context.tasks;
  const clean = taskIdentifier.trim();

  // Exact ID
  const exactId = pool.find((t) => t.id === clean);
  if (exactId) {
    return {
      task: exactId,
      status: "EXACT_MATCH",
      isAmbiguous: false,
      candidates: [exactId.title],
      notFound: false,
      confidence: 1.0,
    };
  }

  // Multi-Signal Universal Candidate Matching
  const matchResult = matchCandidateEntities(
    clean,
    pool,
    (t) => t.title,
    (t) => t.id,
    (t) => t.status,
    "TASK"
  );

  return {
    task: matchResult.selectedEntity,
    status: matchResult.status,
    isAmbiguous: matchResult.isAmbiguous,
    candidates: matchResult.candidateNames,
    candidateDetails: matchResult.candidates,
    clarificationPrompt: matchResult.clarificationPrompt,
    notFound: matchResult.notFound,
    confidence: matchResult.confidence,
  };
}

/**
 * Resolves a phase by name or ID within a project/workspace context.
 */
export function resolveWorkspacePhase(
  phaseIdentifier: string | undefined,
  context: AiExecutionContext,
  projectId?: string
): UniversalResolutionResult<AiExecutionContext["phases"][0]> {
  if (!phaseIdentifier || !phaseIdentifier.trim()) {
    return {
      entityType: "PHASE",
      query: "",
      status: "NO_MATCH",
      isAmbiguous: false,
      notFound: true,
      candidates: [],
      candidateNames: [],
      confidence: 0,
    };
  }

  const pool = projectId ? context.phases.filter((p) => p.projectId === projectId) : context.phases;
  const clean = phaseIdentifier.trim();

  return matchCandidateEntities(
    clean,
    pool,
    (p) => p.name,
    (p) => p.id,
    (p) => `Order: ${p.order}`,
    "PHASE"
  );
}
