import { Role } from "@prisma/client";
import { SlashCommandNode } from "./types";

/**
 * Centralized, extensible, and recursive Slash Command Registry for Synplan AI Assistant.
 * Maps slash commands and subcommands directly to existing Phase 2-4 Action Engine intents.
 */
export const SLASH_COMMAND_REGISTRY: SlashCommandNode[] = [
  // =========================================================================
  // 1. /create (Project, Task, Phase)
  // =========================================================================
  {
    name: "create",
    label: "/create",
    description: "Buat project baru, tugas (task), atau fase (phase)",
    aliases: ["buat", "new", "add"],
    category: "create",
    icon: "PlusCircle",
    requiredPermission: "projects.create",
    requiredRole: Role.MEMBER,
    riskLevel: "MEDIUM",
    subcommands: [
      {
        name: "project",
        label: "project",
        description: "Buat project baru dengan rencana struktur dan fase",
        argumentType: "text",
        argumentPlaceholder: "Nama project (e.g. Website Toko Buah)",
        requiredPermission: "projects.create",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        toNaturalLanguage: (args) => {
          const name = args.text || args.project || args.name || "Project Baru";
          return `buat project ${name}`;
        },
      },
      {
        name: "task",
        label: "task",
        description: "Buat tugas baru di dalam project",
        argumentType: "text",
        argumentPlaceholder: "Judul task (e.g. Desain Landing Page)",
        requiredPermission: "tasks.create",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        toNaturalLanguage: (args, context) => {
          const title = args.text || args.task || args.title || "Task Baru";
          const proj = context?.currentProjectId
            ? context.projects.find((p) => p.id === context.currentProjectId)?.name
            : undefined;
          return proj ? `buat task ${title} di project ${proj}` : `buat task ${title}`;
        },
      },
      {
        name: "phase",
        label: "phase",
        description: "Buat fase baru di dalam alur kerja project",
        argumentType: "text",
        argumentPlaceholder: "Nama phase (e.g. UI/UX Design)",
        requiredPermission: "phases.create",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        toNaturalLanguage: (args, context) => {
          const name = args.text || args.phase || args.name || "Phase Baru";
          const proj = context?.currentProjectId
            ? context.projects.find((p) => p.id === context.currentProjectId)?.name
            : undefined;
          return proj ? `buat phase ${name} di project ${proj}` : `buat phase ${name}`;
        },
      },
    ],
  },

  // =========================================================================
  // 2. /edit (Project, Phase, Task)
  // =========================================================================
  {
    name: "edit",
    label: "/edit",
    description: "Ubah detail project, phase, atau atribut task",
    aliases: ["ubah", "update", "modify"],
    category: "edit",
    icon: "Edit3",
    requiredPermission: "tasks.update",
    requiredRole: Role.MEMBER,
    riskLevel: "MEDIUM",
    subcommands: [
      {
        name: "project",
        label: "project",
        description: "Ubah nama atau deadline project",
        requiredPermission: "projects.update",
        requiredRole: Role.MEMBER,
        riskLevel: "HIGH",
        subcommands: [
          {
            name: "name",
            label: "name",
            description: "Ganti nama project",
            argumentType: "entity_project",
            argumentPlaceholder: "Pilih project lalu ketik nama baru",
            toNaturalLanguage: (args) => {
              const proj = args.entity_project || args.project || "";
              const newName = args.name || args.text || "";
              return newName ? `rename project ${proj} menjadi ${newName}` : `ubah project ${proj}`;
            },
          },
          {
            name: "deadline",
            label: "deadline",
            description: "Ubah tenggat waktu penyelesaian project",
            argumentType: "entity_project",
            argumentPlaceholder: "Pilih project lalu masukkan tanggal deadline",
            toNaturalLanguage: (args) => {
              const proj = args.entity_project || args.project || "";
              const date = args.date || args.text || "";
              return date ? `ubah deadline project ${proj} jadi ${date}` : `ubah deadline project ${proj}`;
            },
          },
        ],
      },
      {
        name: "phase",
        label: "phase",
        description: "Ubah nama fase project",
        requiredPermission: "phases.update",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        subcommands: [
          {
            name: "name",
            label: "name",
            description: "Ganti nama phase",
            argumentType: "entity_phase",
            argumentPlaceholder: "Pilih phase lalu ketik nama baru",
            toNaturalLanguage: (args) => {
              const phase = args.entity_phase || args.phase || "";
              const newName = args.name || args.text || "";
              return newName ? `rename phase ${phase} menjadi ${newName}` : `ubah phase ${phase}`;
            },
          },
        ],
      },
      {
        name: "task",
        label: "task",
        description: "Ubah judul, deadline, prioritas, status, assignee, atau phase task",
        requiredPermission: "tasks.update",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        subcommands: [
          {
            name: "title",
            label: "title",
            description: "Ganti judul task",
            argumentType: "entity_task",
            argumentPlaceholder: "Pilih task lalu ketik judul baru",
            toNaturalLanguage: (args) => {
              const task = args.entity_task || args.task || "";
              const newTitle = args.title || args.text || "";
              return newTitle ? `rename task ${task} jadi ${newTitle}` : `ubah ${task}`;
            },
          },
          {
            name: "deadline",
            label: "deadline",
            description: "Ubah tenggat waktu deadline task",
            argumentType: "entity_task",
            argumentPlaceholder: "Pilih task lalu masukkan tanggal deadline",
            toNaturalLanguage: (args) => {
              const task = args.entity_task || args.task || "";
              const date = args.date || args.text || "";
              return date ? `ubah deadline task ${task} jadi ${date}` : `ubah deadline task ${task}`;
            },
          },
          {
            name: "priority",
            label: "priority",
            description: "Ubah tingkat prioritas task (LOW, MEDIUM, HIGH, URGENT)",
            argumentType: "entity_task",
            argumentPlaceholder: "Pilih task lalu pilih prioritas",
            toNaturalLanguage: (args) => {
              const task = args.entity_task || args.task || "";
              const priority = args.enum_priority || args.priority || "MEDIUM";
              return `ubah priority task ${task} jadi ${priority.toLowerCase()}`;
            },
          },
          {
            name: "status",
            label: "status",
            description: "Ubah status task (TODO, IN_PROGRESS, IN_REVIEW, DONE, BLOCKED)",
            argumentType: "entity_task",
            argumentPlaceholder: "Pilih task lalu pilih status",
            toNaturalLanguage: (args) => {
              const task = args.entity_task || args.task || "";
              const status = args.enum_status || args.status || "DONE";
              return status.toUpperCase() === "DONE"
                ? `selesaikan task ${task}`
                : `ubah status task ${task} jadi ${status.toLowerCase()}`;
            },
          },
          {
            name: "assignee",
            label: "assignee",
            description: "Tugaskan task kepada anggota tim workspace",
            argumentType: "entity_task",
            argumentPlaceholder: "Pilih task lalu pilih anggota",
            toNaturalLanguage: (args) => {
              const task = args.entity_task || args.task || "";
              const member = args.entity_member || args.member || args.assignee || "";
              return `assign task ${task} ke ${member}`;
            },
          },
          {
            name: "phase",
            label: "phase",
            description: "Pindahkan task ke fase lain",
            argumentType: "entity_task",
            argumentPlaceholder: "Pilih task lalu pilih fase tujuan",
            toNaturalLanguage: (args) => {
              const task = args.entity_task || args.task || "";
              const phase = args.entity_phase || args.phase || "";
              return `pindahkan task ${task} ke phase ${phase}`;
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 3. /delete (Project, Phase, Task One, Task All)
  // =========================================================================
  {
    name: "delete",
    label: "/delete",
    description: "Hapus project, phase, atau tugas (task)",
    aliases: ["hapus", "remove", "del"],
    category: "delete",
    icon: "Trash2",
    requiredPermission: "tasks.delete",
    requiredRole: Role.MEMBER,
    riskLevel: "HIGH",
    isDestructive: true,
    subcommands: [
      {
        name: "project",
        label: "project",
        description: "Hapus seluruh project beserta seluruh data di dalamnya",
        argumentType: "entity_project",
        argumentPlaceholder: "Pilih project yang ingin dihapus",
        requiredPermission: "projects.delete",
        requiredRole: Role.ADMIN,
        riskLevel: "CRITICAL",
        isDestructive: true,
        toNaturalLanguage: (args) => {
          const proj = args.entity_project || args.project || "";
          return `hapus project ${proj}`;
        },
      },
      {
        name: "phase",
        label: "phase",
        description: "Hapus fase alur kerja",
        argumentType: "entity_phase",
        argumentPlaceholder: "Pilih phase yang ingin dihapus",
        requiredPermission: "phases.delete",
        requiredRole: Role.ADMIN,
        riskLevel: "HIGH",
        isDestructive: true,
        toNaturalLanguage: (args) => {
          const phase = args.entity_phase || args.phase || "";
          return `hapus phase ${phase}`;
        },
      },
      {
        name: "task",
        label: "task",
        description: "Hapus satu tugas spesifik atau semua tugas dalam project",
        requiredPermission: "tasks.delete",
        requiredRole: Role.MEMBER,
        riskLevel: "HIGH",
        isDestructive: true,
        subcommands: [
          {
            name: "one",
            label: "one",
            description: "Hapus satu tugas spesifik",
            argumentType: "entity_task",
            argumentPlaceholder: "Pilih task yang ingin dihapus",
            requiredPermission: "tasks.delete",
            requiredRole: Role.MEMBER,
            riskLevel: "HIGH",
            isDestructive: true,
            toNaturalLanguage: (args) => {
              const task = args.entity_task || args.task || "";
              return `hapus task ${task}`;
            },
          },
          {
            name: "all",
            label: "all",
            description: "Hapus semua tugas di dalam project tertentu (Operasi Batch)",
            argumentType: "entity_project",
            argumentPlaceholder: "Pilih project target untuk penghapusan semua task",
            requiredPermission: "tasks.delete",
            requiredRole: Role.ADMIN,
            riskLevel: "HIGH",
            isDestructive: true,
            toNaturalLanguage: (args) => {
              const proj = args.entity_project || args.project || "";
              return `hapus semua task di project ${proj}`;
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 4. /assign (Task to Member)
  // =========================================================================
  {
    name: "assign",
    label: "/assign",
    description: "Tugaskan task kepada anggota workspace",
    aliases: ["tugaskan", "kasih"],
    category: "assign",
    icon: "UserPlus",
    requiredPermission: "tasks.assign",
    requiredRole: Role.MEMBER,
    riskLevel: "MEDIUM",
    subcommands: [
      {
        name: "task",
        label: "task",
        description: "Pilih task yang akan ditugaskan",
        argumentType: "entity_task",
        argumentPlaceholder: "Pilih task lalu pilih anggota penerima tugas",
        requiredPermission: "tasks.assign",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        toNaturalLanguage: (args) => {
          const task = args.entity_task || args.task || "";
          const member = args.entity_member || args.member || "";
          return member ? `assign task ${task} ke ${member}` : `assign ${task}`;
        },
      },
    ],
  },

  // =========================================================================
  // 5. /move (Task to Phase)
  // =========================================================================
  {
    name: "move",
    label: "/move",
    description: "Pindahkan task ke fase lain dalam project",
    aliases: ["pindahkan", "geser"],
    category: "move",
    icon: "FolderKanban",
    requiredPermission: "tasks.update",
    requiredRole: Role.MEMBER,
    riskLevel: "MEDIUM",
    subcommands: [
      {
        name: "task",
        label: "task",
        description: "Pilih task yang ingin dipindahkan ke fase lain",
        argumentType: "entity_task",
        argumentPlaceholder: "Pilih task lalu pilih fase tujuan",
        requiredPermission: "tasks.update",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        toNaturalLanguage: (args) => {
          const task = args.entity_task || args.task || "";
          const phase = args.entity_phase || args.phase || "";
          return phase ? `pindahkan task ${task} ke phase ${phase}` : `pindahkan ${task}`;
        },
      },
    ],
  },

  // =========================================================================
  // 6. /status (Task Status Transition)
  // =========================================================================
  {
    name: "status",
    label: "/status",
    description: "Ubah status pengerjaan task (TODO, IN_PROGRESS, DONE, dll)",
    aliases: ["state"],
    category: "status",
    icon: "CheckSquare",
    requiredPermission: "tasks.change_status",
    requiredRole: Role.MEMBER,
    riskLevel: "MEDIUM",
    subcommands: [
      {
        name: "task",
        label: "task",
        description: "Pilih task untuk memperbarui statusnya",
        argumentType: "entity_task",
        argumentPlaceholder: "Pilih task lalu pilih status baru",
        requiredPermission: "tasks.change_status",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        toNaturalLanguage: (args) => {
          const task = args.entity_task || args.task || "";
          const status = args.enum_status || args.status || "DONE";
          return status.toUpperCase() === "DONE"
            ? `selesaikan task ${task}`
            : `ubah status task ${task} jadi ${status.toLowerCase()}`;
        },
      },
    ],
  },

  // =========================================================================
  // 7. /priority (Task Priority Level)
  // =========================================================================
  {
    name: "priority",
    label: "/priority",
    description: "Ubah prioritas task (LOW, MEDIUM, HIGH, URGENT)",
    aliases: ["prioritas"],
    category: "priority",
    icon: "AlertTriangle",
    requiredPermission: "tasks.change_priority",
    requiredRole: Role.MEMBER,
    riskLevel: "MEDIUM",
    subcommands: [
      {
        name: "task",
        label: "task",
        description: "Pilih task untuk memperbarui tingkat urgensinya",
        argumentType: "entity_task",
        argumentPlaceholder: "Pilih task lalu tentukan level prioritas",
        requiredPermission: "tasks.change_priority",
        requiredRole: Role.MEMBER,
        riskLevel: "MEDIUM",
        toNaturalLanguage: (args) => {
          const task = args.entity_task || args.task || "";
          const priority = args.enum_priority || args.priority || "HIGH";
          return `ubah priority task ${task} jadi ${priority.toLowerCase()}`;
        },
      },
    ],
  },

  // =========================================================================
  // 8. /plan (AI Project Creation & Planning Entry Point)
  // =========================================================================
  {
    name: "plan",
    label: "/plan",
    description: "Rencanakan dan buat project baru dengan bantuan AI Project Creation",
    aliases: ["rencana", "project-plan"],
    category: "plan",
    icon: "Sparkles",
    argumentType: "text",
    argumentPlaceholder: "Deskripsikan project Anda (e.g. Website Cafe ABC deadline 1 Okt)",
    requiredPermission: "projects.create",
    requiredRole: Role.MEMBER,
    riskLevel: "MEDIUM",
    toNaturalLanguage: (args) => {
      const text = args.text || args.plan || "";
      return text ? `buat project ${text}` : `buat project baru`;
    },
  },
];
