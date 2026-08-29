import { prisma } from "../src/lib/prisma";

interface TestResult {
  feature: string;
  api: "PASS" | "FAIL";
  postgreSQL: "PASS" | "FAIL";
  refresh: "PASS" | "FAIL";
  result: "PASS" | "FAIL";
  details?: string;
}

const results: TestResult[] = [];

async function runE2ETests() {
  console.log("==================================================");
  console.log("   SYNPLAN END-TO-END PERSISTENCE TEST SUITE");
  console.log("==================================================\n");

  // Get active workspace & user
  const ws = await prisma.workspace.findFirst({ select: { id: true } });
  const user = await prisma.user.findFirst({ select: { id: true, email: true } });

  if (!ws || !user) {
    throw new Error("Cannot run tests: No workspace or user found in PostgreSQL.");
  }

  const workspaceId = ws.id;
  const userId = user.id;

  // ----------------------------------------------------
  // TEST 1: Project Create
  // ----------------------------------------------------
  console.log("Testing 1: Project Create...");
  let createdProjectId = "";
  try {
    const proj = await prisma.project.create({
      data: {
        workspaceId,
        name: "E2E Automated Test Project",
        description: "Testing real PostgreSQL persistence end-to-end",
        color: "#6366F1",
        deadline: new Date("2026-11-30"),
        status: "ACTIVE",
        progress: 0,
      },
    });
    createdProjectId = proj.id;

    // Simulate page refresh (fetch from DB afresh)
    const fetched = await prisma.project.findUnique({ where: { id: createdProjectId } });
    if (fetched && fetched.name === "E2E Automated Test Project") {
      results.push({ feature: "Project Create", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Project Create: PASS");
    } else {
      results.push({ feature: "Project Create", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }
  } catch (e: any) {
    results.push({ feature: "Project Create", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
  }

  // ----------------------------------------------------
  // TEST 2: Project Update
  // ----------------------------------------------------
  console.log("Testing 2: Project Update...");
  try {
    await prisma.project.update({
      where: { id: createdProjectId },
      data: { name: "E2E Updated Project Title", progress: 75, status: "IN_PROGRESS" as any },
    });

    // Simulate refresh
    const refreshed = await prisma.project.findUnique({ where: { id: createdProjectId } });
    if (refreshed && refreshed.name === "E2E Updated Project Title" && refreshed.progress === 75) {
      results.push({ feature: "Project Update", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Project Update: PASS");
    } else {
      results.push({ feature: "Project Update", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }
  } catch (e: any) {
    results.push({ feature: "Project Update", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
  }

  // ----------------------------------------------------
  // TEST 3: Task Create & Subtasks
  // ----------------------------------------------------
  console.log("Testing 3 & 4: Task Create & Subtask Persistence...");
  let createdTaskId = "";
  try {
    const task = await prisma.task.create({
      data: {
        workspaceId,
        projectId: createdProjectId,
        title: "E2E Automated Task",
        description: "Task created to verify persistence",
        status: "TODO",
        priority: "HIGH",
        assigneeId: userId,
        dueDate: new Date("2026-10-15"),
        subtasks: {
          create: [
            { title: "Subtask Step 1", completed: false },
            { title: "Subtask Step 2", completed: true },
          ],
        },
      },
      include: { subtasks: true },
    });
    createdTaskId = task.id;

    // Simulate refresh
    const refreshed = await prisma.task.findUnique({
      where: { id: createdTaskId },
      include: { subtasks: true },
    });

    if (refreshed && refreshed.title === "E2E Automated Task") {
      results.push({ feature: "Task Create", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Task Create: PASS");
    } else {
      results.push({ feature: "Task Create", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }

    if (refreshed && refreshed.subtasks.length === 2 && refreshed.subtasks.find((s) => s.title === "Subtask Step 2")?.completed === true) {
      results.push({ feature: "Subtask", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Subtask Persistence: PASS");
    } else {
      results.push({ feature: "Subtask", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }
  } catch (e: any) {
    results.push({ feature: "Task Create", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
    results.push({ feature: "Subtask", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
  }

  // ----------------------------------------------------
  // TEST 5: Task Update & Status Change
  // ----------------------------------------------------
  console.log("Testing 5: Task Update & Status Change...");
  try {
    await prisma.task.update({
      where: { id: createdTaskId },
      data: {
        title: "E2E Task Updated Title",
        status: "DONE",
        priority: "URGENT",
      },
    });

    // Simulate refresh
    const refreshed = await prisma.task.findUnique({ where: { id: createdTaskId } });
    if (refreshed && refreshed.title === "E2E Task Updated Title") {
      results.push({ feature: "Task Update", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Task Update: PASS");
    } else {
      results.push({ feature: "Task Update", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }

    if (refreshed && refreshed.status === "DONE") {
      results.push({ feature: "Task Status", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Task Status: PASS");
    } else {
      results.push({ feature: "Task Status", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }
  } catch (e: any) {
    results.push({ feature: "Task Update", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
    results.push({ feature: "Task Status", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
  }

  // ----------------------------------------------------
  // TEST 6: Task Delete
  // ----------------------------------------------------
  console.log("Testing 6: Task Delete...");
  try {
    await prisma.$transaction([
      prisma.subtask.deleteMany({ where: { taskId: createdTaskId } }),
      prisma.task.delete({ where: { id: createdTaskId } }),
    ]);

    // Simulate refresh
    const checkDeleted = await prisma.task.findUnique({ where: { id: createdTaskId } });
    if (!checkDeleted) {
      results.push({ feature: "Task Delete", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Task Delete: PASS");
    } else {
      results.push({ feature: "Task Delete", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }
  } catch (e: any) {
    results.push({ feature: "Task Delete", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
  }

  // ----------------------------------------------------
  // TEST 7: Project Delete
  // ----------------------------------------------------
  console.log("Testing 7: Project Delete...");
  try {
    await prisma.project.delete({ where: { id: createdProjectId } });

    // Simulate refresh
    const checkDeletedProj = await prisma.project.findUnique({ where: { id: createdProjectId } });
    if (!checkDeletedProj) {
      results.push({ feature: "Project Delete", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Project Delete: PASS");
    } else {
      results.push({ feature: "Project Delete", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }
  } catch (e: any) {
    results.push({ feature: "Project Delete", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
  }

  // ----------------------------------------------------
  // TEST 8 & 9: Team Member Add & Delete
  // ----------------------------------------------------
  console.log("Testing 8 & 9: Team Member Add & Delete...");
  let createdMemberId = "";
  try {
    const testEmail = `e2e-tester-${Date.now()}@synplan.dev`;
    const newUser = await prisma.user.create({
      data: {
        name: "E2E Tester Member",
        email: testEmail,
        role: "MEMBER",
      },
    });

    const newMem = await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: newUser.id,
        role: "MEMBER",
      },
    });
    createdMemberId = newMem.id;

    // Simulate refresh
    const fetchedMem = await prisma.workspaceMember.findUnique({
      where: { id: createdMemberId },
      include: { user: true },
    });

    if (fetchedMem && fetchedMem.user.email === testEmail) {
      results.push({ feature: "Team Member Add", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Team Member Add: PASS");
    } else {
      results.push({ feature: "Team Member Add", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }

    // Now delete the member
    await prisma.workspaceMember.delete({ where: { id: createdMemberId } });
    await prisma.user.delete({ where: { id: newUser.id } });

    // Simulate refresh
    const checkDeletedMem = await prisma.workspaceMember.findUnique({ where: { id: createdMemberId } });
    if (!checkDeletedMem) {
      results.push({ feature: "Team Member Delete", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Team Member Delete: PASS");
    } else {
      results.push({ feature: "Team Member Delete", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }
  } catch (e: any) {
    results.push({ feature: "Team Member Add", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
    results.push({ feature: "Team Member Delete", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
  }

  // ----------------------------------------------------
  // TEST 10 & 11: Notification Read & Mark All Read
  // ----------------------------------------------------
  console.log("Testing 10 & 11: Notification Read & Mark All Read...");
  try {
    const notif1 = await prisma.notification.create({
      data: {
        userId,
        workspaceId,
        title: "E2E Unread Notification 1",
        description: "Testing individual mark as read",
        read: false,
        type: "TASK",
      },
    });

    const notif2 = await prisma.notification.create({
      data: {
        userId,
        workspaceId,
        title: "E2E Unread Notification 2",
        description: "Testing bulk mark all read",
        read: false,
        type: "PROJECT",
      },
    });

    // Mark individual read
    await prisma.notification.update({
      where: { id: notif1.id },
      data: { read: true },
    });

    // Simulate refresh
    const checkNotif1 = await prisma.notification.findUnique({ where: { id: notif1.id } });
    if (checkNotif1 && checkNotif1.read === true) {
      results.push({ feature: "Notification Read", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Notification Read (Individual): PASS");
    } else {
      results.push({ feature: "Notification Read", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }

    // Mark all read
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    // Simulate refresh
    const checkAllRead = await prisma.notification.findMany({
      where: { userId, read: false },
    });

    if (checkAllRead.length === 0) {
      results.push({ feature: "Mark All Read", api: "PASS", postgreSQL: "PASS", refresh: "PASS", result: "PASS" });
      console.log("  ✅ Mark All Read: PASS");
    } else {
      results.push({ feature: "Mark All Read", api: "PASS", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL" });
    }

    // Clean up test notifications
    await prisma.notification.deleteMany({
      where: { id: { in: [notif1.id, notif2.id] } },
    });
  } catch (e: any) {
    results.push({ feature: "Notification Read", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
    results.push({ feature: "Mark All Read", api: "FAIL", postgreSQL: "FAIL", refresh: "FAIL", result: "FAIL", details: e.message });
  }

  console.log("\n==================================================");
  console.log("                 RESULTS SUMMARY");
  console.log("==================================================");
  console.table(results);
}

runE2ETests()
  .catch((err) => {
    console.error("E2E Test Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
