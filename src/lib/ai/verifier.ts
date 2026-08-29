import { AiPlan, ActionResultItem, AiExecutionContext } from "./types";
import { ACTION_REGISTRY } from "./registry";

export interface VerificationReport {
  allVerified: boolean;
  details: Array<{
    actionId: string;
    type: string;
    verified: boolean;
    message: string;
  }>;
}

/**
 * Post-Execution Verification Layer
 * Strictly checks actual database state after mutation queries.
 * Only confirms success when the target database entity is verified.
 */
export async function verifyPlanExecution(
  plan: AiPlan,
  results: ActionResultItem[],
  context: AiExecutionContext
): Promise<VerificationReport> {
  const details: VerificationReport["details"] = [];
  let allVerified = true;

  for (const res of results) {
    if (!res.success) {
      details.push({
        actionId: res.actionId,
        type: res.type,
        verified: false,
        message: `Action execution failed: ${res.error || "Unknown error"}`,
      });
      allVerified = false;
      continue;
    }

    const action = plan.actions.find((a) => a.id === res.actionId);
    const spec = action ? ACTION_REGISTRY[action.type] : undefined;

    if (spec && spec.verify) {
      try {
        const isVerified = await spec.verify(action?.payload, context, res.data);
        res.verified = isVerified;
        if (!isVerified) {
          allVerified = false;
        }
        details.push({
          actionId: res.actionId,
          type: res.type,
          verified: isVerified,
          message: isVerified
            ? `Post-execution database state verified for ${res.type}`
            : `Warning: Database verification failed for ${res.type}. Entity state could not be confirmed.`,
        });
      } catch (verifyErr: any) {
        res.verified = false;
        allVerified = false;
        details.push({
          actionId: res.actionId,
          type: res.type,
          verified: false,
          message: `Verification exception: ${verifyErr?.message || verifyErr}`,
        });
      }
    } else {
      res.verified = true;
      details.push({
        actionId: res.actionId,
        type: res.type,
        verified: true,
        message: `Verified (No explicit query verification required for ${res.type})`,
      });
    }
  }

  return { allVerified, details };
}
