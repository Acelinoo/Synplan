import fs from "fs";
import path from "path";

try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...rest] = trimmed.split("=");
        const val = rest.join("=").replace(/^["']|["']$/g, "").trim();
        process.env[key.trim()] = val;
      }
    });
  }
} catch (e) {}

import { generateAiPlan } from "../src/lib/ai/planner";
import { AiExecutionContext } from "../src/lib/ai/types";

async function main() {
  const context: AiExecutionContext = {
    workspaceId: "ws_001",
    workspaceName: "Engineering Core",
    userId: "usr_001",
    userName: "Marchelino",
    userRole: "OWNER",
    serverTime: "2026-08-29",
    members: [
      { id: "1", userId: "usr_001", name: "Marchelino", email: "m@synplan.io", role: "OWNER" },
      { id: "2", userId: "usr_002", name: "Sarah", email: "s@synplan.io", role: "MEMBER" },
    ],
    projects: [],
    phases: [],
    tasks: [],
  };

  const novelPrompt = "Saya sedang menyiapkan situs untuk usaha bakery. Tolong buat ruang kerja project-nya, target selesai tanggal satu September, dan libatkan Marchelino serta Sarah.";
  console.log("Testing novelPrompt...");
  const plan = await generateAiPlan(novelPrompt, context);
  console.log("Generated plan:", JSON.stringify(plan, null, 2));
}

main().catch(console.error);
