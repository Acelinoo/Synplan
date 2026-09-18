import { NextRequest } from "next/server";
import { GET as sessionGet } from "../src/app/api/auth/session/route";
import { GET as tasksGet } from "../src/app/api/tasks/route";

async function testDirect() {
  const cookie = "synplan_session_token=seed_dev_session_token_acelino_2026";
  const wsId = "cmu4xlv190007vte4n5vbsxzs";

  console.log("=== Testing sessionGet directly ===");
  try {
    const req1 = new NextRequest("http://localhost:3000/api/auth/session", {
      headers: { cookie },
    });
    const res1 = await sessionGet(req1);
    console.log("sessionGet status:", res1.status, await res1.json());
  } catch (err) {
    console.error("sessionGet direct error:", err);
  }

  console.log("\n=== Testing tasksGet directly ===");
  try {
    const req2 = new NextRequest(
      `http://localhost:3000/api/tasks?workspaceId=${wsId}&view=board`,
      {
        headers: { cookie, "x-synplan-workspace-id": wsId },
      }
    );
    const res2 = await tasksGet(req2);
    console.log("tasksGet status:", res2.status, await res2.json());
  } catch (err) {
    console.error("tasksGet direct error:", err);
  }
}

testDirect().catch(console.error);
