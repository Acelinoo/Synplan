import { Role, TaskPriority, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { realtimeClient } from "@/lib/realtime";
import { createNotification } from "@/lib/notificationService";
import {
  AiActionType,
  ActionRiskLevel,
  AiExecutionContext,
  ActionResultItem,
} from "../types";
import { resolveWorkspaceMember, resolveWorkspaceProject, resolveWorkspaceTask } from "../entityResolver";
import { resolveNaturalDate } from "../dateResolver";

export interface ActionDefinition<P = any, R = any> {
  name: AiActionType;
  description: string;
  riskLevel: ActionRiskLevel;
  requiredRole: Role;
  requiredParams: string[];
  optionalParams: string[];
  validate: (
    payload: P,
    context: AiExecutionContext,
    sessionMap: Map<string, string>
  ) => { isValid: boolean; errors: string[]; warnings: string[]; needsClarification: boolean; clarifications: string[] };
  execute: (
    payload: P,
    context: AiExecutionContext,
    sessionMap: Map<string, string>
  ) => Promise<{ success: boolean; data?: R; error?: string; summary: string }>;
  verify: (
    payload: P,
    context: AiExecutionContext,
    result: R
  ) => Promise<boolean>;
  rollback?: (
    payload: P,
    context: AiExecutionContext,
    result: R
  ) => Promise<void>;
}

export const ACTION_REGISTRY: Record<AiActionType, ActionDefinition> = {
  CREATE_PROJECT: {
    name: "CREATE_PROJECT",
    description: "Membuat proyek baru dengan tahapan dan tugas awal di workspace",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: ["name"],
    optionalParams: ["description", "deadline", "color", "status", "phases", "initialTasks", "memberNames"],
    validate: (payload, context) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!payload.name || !payload.name.trim()) {
        errors.push("Project name is required.");
      }
      const existing = context.projects.find(
        (p) => p.name.toLowerCase() === payload.name?.trim().toLowerCase()
      );
      if (existing) {
        warnings.push(`Project bernama "${payload.name}" sudah ada di workspace ini.`);
      }
      return { isValid: errors.length === 0, errors, warnings, needsClarification: false, clarifications: [] };
    },
    execute: async (payload, context, sessionMap) => {
      const { workspaceId, userId } = context;
      let deadlineDate: Date | null = null;
      if (payload.deadline) {
        const resolvedDate = resolveNaturalDate(payload.deadline);
        if (resolvedDate) {
          deadlineDate = new Date(resolvedDate.isoDate);
        }
      }

      const project = await prisma.project.create({
        data: {
          workspaceId,
          name: payload.name.trim(),
          description: payload.description || null,
          deadline: deadlineDate,
          status: payload.status || "ACTIVE",
          color: payload.color || "#6366F1",
          progress: 0,
        },
      });

      sessionMap.set("latest", project.id);
      sessionMap.set(project.name.toLowerCase().trim(), project.id);

      // Create Phases if specified
      const phaseMap = new Map<string, string>();
      if (Array.isArray(payload.phases)) {
        for (const ph of payload.phases) {
          const createdPhase = await prisma.phase.create({
            data: {
              projectId: project.id,
              name: ph.name.trim(),
              order: ph.order || 0,
            },
          });
          phaseMap.set(ph.name.toLowerCase().trim(), createdPhase.id);
        }
      }

      // Create Initial Tasks if specified
      let totalTasks = 0;
      if (Array.isArray(payload.initialTasks)) {
        for (const t of payload.initialTasks) {
          let targetPhaseId: string | null = null;
          if (t.phaseName) {
            targetPhaseId = phaseMap.get(t.phaseName.toLowerCase().trim()) || null;
          }

          let assigneeId: string | null = t.assigneeId || null;
          if (!assigneeId && t.assigneeName) {
            const res = resolveWorkspaceMember(t.assigneeName, context.members);
            if (res.member) assigneeId = res.member.userId;
          }

          let taskDue: Date | null = null;
          if (t.dueDate) {
            const rd = resolveNaturalDate(t.dueDate);
            if (rd) taskDue = new Date(rd.isoDate);
          } else if (deadlineDate) {
            taskDue = deadlineDate;
          }

          await prisma.task.create({
            data: {
              workspaceId,
              projectId: project.id,
              phaseId: targetPhaseId,
              title: t.title.trim(),
              description: t.description || `Task for ${project.name}`,
              status: (t.status?.toUpperCase() as TaskStatus) || TaskStatus.TODO,
              priority: (t.priority?.toUpperCase() as TaskPriority) || TaskPriority.MEDIUM,
              assigneeId,
              dueDate: taskDue,
            },
          });
          totalTasks++;
        }
      }

      // Update totalTasks count
      if (totalTasks > 0) {
        await prisma.project.update({
          where: { id: project.id },
          data: { totalTasks },
        });
      }

      // Realtime Broadcast
      realtimeClient.broadcast(`workspace:${workspaceId}`, "PROJECT_CREATED", {
        id: project.id,
        workspaceId,
        name: project.name,
        description: project.description || "",
        progress: 0,
        status: (project.status.toLowerCase() as any) || "active",
        deadline: project.deadline ? project.deadline.toISOString() : "",
        color: project.color,
        totalTasks,
        completedTasks: 0,
        assignedMemberIds: [],
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      }, { workspaceId, projectId: project.id });

      return {
        success: true,
        data: { projectId: project.id, name: project.name, totalTasks },
        summary: `Berhasil membuat project "${project.name}" dengan ${payload.phases?.length || 0} fase dan ${totalTasks} tugas.`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.projectId) return false;
      const found = await prisma.project.findFirst({
        where: { id: result.projectId, workspaceId: context.workspaceId },
      });
      return !!found;
    },
    rollback: async (payload, context, result) => {
      if (result?.projectId) {
        await prisma.project.deleteMany({
          where: { id: result.projectId, workspaceId: context.workspaceId },
        }).catch(() => {});
      }
    },
  },

  ADD_MEMBER: {
    name: "ADD_MEMBER",
    description: "Menambahkan anggota workspace ke dalam tim proyek",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: ["userName"],
    optionalParams: ["projectId", "projectName", "role"],
    validate: (payload, context, sessionMap) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const clarifications: string[] = [];
      let needsClarification = false;

      const rawName = payload.userName || payload.memberName;
      if (!rawName) {
        errors.push("Nama anggota wajib disertakan.");
      } else {
        const res = resolveWorkspaceMember(rawName, context.members);
        if (res.notFound) {
          warnings.push(`Anggota "${rawName}" tidak ditemukan di workspace squad (akan dilewati).`);
        } else if (res.isAmbiguous) {
          needsClarification = true;
          clarifications.push(`Ditemukan beberapa anggota cocok dengan "${rawName}": ${res.candidates.join(", ")}. Anggota mana yang Anda maksud?`);
        }
      }

      return { isValid: errors.length === 0, errors, warnings, needsClarification, clarifications };
    },
    execute: async (payload, context, sessionMap) => {
      const { workspaceId, userId } = context;
      let targetProjectId =
        payload.projectId ||
        (payload.projectName ? sessionMap.get(payload.projectName.toLowerCase().trim()) : undefined) ||
        sessionMap.get("latest") ||
        context.currentProjectId;

      if (!targetProjectId) {
        throw new Error("Target project ID tidak ditemukan.");
      }

      // Tenant isolation: verify project belongs to active workspace
      const project = await prisma.project.findFirst({
        where: { id: targetProjectId, workspaceId },
      });
      if (!project) {
        throw new Error("Project tidak ditemukan di workspace ini.");
      }

      let targetUserId = payload.userId;
      let targetUserName = payload.userName || payload.memberName;
      if (!targetUserId && targetUserName) {
        const res = resolveWorkspaceMember(targetUserName, context.members);
        if (res.member) {
          targetUserId = res.member.userId;
          targetUserName = res.member.name;
        }
      }

      if (!targetUserId) {
        return {
          success: true,
          data: { projectId: targetProjectId, userName: targetUserName },
          summary: `Anggota "${targetUserName}" tidak terdaftar di workspace squad (dilewati).`,
        };
      }

      const existing = await prisma.projectMember.findFirst({
        where: { projectId: targetProjectId, userId: targetUserId },
      });

      if (!existing) {
        await prisma.projectMember.create({
          data: {
            projectId: targetProjectId,
            userId: targetUserId,
            role: (payload.role?.toUpperCase() as Role) || Role.MEMBER,
          },
        });

        if (targetUserId !== userId) {
          createNotification({
            workspaceId,
            userId: targetUserId,
            type: "PROJECT_MEMBER_ADDED",
            title: "Added to Project",
            description: `You were added to project "${project.name}".`,
            entityType: "PROJECT",
            entityId: targetProjectId,
            link: `/projects/${targetProjectId}`,
          }).catch(() => {});
        }

        realtimeClient.broadcast(`workspace:${workspaceId}`, "PROJECT_UPDATED", {
          id: targetProjectId,
        }, { workspaceId, projectId: targetProjectId });
      }

      return {
        success: true,
        data: { projectId: targetProjectId, userId: targetUserId, userName: targetUserName },
        summary: `Berhasil menambahkan ${targetUserName} ke dalam project "${project.name}".`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.projectId || !result?.userId) return false;
      const found = await prisma.projectMember.findFirst({
        where: {
          projectId: result.projectId,
          userId: result.userId,
          project: { workspaceId: context.workspaceId },
        },
      });
      return !!found;
    },
  },

  ADD_PROJECT_MEMBER: {
    name: "ADD_PROJECT_MEMBER",
    description: "Alias for ADD_MEMBER",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: ["userName"],
    optionalParams: ["projectId", "projectName", "role"],
    validate: (payload, context, sessionMap) => ACTION_REGISTRY.ADD_MEMBER.validate(payload, context, sessionMap),
    execute: (payload, context, sessionMap) => ACTION_REGISTRY.ADD_MEMBER.execute(payload, context, sessionMap),
    verify: (payload, context, result) => ACTION_REGISTRY.ADD_MEMBER.verify(payload, context, result),
  },

  CREATE_TASK: {
    name: "CREATE_TASK",
    description: "Membuat tugas baru pada proyek dan mengaitkannya ke fase",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: ["title"],
    optionalParams: ["projectId", "projectName", "phaseId", "phaseName", "assigneeName", "priority", "dueDate"],
    validate: (payload, context) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!payload.title || !payload.title.trim()) {
        errors.push("Task title is required.");
      }
      return { isValid: errors.length === 0, errors, warnings, needsClarification: false, clarifications: [] };
    },
    execute: async (payload, context, sessionMap) => {
      const { workspaceId, userId } = context;
      const targetProjectId =
        payload.projectId ||
        (payload.projectName ? sessionMap.get(payload.projectName.toLowerCase().trim()) : undefined) ||
        sessionMap.get("latest") ||
        context.currentProjectId;

      if (!targetProjectId) {
        throw new Error("Project ID tujuan tidak ditemukan untuk membuat task.");
      }

      // Tenant boundary verification
      const project = await prisma.project.findFirst({
        where: { id: targetProjectId, workspaceId },
      });
      if (!project) {
        throw new Error("Project tidak ditemukan di workspace ini.");
      }

      let assigneeId: string | null = payload.assigneeId || null;
      let assigneeName = payload.assigneeName;
      if (!assigneeId && assigneeName) {
        const res = resolveWorkspaceMember(assigneeName, context.members);
        if (res.member) {
          assigneeId = res.member.userId;
          assigneeName = res.member.name;
        }
      }

      let taskDue: Date | null = null;
      if (payload.dueDate) {
        const rd = resolveNaturalDate(payload.dueDate);
        if (rd) taskDue = new Date(rd.isoDate);
      }

      const task = await prisma.task.create({
        data: {
          workspaceId,
          projectId: targetProjectId,
          phaseId: payload.phaseId || null,
          title: payload.title.trim(),
          description: payload.description || null,
          status: (payload.status?.toUpperCase() as TaskStatus) || TaskStatus.TODO,
          priority: (payload.priority?.toUpperCase() as TaskPriority) || TaskPriority.MEDIUM,
          assigneeId,
          dueDate: taskDue,
        },
      });

      await prisma.project.update({
        where: { id: targetProjectId },
        data: { totalTasks: { increment: 1 } },
      }).catch(() => {});

      if (assigneeId && assigneeId !== userId) {
        createNotification({
          workspaceId,
          userId: assigneeId,
          type: "TASK_ASSIGNED",
          title: "Task Assigned",
          description: `You were assigned to "${task.title}".`,
          entityType: "TASK",
          entityId: task.id,
          link: `/tasks?taskId=${task.id}`,
        }).catch(() => {});
      }

      realtimeClient.broadcast(`workspace:${workspaceId}`, "TASK_CREATED", {
        id: task.id,
        workspaceId,
        projectId: targetProjectId,
        title: task.title,
        status: task.status.toLowerCase() as any,
        priority: task.priority.toLowerCase() as any,
      }, { workspaceId, projectId: targetProjectId });

      return {
        success: true,
        data: { taskId: task.id, title: task.title, projectId: targetProjectId },
        summary: `Berhasil membuat task "${task.title}".`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.taskId) return false;
      const found = await prisma.task.findFirst({
        where: { id: result.taskId, workspaceId: context.workspaceId },
      });
      return !!found;
    },
  },

  ASSIGN_TASK: {
    name: "ASSIGN_TASK",
    description: "Menugaskan task kepada anggota tim workspace",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: ["assigneeName"],
    optionalParams: ["taskId", "taskTitle", "projectId"],
    validate: (payload, context) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const clarifications: string[] = [];
      let needsClarification = false;

      const res = resolveWorkspaceMember(payload.assigneeName, context.members);
      if (res.notFound) {
        needsClarification = true;
        clarifications.push(`Anggota "${payload.assigneeName}" tidak ditemukan di workspace squad.`);
      } else if (res.isAmbiguous) {
        needsClarification = true;
        clarifications.push(`Ditemukan beberapa anggota bernama "${payload.assigneeName}": ${res.candidates.join(", ")}. Siapa yang Anda maksud?`);
      }

      return { isValid: errors.length === 0, errors, warnings, needsClarification, clarifications };
    },
    execute: async (payload, context, sessionMap) => {
      const { workspaceId, userId } = context;
      let targetTaskId = payload.taskId;
      if (!targetTaskId && payload.taskTitle) {
        const resTask = resolveWorkspaceTask(payload.taskTitle, context, payload.projectId);
        if (resTask.task) targetTaskId = resTask.task.id;
      }

      if (!targetTaskId) {
        throw new Error(`Task "${payload.taskTitle || "target"}" tidak ditemukan.`);
      }

      // Tenant boundary verification
      const existingTask = await prisma.task.findFirst({
        where: { id: targetTaskId, workspaceId },
      });
      if (!existingTask) {
        throw new Error(`Task tidak ditemukan di workspace ini.`);
      }

      let assigneeId = payload.assigneeId;
      let assigneeName = payload.assigneeName;
      const resMember = resolveWorkspaceMember(assigneeName, context.members);
      if (resMember.member) {
        assigneeId = resMember.member.userId;
        assigneeName = resMember.member.name;
      }

      if (!assigneeId) {
        throw new Error(`Anggota "${assigneeName}" tidak ditemukan.`);
      }

      const updated = await prisma.task.update({
        where: { id: targetTaskId },
        data: { assigneeId },
      });

      if (assigneeId !== userId) {
        createNotification({
          workspaceId,
          userId: assigneeId,
          type: "TASK_ASSIGNED",
          title: "Task Assigned",
          description: `You were assigned to "${updated.title}".`,
          entityType: "TASK",
          entityId: updated.id,
          link: `/tasks?taskId=${updated.id}`,
        }).catch(() => {});
      }

      realtimeClient.broadcast(`workspace:${workspaceId}`, "TASK_ASSIGNED", {
        taskId: updated.id,
        assigneeId,
        assigneeName,
      }, { workspaceId, projectId: updated.projectId, taskId: updated.id });

      return {
        success: true,
        data: { taskId: updated.id, assigneeId, assigneeName },
        summary: `Berhasil menugaskan task "${updated.title}" kepada ${assigneeName}.`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.taskId || !result?.assigneeId) return false;
      const task = await prisma.task.findFirst({
        where: { id: result.taskId, workspaceId: context.workspaceId },
      });
      return task?.assigneeId === result.assigneeId;
    },
  },

  CREATE_PHASE: {
    name: "CREATE_PHASE",
    description: "Membuat fase delivery baru pada project",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: ["name"],
    optionalParams: ["projectId", "projectName", "order"],
    validate: (payload) => {
      const errors: string[] = [];
      if (!payload.name) errors.push("Phase name is required.");
      return { isValid: errors.length === 0, errors, warnings: [], needsClarification: false, clarifications: [] };
    },
    execute: async (payload, context, sessionMap) => {
      const { workspaceId } = context;
      const targetProjId =
        payload.projectId ||
        (payload.projectName ? sessionMap.get(payload.projectName.toLowerCase().trim()) : undefined) ||
        sessionMap.get("latest") ||
        context.currentProjectId;

      if (!targetProjId) throw new Error("Project ID diperlukan untuk membuat fase.");

      // Tenant boundary verification
      const project = await prisma.project.findFirst({
        where: { id: targetProjId, workspaceId },
      });
      if (!project) throw new Error("Project tidak ditemukan di workspace ini.");

      const phase = await prisma.phase.create({
        data: {
          projectId: targetProjId,
          name: payload.name.trim(),
          order: payload.order || 0,
        },
      });

      realtimeClient.broadcast(`workspace:${workspaceId}`, "PHASE_CREATED", {
        id: phase.id,
        projectId: targetProjId,
        name: phase.name,
      }, { workspaceId, projectId: targetProjId });

      return {
        success: true,
        data: { phaseId: phase.id, name: phase.name, projectId: targetProjId },
        summary: `Berhasil membuat fase "${phase.name}".`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.phaseId) return false;
      const found = await prisma.phase.findFirst({
        where: {
          id: result.phaseId,
          project: { workspaceId: context.workspaceId },
        },
      });
      return !!found;
    },
  },

  UPDATE_PROJECT: {
    name: "UPDATE_PROJECT",
    description: "Memperbarui nama, status, atau deadline project",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: [],
    optionalParams: ["projectId", "projectName", "name", "deadline", "status", "description"],
    validate: () => ({ isValid: true, errors: [], warnings: [], needsClarification: false, clarifications: [] }),
    execute: async (payload, context, sessionMap) => {
      const targetProjId = payload.projectId || sessionMap.get(payload.projectName?.toLowerCase() || "") || context.currentProjectId;
      if (!targetProjId) throw new Error("Project ID diperlukan untuk update.");

      // Tenant boundary verification
      const project = await prisma.project.findFirst({
        where: { id: targetProjId, workspaceId: context.workspaceId },
      });
      if (!project) throw new Error("Project tidak ditemukan di workspace ini.");

      let deadlineDate: Date | undefined = undefined;
      if (payload.deadline) {
        const rd = resolveNaturalDate(payload.deadline);
        if (rd) deadlineDate = new Date(rd.isoDate);
      }

      const updated = await prisma.project.update({
        where: { id: targetProjId },
        data: {
          name: payload.name || undefined,
          description: payload.description !== undefined ? payload.description : undefined,
          deadline: deadlineDate,
          status: payload.status || undefined,
        },
      });

      return {
        success: true,
        data: updated,
        summary: `Berhasil memperbarui project "${updated.name}".`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.id) return false;
      const found = await prisma.project.findFirst({
        where: { id: result.id, workspaceId: context.workspaceId },
      });
      return !!found;
    },
  },

  UPDATE_TASK: {
    name: "UPDATE_TASK",
    description: "Memperbarui title, status, priority, atau deadline task",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: [],
    optionalParams: ["taskId", "taskTitle", "title", "status", "priority", "dueDate", "assigneeName"],
    validate: () => ({ isValid: true, errors: [], warnings: [], needsClarification: false, clarifications: [] }),
    execute: async (payload, context) => {
      let targetTaskId = payload.taskId;
      if (!targetTaskId && payload.taskTitle) {
        const resTask = resolveWorkspaceTask(payload.taskTitle, context);
        if (resTask.task) targetTaskId = resTask.task.id;
      }
      if (!targetTaskId) throw new Error("Task ID diperlukan untuk update.");

      // Tenant boundary verification
      const existingTask = await prisma.task.findFirst({
        where: { id: targetTaskId, workspaceId: context.workspaceId },
      });
      if (!existingTask) throw new Error("Task tidak ditemukan di workspace ini.");

      let dueDate: Date | undefined = undefined;
      if (payload.dueDate) {
        const rd = resolveNaturalDate(payload.dueDate);
        if (rd) dueDate = new Date(rd.isoDate);
      }

      const updated = await prisma.task.update({
        where: { id: targetTaskId },
        data: {
          title: payload.title || undefined,
          status: payload.status ? (payload.status.toUpperCase() as TaskStatus) : undefined,
          priority: payload.priority ? (payload.priority.toUpperCase() as TaskPriority) : undefined,
          dueDate,
        },
      });

      return {
        success: true,
        data: updated,
        summary: `Berhasil memperbarui task "${updated.title}".`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.id) return false;
      const found = await prisma.task.findFirst({
        where: { id: result.id, workspaceId: context.workspaceId },
      });
      return !!found;
    },
  },

  DELETE_PROJECT: {
    name: "DELETE_PROJECT",
    description: "Menghapus project beserta seluruh task dan fase di dalamnya secara permanen",
    riskLevel: "HIGH",
    requiredRole: Role.ADMIN,
    requiredParams: [],
    optionalParams: ["id", "name"],
    validate: (payload, context) => {
      const res = resolveWorkspaceProject(payload.name || payload.id, context);
      if (res.isAmbiguous) {
        return {
          isValid: true,
          errors: [],
          warnings: [],
          needsClarification: true,
          clarifications: [`Terdapat beberapa project yang cocok (${res.candidates.join(", ")}). Project mana yang ingin Anda hapus?`],
        };
      }
      return { isValid: true, errors: [], warnings: ["Tindakan ini permanen dan akan menghapus seluruh data project."], needsClarification: false, clarifications: [] };
    },
    execute: async (payload, context) => {
      const res = resolveWorkspaceProject(payload.name || payload.id, context);
      const targetId = res.project?.id || payload.id;
      if (!targetId) throw new Error("Project tidak ditemukan untuk dihapus.");

      // Tenant boundary verification
      const project = await prisma.project.findFirst({
        where: { id: targetId, workspaceId: context.workspaceId },
      });
      if (!project) throw new Error("Project tidak ditemukan di workspace ini.");

      await prisma.project.delete({ where: { id: targetId } });
      return {
        success: true,
        data: { deletedId: targetId },
        summary: `Project "${project.name}" berhasil dihapus secara permanen.`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.deletedId) return false;
      const found = await prisma.project.findFirst({
        where: { id: result.deletedId, workspaceId: context.workspaceId },
      });
      return found === null; // Verified deleted
    },
  },

  DELETE_TASK: {
    name: "DELETE_TASK",
    description: "Menghapus task dari project secara permanen",
    riskLevel: "HIGH",
    requiredRole: Role.MEMBER,
    requiredParams: [],
    optionalParams: ["id", "name"],
    validate: () => ({ isValid: true, errors: [], warnings: [], needsClarification: false, clarifications: [] }),
    execute: async (payload, context) => {
      const targetId = payload.id;
      if (!targetId) throw new Error("Task ID diperlukan untuk dihapus.");

      // Tenant boundary verification
      const task = await prisma.task.findFirst({
        where: { id: targetId, workspaceId: context.workspaceId },
      });
      if (!task) throw new Error("Task tidak ditemukan di workspace ini.");

      await prisma.task.delete({ where: { id: targetId } });
      return {
        success: true,
        data: { deletedId: targetId },
        summary: `Task "${task.title}" berhasil dihapus.`,
      };
    },
    verify: async (payload, context, result) => {
      if (!result?.deletedId) return false;
      const found = await prisma.task.findFirst({
        where: { id: result.deletedId, workspaceId: context.workspaceId },
      });
      return found === null;
    },
  },

  UPDATE_PHASE: {
    name: "UPDATE_PHASE",
    description: "Memperbarui fase delivery",
    riskLevel: "MEDIUM",
    requiredRole: Role.MEMBER,
    requiredParams: ["phaseId"],
    optionalParams: ["name", "order"],
    validate: (payload) => ({ isValid: !!payload.phaseId, errors: payload.phaseId ? [] : ["Phase ID required"], warnings: [], needsClarification: false, clarifications: [] }),
    execute: async (payload, context) => {
      // Tenant boundary verification
      const phase = await prisma.phase.findFirst({
        where: { id: payload.phaseId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!phase || phase.project.workspaceId !== context.workspaceId) {
        throw new Error("Fase tidak ditemukan di workspace ini.");
      }

      const updated = await prisma.phase.update({
        where: { id: payload.phaseId },
        data: { name: payload.name || undefined, order: payload.order !== undefined ? payload.order : undefined },
      });
      return { success: true, data: updated, summary: `Berhasil memperbarui fase "${updated.name}".` };
    },
    verify: async (payload, context, result) => {
      if (!result?.id) return false;
      const found = await prisma.phase.findFirst({
        where: {
          id: result.id,
          project: { workspaceId: context.workspaceId },
        },
      });
      return !!found;
    },
  },

  DELETE_PHASE: {
    name: "DELETE_PHASE",
    description: "Menghapus fase delivery",
    riskLevel: "HIGH",
    requiredRole: Role.ADMIN,
    requiredParams: ["id"],
    optionalParams: ["name"],
    validate: () => ({ isValid: true, errors: [], warnings: [], needsClarification: false, clarifications: [] }),
    execute: async (payload, context) => {
      // Tenant boundary verification
      const phase = await prisma.phase.findFirst({
        where: { id: payload.id },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!phase || phase.project.workspaceId !== context.workspaceId) {
        throw new Error("Fase tidak ditemukan di workspace ini.");
      }

      await prisma.phase.delete({ where: { id: payload.id } });
      return { success: true, data: { deletedId: payload.id }, summary: `Fase berhasil dihapus.` };
    },
    verify: async (payload, context, result) => {
      if (!result?.deletedId) return false;
      const found = await prisma.phase.findFirst({
        where: {
          id: result.deletedId,
          project: { workspaceId: context.workspaceId },
        },
      });
      return found === null;
    },
  },

  REMOVE_MEMBER: {
    name: "REMOVE_MEMBER",
    description: "Menghapus anggota dari project",
    riskLevel: "HIGH",
    requiredRole: Role.ADMIN,
    requiredParams: ["projectId", "userId"],
    optionalParams: ["userName"],
    validate: () => ({ isValid: true, errors: [], warnings: [], needsClarification: false, clarifications: [] }),
    execute: async (payload, context) => {
      // Tenant boundary verification
      const project = await prisma.project.findFirst({
        where: { id: payload.projectId, workspaceId: context.workspaceId },
      });
      if (!project) throw new Error("Project tidak ditemukan di workspace ini.");

      await prisma.projectMember.deleteMany({
        where: { projectId: payload.projectId, userId: payload.userId },
      });
      return { success: true, data: payload, summary: `Anggota berhasil dikeluarkan dari project.` };
    },
    verify: async (payload, context) => {
      const found = await prisma.projectMember.findFirst({
        where: {
          projectId: payload.projectId,
          userId: payload.userId,
          project: { workspaceId: context.workspaceId },
        },
      });
      return found === null;
    },
  },

  REMOVE_PROJECT_MEMBER: {
    name: "REMOVE_PROJECT_MEMBER",
    description: "Alias for REMOVE_MEMBER",
    riskLevel: "HIGH",
    requiredRole: Role.ADMIN,
    requiredParams: ["projectId", "userId"],
    optionalParams: ["userName"],
    validate: (p, c, s) => ACTION_REGISTRY.REMOVE_MEMBER.validate(p, c, s),
    execute: (p, c, s) => ACTION_REGISTRY.REMOVE_MEMBER.execute(p, c, s),
    verify: (p, c, r) => ACTION_REGISTRY.REMOVE_MEMBER.verify(p, c, r),
  },
};
