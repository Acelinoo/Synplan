import { prisma } from "../src/lib/prisma";

async function verifyDatabaseRecords() {
  console.log("=== SUPABASE POSTGRESQL RECORD AUDIT ===\n");

  const [
    users,
    workspaces,
    workspaceMembers,
    projects,
    projectMembers,
    tasks,
    subtasks,
    notifications,
    auditLogs,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } }),
    prisma.workspace.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.workspaceMember.findMany({ select: { id: true, userId: true, workspaceId: true, role: true } }),
    prisma.project.findMany({ select: { id: true, name: true, status: true, progress: true } }),
    prisma.projectMember.findMany({ select: { id: true, projectId: true, userId: true } }),
    prisma.task.findMany({ select: { id: true, title: true, status: true, priority: true } }),
    prisma.subtask.findMany({ select: { id: true, title: true, completed: true, taskId: true } }),
    prisma.notification.findMany({ select: { id: true, title: true, read: true, type: true } }),
    prisma.auditLog.findMany({ select: { id: true, action: true, target: true } }),
  ]);

  console.log(`1. Users (${users.length} records):`);
  users.forEach((u) => console.log(`   - [${u.id}] ${u.name} (${u.email}) [${u.role}]`));

  console.log(`\n2. Workspaces (${workspaces.length} records):`);
  workspaces.forEach((w) => console.log(`   - [${w.id}] ${w.name} (slug: ${w.slug})`));

  console.log(`\n3. Workspace Members (${workspaceMembers.length} records):`);
  workspaceMembers.forEach((m) => console.log(`   - [${m.id}] user:${m.userId} -> ws:${m.workspaceId} (${m.role})`));

  console.log(`\n4. Projects (${projects.length} records):`);
  projects.forEach((p) => console.log(`   - [${p.id}] ${p.name} [${p.status}] (${p.progress}%)`));

  console.log(`\n5. Project Members (${projectMembers.length} records):`);
  console.log(`   - Total links: ${projectMembers.length}`);

  console.log(`\n6. Tasks (${tasks.length} records):`);
  tasks.forEach((t) => console.log(`   - [${t.id}] ${t.title} [${t.status}] (${t.priority})`));

  console.log(`\n7. Subtasks (${subtasks.length} records):`);
  subtasks.forEach((s) => console.log(`   - [${s.id}] ${s.title} (completed: ${s.completed})`));

  console.log(`\n8. Notifications (${notifications.length} records):`);
  notifications.forEach((n) => console.log(`   - [${n.id}] ${n.title} (read: ${n.read})`));

  console.log(`\n9. Audit Logs (${auditLogs.length} records):`);
  auditLogs.slice(0, 5).forEach((a) => console.log(`   - [${a.id}] ${a.action} on ${a.target}`));

  console.log("\n=== ALL 9 MODELS VERIFIED IN POSTGRESQL ===");
}

verifyDatabaseRecords()
  .catch((err) => {
    console.error("Database audit error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
