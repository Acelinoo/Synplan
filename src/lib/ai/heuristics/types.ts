import {
  AiAction,
  AiExecutionContext,
  AiPlan,
  AiCreationMode,
} from "../types";

export interface HeuristicContext {
  prompt: string;
  cleanPrompt: string;
  lower: string;
  context: AiExecutionContext;
  planId: string;
  mode: AiCreationMode;
}

export type HeuristicMatcher = (ctx: HeuristicContext) => AiPlan | null;
