import { prisma } from "../src/lib/prisma";

async function main() {
  const baseUrl = "http://127.0.0.1:3000";
  const cookie = "synplan_session_token=seed_dev_session_token_acelino_2026";

  console.log("=== 1. VERIFYING DEV AUTH SESSION ===");
  const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { cookie },
  });
  const sessionData = await sessionRes.json();
  console.log("Session Status:", sessionRes.status, "Authenticated:", sessionData.authenticated);
  if (!sessionData.authenticated) {
    throw new Error("Dev session not authenticated: " + JSON.stringify(sessionData));
  }

  const workspaceId = sessionData.workspaces[0].id;
  console.log("Active Workspace ID:", workspaceId, "Name:", sessionData.workspaces[0].name);

  console.log("\n=== 2. CREATING PROJECT ===");
  const projRes = await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      origin: baseUrl,
    },
    body: JSON.stringify({
      name: "E2E Verified Project",
      description: "Automated verification project",
      color: "#0284C7",
      status: "ACTIVE",
      deadline: "2026-11-01",
    }),
  });
  const projData = await projRes.json();
  console.log("Project Status:", projRes.status, "Success:", projData.success, "ID:", projData.data?.id);
  if (!projData.success) throw new Error("Project creation failed: " + JSON.stringify(projData));

  const projectId = projData.data.id;

  console.log("\n=== 3. CREATING TASK UNDER PROJECT ===");
  const taskRes = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      origin: baseUrl,
    },
    body: JSON.stringify({
      title: "Deploy Core Architecture",
      description: "Verify task creation works flawlessly",
      projectId: projectId,
      status: "TODO",
      priority: "HIGH",
      dueDate: "2026-10-20",
      tags: ["verified", "crud"],
    }),
  });
  const taskData = await taskRes.json();
  console.log("Task Status:", taskRes.status, "Success:", taskData.success, "ID:", taskData.data?.id);
  if (!taskData.success) throw new Error("Task creation failed: " + JSON.stringify(taskData));

  console.log("\n=== 4. INVITING TEAM MEMBER ===");
  const testEmail = `squad.member.${Date.now()}@synplan.test`;
  const memberRes = await fetch(`${baseUrl}/api/team/members`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      origin: baseUrl,
    },
    body: JSON.stringify({
      name: "Alex Rivera",
      email: testEmail,
      role: "MEMBER",
    }),
  });
  const memberData = await memberRes.json();
  console.log("Member Invite Status:", memberRes.status, "Success:", memberData.success, "Member ID:", memberData.data?.id);
  if (!memberData.success) throw new Error("Member invite failed: " + JSON.stringify(memberData));

  console.log("\n=== 5. CLEANING UP TEST FIXTURES ===");
  await prisma.task.delete({ where: { id: taskData.data.id } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.workspaceMember.delete({ where: { id: memberData.data.id } });
  await prisma.user.delete({ where: { email: testEmail } });

  console.log("\n🎉 ALL DOMAIN MUTATIONS (PROJECT, TASK, TEAM) SUCCEEDED 100%!");
}

main().catch((err) => {
  console.error("❌ TEST RUN FAILED:", err);
  process.exit(1);
});
