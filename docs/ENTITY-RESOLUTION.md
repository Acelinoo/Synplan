# Entity Resolution — Candidate Matching & Ambiguity Resolution

> **Architecture Document** — Synplan AI Assistant  
> **Phase**: Entity Resolution Upgrade  
> **Status**: Implemented

---

## Overview

Synplan's Entity Resolution system is a **deterministic, workspace-scoped candidate matching engine** that resolves natural language references (names, titles, IDs) to actual database entities. It replaces the previous basic string matching with a multi-signal scoring system supporting typo tolerance, ambiguity detection, and interactive clarification.

## Architecture

```
User Input ("tambahkan marhel ke project")
        │
        ▼
AI Planner (extracts candidate query: "marhel")
        │
        ▼
Authorized Entity Context (DB-derived members/projects/tasks/phases in workspace)
        │
        ▼
Deterministic Scoring Engine (Levenshtein + Jaro-Winkler + Token/Prefix/Substring)
        │
        ▼
Candidate Ranker & Relative Margin Evaluator
        │
        ▼
Resolution Decision:
  - EXACT_MATCH → Auto-resolve
  - SINGLE_HIGH_CONFIDENCE → Auto-resolve
  - AMBIGUOUS → Ask user with candidate chips
  - LOW_CONFIDENCE → Ask user for confirmation
  - TOO_MANY_CANDIDATES → Ask user to be more specific
  - NO_MATCH → Inform user, suggest alternatives
```

## String Similarity Algorithms

### 1. Normalized Levenshtein Distance

Measures minimum edit operations (insert/delete/substitute) normalized to `[0.0, 1.0]`.

```
score = 1 - (editDistance / max(len(a), len(b)))
```

- Good for: detecting insertions, deletions, and substitutions
- Example: `"marhel"` vs `"marchel"` → distance 1 → similarity ~0.86

### 2. Jaro-Winkler Distance

Measures character similarity with bonus for matching prefixes (up to 4 characters).

- Good for: transposition errors, prefix-matching names
- Example: `"marhel"` vs `"marchel"` → ~0.93

### 3. Composite Multi-Signal Score

The final score is computed by selecting the maximum across multiple signals:

| Signal | Score Range | Condition |
|--------|------------|-----------|
| Exact case-insensitive match | 1.00 | `query === target` |
| Exact token match | 0.98 | `"marchel"` matches token in `"Marchel Pratama"` |
| Prefix match | 0.90 – 0.95 | `target.startsWith(query)` |
| Token prefix match | 0.88 | Any token starts with query (≥3 chars) |
| Substring inclusion | 0.85 | `target.includes(query)` |
| Edit distance (best of Levenshtein, Jaro-Winkler, token-level) | 0.0 – 0.95 | Character-level similarity |

## Thresholds & Decision Rules

| Threshold | Value | Purpose |
|-----------|-------|---------|
| `MIN_CANDIDATE_THRESHOLD` | 0.65 | Below this score → discarded |
| `HIGH_CONFIDENCE_THRESHOLD` | 0.85 | Above this → eligible for auto-resolve |
| `DOMINANT_MARGIN` | 0.12 | Top candidate must lead 2nd by this margin |
| `MAX_CANDIDATES_BEFORE_TOO_MANY` | 4 | More than 4 → TOO_MANY_CANDIDATES |

### Decision Matrix

| Scenario | Status | Behavior |
|----------|--------|----------|
| 0 candidates above threshold | `NO_MATCH` | Inform user entity not found |
| 1 candidate ≥ 0.85, no close second | `SINGLE_HIGH_CONFIDENCE` | Auto-resolve |
| 1 candidate < 0.85 | `LOW_CONFIDENCE` | Ask confirmation |
| 2–4 candidates with close scores | `AMBIGUOUS` | Show candidate chips + "Select Both" |
| 5+ candidates | `TOO_MANY_CANDIDATES` | Ask to be more specific |
| Score = 1.0 (exact match) | `EXACT_MATCH` | Auto-resolve |

## Universal Entity Types

The same resolution engine applies to all entity types:

| Entity | Source | Name Field | ID Field |
|--------|--------|------------|----------|
| `MEMBER` | `WorkspaceMember` | `name` | `userId` |
| `PROJECT` | `Project` | `name` | `id` |
| `TASK` | `Task` | `title` | `id` |
| `PHASE` | `Phase` | `name` | `id` |

## Clarification State & Multi-Selection

When ambiguity is detected, a `ClarificationState` is created:

```typescript
interface ClarificationState {
  id: string;
  entityType: EntityType;
  query: string;
  originalActionType: AiActionType;
  candidates: Array<{ id: string; name: string; secondaryText?: string }>;
  allowMultiSelect: boolean;
  message: string;
  createdAt: string;
}
```

### Supported Clarification Answers

| User Input | Resolution | Mode |
|------------|------------|------|
| `"Marchel"` | Single candidate match | `SINGLE` |
| `"Marshel"` | Single candidate match | `SINGLE` |
| `"keduanya"` / `"dua-duanya"` / `"both"` | Select both candidates | `MULTI` |
| `"yang pertama dan kedua"` / `"1 dan 2"` | Select both candidates | `MULTI` |
| `"yang pertama"` / `"yg pertama"` / `"pertama"` / `"1"` / `"nomor 1"` | Ordinal -> candidate[0] | `ORDINAL` |
| `"yang kedua"` / `"yg kedua"` / `"kedua"` / `"2"` / `"nomor 2"` | Ordinal -> candidate[1] | `ORDINAL` |
| `"semuanya"` / `"semua"` / `"all"` | All candidates (scoped to clarification only!) | `ALL_CANDIDATES` |
| `"Marchel dan Marshel"` | Explicit multi-name mention | `MULTI` |
| `"bukan, yang Marshel"` | User correction -> Marshel | `SINGLE` |
| `"bukan yang pertama, yang kedua"` | User correction -> candidate[1] (Marchel) | `ORDINAL` |
| `"batal"` / `"cancel"` / `"gak jadi"` | Cancellation -> 0 mutation | `CANCEL` |

> **SECURITY INVARIANT**: `"semuanya"` resolves only to the candidates presented in the active clarification prompt, **NEVER** to the entire workspace member list.

## Conversational Clarification Flow

```text
Turn 1 (User): "tambahkan marhel ke project ini"
        │
Turn 1 (AI): Detects "marhel" -> AMBIGUOUS (Marshel Pratama 0.86, Marchel Saputra 0.86)
             -> pendingClarification created and passed to UI
             -> UI renders candidate chips: [Marshel] [Marchel] [Pilih Keduanya]
        │
Turn 2 (User): clicks "Marchel" or types "Marchel" / "Keduanya" / "batal"
        │
Turn 2 (AI): resolveClarificationAnswer(answer, candidates)
             -> If resolved: originalAction (ADD_MEMBER / ASSIGN_TASK) resumes with real DB IDs
             -> If cancelled: action cleanly aborted with 0 DB mutations
             -> pendingClarification cleared
```

## Security Invariants & Client Trust Boundary

1. **Server-Side Re-Validation**: Never trust raw user IDs or candidate IDs sent from the client. The server verifies that all candidate IDs belong to the authorized workspace membership before executing.
2. **Workspace Scoping**: Entity resolution always operates strictly within authorized workspace scope. Cross-workspace entities are completely invisible.
3. **Zero Hallucination**: Never invents database IDs. Only DB-derived IDs reach execution.
4. **Deterministic**: Composite scoring has no randomness. Same input always produces same output.
5. **Bounded Clarification**: `"semuanya"` is bounded to clarification candidate set, not entire workspace.
6. **Cancellation Safety**: When user cancels clarification, 0 mutations occur and pending intent is safely discarded.
7. **Idempotency Protection**: Execution requests utilize idempotency caching to prevent duplicate database rows.

## Files

| File | Purpose |
|------|---------|
| `src/lib/ai/entityResolver.ts` | Core matching engine, similarity algorithms, universal resolver, clarification answer resolver |
| `src/lib/ai/types.ts` | Type definitions (ClarificationState, EntityMatchStatus, UniversalResolutionResult, etc.) |
| `src/lib/ai/conversationState.ts` | Pending clarification session tracking |
| `src/lib/ai/validator.ts` | Plan validation with entity resolution & clarification state generation |
| `src/lib/ai/planner.ts` | Clarification context injection & resumption fulfillment |
| `src/components/ai/AiAssistantDrawer.tsx` | Interactive candidate selection UI chips |
| `scripts/test-entity-resolution.ts` | 124 focused unit tests (100% pass rate) |
| `scripts/test-ai-entity-resolution-e2e.ts` | 58 comprehensive E2E tests (100% pass rate) |
| `scripts/test-ai-golden-suite.ts` | 100 golden reliability tests (100% pass rate) |

## Test Coverage Summary

- **E2E Suite (`test-ai-entity-resolution-e2e.ts`)**: 58/58 passed (100%)
- **Unit Suite (`test-entity-resolution.ts`)**: 124/124 passed (100%)
- **Golden Suite (`test-ai-golden-suite.ts`)**: 100/100 passed (100%)
- **Freeform Suite (`test-ai-freeform-project.ts`)**: 10/10 passed (100%)
- **TypeScript (`npx tsc --noEmit`)**: 0 errors
- **Next.js Production Build**: 27/27 routes compiled clean (exit code 0)
