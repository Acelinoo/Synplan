"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  CheckSquare,
  Users2,
  Trash2,
  RotateCcw,
  Calendar,
  ChevronRight,
  FolderKanban,
  Edit3,
  Undo2,
  Clock,
  History,
  ShieldAlert,
  Info,
  Check,
} from "lucide-react";
import { Role } from "@prisma/client";
import { useAiStore, useWorkspaceStore, useTaskStore, useUiStore } from "@/store";
import { usePermissions } from "@/hooks/usePermissions";
import { apiClient } from "@/lib/apiClient";
import { AiPlan, AiAction, AiExecutionResult, ExecutionReceipt } from "@/lib/ai/types";
import {
  getSlashSuggestions,
  parseSlashCommand,
  SlashSuggestion,
  SlashAutocompleteContext,
} from "@/lib/ai/slash";
import { SlashCommandAutocomplete } from "./SlashCommandAutocomplete";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const suggestedPrompts = [
  "/create project Website Cafe ABC",
  "/assign task Desain ke Marchel",
  "/status task Desain Homepage done",
  "Task apa saja yang belum selesai?",
];

export function AiAssistantDrawer() {
  const pathname = usePathname();
  const { activeWorkspace, projects, members } = useWorkspaceStore();
  const { tasks } = useTaskStore();
  const { normalizedRole } = usePermissions();
  const { addToast } = useUiStore();
  const {
    isOpen,
    setOpen,
    messages,
    addMessage,
    isPlanning,
    setIsPlanning,
    isExecuting,
    setIsExecuting,
    clearMessages,
  } = useAiStore();

  const [activeTab, setActiveTab] = React.useState<"chat" | "history">("chat");
  const [input, setInput] = React.useState("");
  const [conversationId] = React.useState<string>(
    () => `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  );
  const [editingPlanId, setEditingPlanId] = React.useState<string | null>(null);
  const [editingParams, setEditingParams] = React.useState<{
    projectName?: string;
    deadline?: string;
    taskTitle?: string;
    assigneeName?: string;
  }>({});
  const [executionHistory, setExecutionHistory] = React.useState<any[]>([]);
  const [selectedReceiptDetail, setSelectedReceiptDetail] = React.useState<any | null>(null);

  // Slash Command State
  const [slashSuggestions, setSlashSuggestions] = React.useState<SlashSuggestion[]>([]);
  const [slashSelectedIndex, setSlashSelectedIndex] = React.useState(0);
  const [isSlashOpen, setIsSlashOpen] = React.useState(false);
  const [phases, setPhases] = React.useState<any[]>([]);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pendingClarificationRef = React.useRef<any>(null);

  // Fetch phases for active projects to ground slash entity suggestions
  React.useEffect(() => {
    if (activeWorkspace?.id && projects.length > 0) {
      const activeProjId = projects[0]?.id;
      if (activeProjId) {
        apiClient.getPhases(activeProjId).then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setPhases(res.data);
          }
        }).catch(() => {});
      }
    }
  }, [activeWorkspace?.id, projects]);

  // Build Autocomplete Context
  const slashContext: SlashAutocompleteContext = React.useMemo(() => {
    return {
      userRole: normalizedRole,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        totalTasks: p.totalTasks,
        deadline: p.deadline,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        projectId: t.projectId,
        phaseId: t.phaseId,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assigneeId,
        dueDate: t.dueDate,
      })),
      phases: phases.map((ph) => ({
        id: ph.id,
        name: ph.name,
        projectId: ph.projectId,
        order: ph.order,
      })),
      members: members.map((m) => ({
        id: m.id,
        userId: m.user?.id || m.id,
        name: m.user?.name || "Squad Member",
        role: (m.role?.toUpperCase() as Role) || Role.MEMBER,
        email: m.user?.email || null,
      })),
      currentProjectId: projects.find((p) => pathname.includes(p.id))?.id || projects[0]?.id,
    };
  }, [normalizedRole, projects, tasks, phases, members, pathname]);

  // Handle Input Change and compute suggestions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);

    if (val.trimStart().startsWith("/")) {
      const suggestions = getSlashSuggestions(val, slashContext);
      setSlashSuggestions(suggestions);
      setSlashSelectedIndex(0);
      setIsSlashOpen(suggestions.length > 0);
    } else {
      setIsSlashOpen(false);
      setSlashSuggestions([]);
    }
  };

  const handleSelectSuggestion = (suggestion: SlashSuggestion) => {
    if (suggestion.disabled) return;

    const newValue = suggestion.value;
    setInput(newValue);

    // Compute next level of suggestions immediately
    const nextSuggestions = getSlashSuggestions(newValue, slashContext);
    setSlashSuggestions(nextSuggestions);
    setSlashSelectedIndex(0);
    setIsSlashOpen(nextSuggestions.length > 0);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Keyboard navigation for slash commands
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSlashOpen || slashSuggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashSelectedIndex((prev) => (prev + 1) % slashSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashSelectedIndex((prev) => (prev - 1 + slashSuggestions.length) % slashSuggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      const selected = slashSuggestions[slashSelectedIndex];
      if (selected) {
        e.preventDefault();
        handleSelectSuggestion(selected);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsSlashOpen(false);
    }
  };

  // Auto-scroll to bottom of conversation
  React.useEffect(() => {
    if (isOpen && activeTab === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, isPlanning, isExecuting, activeTab]);

  // Fetch execution history when opening history tab
  const fetchHistory = React.useCallback(async () => {
    try {
      const res = await apiClient.getAiExecutionHistory();
      if (res.success && Array.isArray(res.data)) {
        setExecutionHistory(res.data);
      }
    } catch (e) {
      console.warn("[AI Drawer] Error loading execution history:", e);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen && activeTab === "history") {
      fetchHistory();
    }
  }, [isOpen, activeTab, fetchHistory]);

  // Determine current active project context from pathname
  const currentProjectId = React.useMemo(() => {
    const match = pathname.match(/\/projects\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : undefined;
  }, [pathname]);

  const activeProject = React.useMemo(() => {
    if (!currentProjectId) return undefined;
    return projects.find((p) => p.id === currentProjectId);
  }, [currentProjectId, projects]);

  if (!isOpen) return null;

  const handleSendPrompt = async (promptToSend?: string) => {
    const text = (promptToSend || input).trim();
    if (!text || isPlanning || isExecuting) return;

    setInput("");
    setIsSlashOpen(false);

    // 1. Add User Message
    addMessage({
      id: `usr_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    // 2. Check if input is a slash command
    let promptForEngine = text;
    if (text.startsWith("/")) {
      const parsed = parseSlashCommand(text, slashContext);
      if (parsed.error) {
        addMessage({
          id: `ast_${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Perintah tidak valid**: ${parsed.error}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (parsed.naturalLanguagePrompt) {
        promptForEngine = parsed.naturalLanguagePrompt;
      }
    }

    setIsPlanning(true);

    try {
      const selectedTaskId = useTaskStore.getState().selectedTaskId;
      const currentView = pathname.includes("/calendar")
        ? "calendar"
        : pathname.includes("/tasks")
        ? "tasks"
        : pathname.includes("/projects")
        ? "projects"
        : pathname.includes("/team")
        ? "team"
        : pathname.includes("/analytics") || pathname.includes("/reports")
        ? "analytics"
        : "dashboard";

      // 3. Call Plan Generation API (with full UI context, conversational history, and pending clarification)
      const res = await apiClient.generateAiPlan({
        prompt: promptForEngine,
        conversationId,
        currentProjectId,
        currentTaskId: selectedTaskId || undefined,
        currentView,
        activePath: pathname,
        conversationHistory: messages
          .slice(-8)
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        pendingClarification: pendingClarificationRef.current || undefined,
      });

      if (res.success && res.data) {
        const plan: AiPlan = res.data;

        // Track pending clarification state for cross-turn resolution
        if (plan.clarificationState) {
          pendingClarificationRef.current = plan.clarificationState;
        } else if (!plan.needsClarification) {
          pendingClarificationRef.current = null;
        }

        // Add Assistant Message with Plan
        addMessage({
          id: `ast_${Date.now()}`,
          role: "assistant",
          content: plan.assistantMessage,
          plan,
          timestamp: new Date().toISOString(),
        });

        // If plan is low-risk and does not require confirmation, execute immediately
        if (
          !plan.requiresConfirmation &&
          !plan.isDestructive &&
          !plan.needsClarification &&
          plan.riskLevel === "LOW" &&
          plan.actions.length > 0
        ) {
          executePlan(plan, true);
        }
      } else {
        addMessage({
          id: `ast_${Date.now()}`,
          role: "assistant",
          content:
            res.error ||
            "Saya tidak dapat memproses permintaan tersebut. Silakan coba jelaskan kembali instruksi Anda.",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      addMessage({
        id: `ast_${Date.now()}`,
        role: "assistant",
        content: `Error saat memproses rencana: ${err?.message || "Unknown error"}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsPlanning(false);
    }
  };

  const handleStartEditPlan = (plan: AiPlan) => {
    const projectAct = plan.actions.find((a) => a.type === "CREATE_PROJECT");
    const taskAct = plan.actions.find((a) => a.type === "CREATE_TASK" || a.type === "ASSIGN_TASK");
    const memberAct = plan.actions.find((a) => a.type === "ADD_MEMBER" || a.type === "ADD_PROJECT_MEMBER");

    setEditingParams({
      projectName: projectAct?.payload?.name || "",
      deadline: projectAct?.payload?.deadline || "",
      taskTitle: taskAct?.payload?.title || "",
      assigneeName: taskAct?.payload?.assigneeName || memberAct?.payload?.userName || "",
    });
    setEditingPlanId(plan.id);
  };

  const handleSaveAndRevalidate = async () => {
    if (!editingPlanId) return;

    const edits: string[] = [];
    if (editingParams.projectName) edits.push(`nama project "${editingParams.projectName}"`);
    if (editingParams.deadline) edits.push(`deadline ${editingParams.deadline}`);
    if (editingParams.taskTitle) edits.push(`task "${editingParams.taskTitle}"`);
    if (editingParams.assigneeName) edits.push(`assign ke ${editingParams.assigneeName}`);

    const promptText = `Ubah rencana menjadi: ${edits.join(", ")}`;
    setEditingPlanId(null);
    await handleSendPrompt(promptText);
  };

  const executePlan = async (plan: AiPlan, confirmed = true) => {
    setIsExecuting(true);
    try {
      const res = await apiClient.executeAiPlan({
        plan,
        confirmed,
        confirmationToken: plan.confirmationToken,
        planFingerprint: plan.planFingerprint,
        conversationId,
      });

      if (res.success && res.data) {
        const execResult: AiExecutionResult = res.data;
        const isPartial = execResult.status === "PARTIAL_SUCCESS";

        addMessage({
          id: `exec_${Date.now()}`,
          role: "assistant",
          content: isPartial
            ? `⚠️ **Eksekusi Sebagian Selesai**\n\n${execResult.summary}`
            : `✅ **Rencana Berhasil Dieksekusi!**\n\n${execResult.summary}`,
          executionResult: execResult,
          timestamp: new Date().toISOString(),
        });

        addToast({
          title: isPartial ? "Aksi Sebagian Berhasil" : "Aksi AI Berhasil",
          description: execResult.summary,
          variant: isPartial ? "warning" : "success",
        });

        fetchHistory();
      } else {
        addMessage({
          id: `exec_err_${Date.now()}`,
          role: "assistant",
          content: `❌ **Eksekusi Gagal**: ${res.error || "Tidak dapat mengeksekusi rencana aksi."}`,
          timestamp: new Date().toISOString(),
        });

        addToast({
          title: "Error Eksekusi",
          description: res.error || "Gagal mengeksekusi aksi",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addMessage({
        id: `exec_err_${Date.now()}`,
        role: "assistant",
        content: `❌ **Error Sistem Eksekusi**: ${err?.message || "Koneksi jaringan terganggu"}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUndo = async () => {
    await handleSendPrompt("undo that");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={() => setOpen(false)}
      />

      {/* Sliding Drawer */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-5 bg-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-sm">Synplan AI Assistant</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {activeProject ? `Konteks: ${activeProject.name}` : `Workspace: ${activeWorkspace?.name || "Production"}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg bg-surface border border-border p-0.5 text-xs mr-2">
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer text-xs",
                  activeTab === "chat" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer text-xs flex items-center gap-1",
                  activeTab === "history" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <History className="h-3 w-3" />
                <span>Riwayat</span>
              </button>
            </div>

            <button
              type="button"
              onClick={clearMessages}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              title="Bersihkan percakapan"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              title="Tutup drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab 1: Chat Stream */}
        {activeTab === "chat" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1.5 max-w-[92%]",
                  msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                {/* Message Bubble */}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-xs",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground font-medium rounded-tr-xs"
                      : "bg-surface border border-border text-foreground rounded-tl-xs"
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Plan Preview Card if Assistant generated a plan */}
                  {msg.plan && (
                    <div className="mt-3 space-y-3 rounded-xl border border-border/80 bg-card p-3.5 text-foreground">
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-primary flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5" />
                            Rencana Aksi ({msg.plan.actions.length} langkah)
                          </span>
                        </div>
                        {msg.plan.riskLevel === "CRITICAL" ? (
                          <span className="flex items-center gap-1 rounded-md bg-destructive/10 border border-destructive/30 px-2 py-0.5 text-[10px] font-bold text-destructive">
                            <ShieldAlert className="h-3 w-3" />
                            Kritis (Konfirmasi Wajib)
                          </span>
                        ) : msg.plan.riskLevel === "HIGH" ? (
                          <span className="flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                            <AlertTriangle className="h-3 w-3" />
                            Risiko Tinggi
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                            <CheckCircle2 className="h-3 w-3" />
                            Aman
                          </span>
                        )}
                      </div>

                      {/* Interactive Clarification State & Candidate Selection */}
                      {msg.plan.clarificationState && msg.plan.clarificationState.candidates.length > 0 && (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span>{msg.plan.clarificationState.message}</span>
                          </p>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {msg.plan.clarificationState.candidates.map((cand) => (
                              <button
                                key={cand.id}
                                type="button"
                                onClick={() => handleSendPrompt(cand.name)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-surface border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary transition-all shadow-xs cursor-pointer"
                              >
                                <Users2 className="h-3 w-3 text-primary" />
                                <span>{cand.name}</span>
                              </button>
                            ))}
                            {msg.plan.clarificationState.allowMultiSelect && msg.plan.clarificationState.candidates.length >= 2 && (
                              <button
                                type="button"
                                onClick={() => handleSendPrompt("Keduanya")}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-all shadow-xs cursor-pointer"
                              >
                                <Sparkles className="h-3 w-3" />
                                <span>Pilih Keduanya</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Inline Edit Form */}
                      {editingPlanId === msg.plan.id ? (
                        <div className="rounded-xl border border-primary/40 bg-surface p-3 space-y-2.5 animate-in fade-in">
                          <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Edit Parameter Rencana:</span>
                          </p>
                          <div className="space-y-2 text-xs">
                            <div>
                              <label className="text-[11px] text-muted-foreground block mb-0.5">Nama Proyek</label>
                              <input
                                type="text"
                                value={editingParams.projectName || ""}
                                onChange={(e) => setEditingParams({ ...editingParams, projectName: e.target.value })}
                                className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
                                placeholder="Nama proyek..."
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground block mb-0.5">Deadline</label>
                              <input
                                type="text"
                                value={editingParams.deadline || ""}
                                onChange={(e) => setEditingParams({ ...editingParams, deadline: e.target.value })}
                                className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
                                placeholder="e.g. 5 September 2026..."
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground block mb-0.5">Penugasan / Anggota Tim</label>
                              <input
                                type="text"
                                value={editingParams.assigneeName || ""}
                                onChange={(e) => setEditingParams({ ...editingParams, assigneeName: e.target.value })}
                                className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
                                placeholder="Nama anggota..."
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingPlanId(null)}
                              className="h-7 text-xs"
                            >
                              Batal Edit
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveAndRevalidate}
                              className="h-7 text-xs font-semibold"
                            >
                              Terapkan & Validasi Ulang
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Actions Breakdown / Ground-Truth Preview List */
                        msg.plan.actions.length > 0 && (
                          <div className="space-y-2">
                            {msg.plan.actionPreviews && msg.plan.actionPreviews.length > 0
                              ? msg.plan.actionPreviews.map((prev, idx) => (
                                  <div
                                    key={prev.actionId || idx}
                                    className={`rounded-xl border p-2.5 text-xs space-y-1.5 transition-colors ${
                                      prev.isDestructive || prev.riskLevel === "CRITICAL"
                                        ? "bg-red-500/5 border-red-500/30"
                                        : prev.riskLevel === "HIGH"
                                        ? "bg-rose-500/5 border-rose-500/30"
                                        : prev.riskLevel === "MEDIUM"
                                        ? "bg-amber-500/5 border-amber-500/30"
                                        : "bg-surface/70 border-border/60"
                                    }`}
                                  >
                                    {/* Action Header & Risk Badge */}
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-foreground">
                                          {prev.entityType}
                                        </span>
                                        <span className="font-semibold text-foreground truncate">
                                          {prev.entityName}
                                        </span>
                                      </div>

                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold shrink-0 uppercase tracking-wider ${
                                          prev.riskLevel === "CRITICAL"
                                            ? "bg-red-500/15 text-red-500 border border-red-500/30"
                                            : prev.riskLevel === "HIGH"
                                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                            : prev.riskLevel === "MEDIUM"
                                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                            : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                        }`}
                                      >
                                        {prev.riskLevel}
                                      </span>
                                    </div>

                                    {/* Summary */}
                                    <p className="text-[11px] text-muted-foreground">{prev.summary}</p>

                                    {/* Before -> After Diff Pills */}
                                    {prev.changes && prev.changes.length > 0 && (
                                      <div className="flex flex-wrap gap-1 pt-1">
                                        {prev.changes.map((chg, cIdx) => (
                                          <div
                                            key={cIdx}
                                            className="rounded-md bg-foreground/5 border border-border/40 px-2 py-0.5 text-[10px] text-foreground flex items-center gap-1"
                                          >
                                            <span className="text-muted-foreground font-medium">{chg.field}:</span>
                                            {chg.from && (
                                              <>
                                                <span className="line-through text-muted-foreground/70">{chg.from}</span>
                                                <span className="text-primary font-bold">→</span>
                                              </>
                                            )}
                                            <span className="font-semibold text-foreground">{chg.to}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Warning Banner */}
                                    {prev.warning && (
                                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-1.5 text-[10px] text-red-500 flex items-center gap-1.5">
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        <span>{prev.warning}</span>
                                      </div>
                                    )}
                                  </div>
                                ))
                              : msg.plan.actions.map((act, idx) => (
                                  <div
                                    key={act.id || idx}
                                    className="flex items-start gap-2 rounded-lg bg-surface/70 p-2 text-xs border border-border/40"
                                  >
                                    <div className="mt-0.5">
                                      {act.type === "CREATE_PROJECT" ? (
                                        <FolderKanban className="h-3.5 w-3.5 text-primary shrink-0" />
                                      ) : act.type === "CREATE_PHASE" ? (
                                        <Layers className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                                      ) : act.type === "ASSIGN_TASK" ? (
                                        <Users2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                      ) : act.isDestructive ? (
                                        <Trash2 className="h-3.5 w-3.5 text-destructive shrink-0" />
                                      ) : (
                                        <CheckSquare className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-foreground">{act.summary}</p>
                                      {act.warnings && act.warnings.length > 0 && (
                                        <p className="text-[10px] text-amber-500 mt-0.5">
                                          ⚠️ {act.warnings.join(" ")}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                          </div>
                        )
                      )}

                      {/* Warnings List */}
                      {msg.plan.warnings && msg.plan.warnings.length > 0 && (
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-[11px] text-amber-600 dark:text-amber-400 space-y-0.5">
                          {msg.plan.warnings.map((w, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Interactive Confirmation Bar */}
                      {msg.plan.requiresConfirmation && editingPlanId !== msg.plan.id && (
                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/60">
                          <button
                            type="button"
                            onClick={() => handleStartEditPlan(msg.plan!)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Edit Rencana</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isExecuting}
                              onClick={() => handleSendPrompt("batal")}
                              className="h-8 text-xs cursor-pointer"
                            >
                              Batal
                            </Button>
                            <Button
                              variant={msg.plan.isDestructive ? "destructive" : "default"}
                              size="sm"
                              disabled={isExecuting}
                              onClick={() => executePlan(msg.plan!, true)}
                              className="h-8 gap-1.5 text-xs font-semibold cursor-pointer"
                            >
                              {isExecuting ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Mengeksekusi...
                                </>
                              ) : msg.plan.isDestructive ? (
                                "Konfirmasi & Hapus"
                              ) : (
                                "Konfirmasi & Eksekusi"
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Execution Result Details & Undo Button */}
                  {msg.executionResult && (
                    <div className="mt-2.5 space-y-2 border-t border-border/50 pt-2 text-xs">
                      {msg.executionResult.receipt && msg.executionResult.receipt.actions.length > 0 && (
                        <div className="space-y-1">
                          {msg.executionResult.receipt.actions.map((actItem, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                            >
                              {actItem.status === "SUCCESS" ? (
                                <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                              ) : actItem.status === "BLOCKED" ? (
                                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              ) : (
                                <XCircle className="h-3 w-3 text-destructive shrink-0" />
                              )}
                              <span className={actItem.status === "FAILED" ? "text-destructive" : ""}>
                                {actItem.summary}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.executionResult.receipt?.reversible && (
                        <div className="pt-1 flex items-center justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUndo}
                            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <Undo2 className="h-3 w-3" />
                            <span>Undo / Batalkan Aksi Ini</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] font-mono text-muted-foreground px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}

            {/* Planning Loader */}
            {isPlanning && (
              <div className="flex items-center gap-2 rounded-xl bg-surface border border-border p-3 text-xs text-muted-foreground w-fit animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Menganalisis instruksi dan menyusun rencana terstruktur...</span>
              </div>
            )}

            {/* Executing Real Progress Loader */}
            {isExecuting && (
              <div className="flex items-center gap-2.5 rounded-xl bg-surface border border-primary/30 p-3 text-xs text-primary w-fit animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-semibold">Mengeksekusi rencana aksi ke database...</p>
                  <p className="text-[10px] text-muted-foreground">Memverifikasi integritas database dan menyiarkan pembaruan realtime</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Tab 2: Activity / Execution History */}
        {activeTab === "history" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>Riwayat Eksekusi AI Terbaru</span>
              </h4>
              <button
                type="button"
                onClick={fetchHistory}
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                Segarkan
              </button>
            </div>

            {executionHistory.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground space-y-1">
                <History className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="font-medium">Belum ada riwayat eksekusi.</p>
                <p className="text-[11px]">Aksi yang dieksekusi oleh AI akan dicatat di sini.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {executionHistory.map((receipt, idx) => (
                  <div
                    key={receipt.executionId || idx}
                    className="rounded-xl border border-border bg-surface/70 p-3 text-xs space-y-2 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(receipt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {new Date(receipt.timestamp).toLocaleDateString()}
                      </span>
                      {receipt.status === "SUCCESS" ? (
                        <span className="rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5">
                          ✓ Sukses
                        </span>
                      ) : receipt.status === "PARTIAL_SUCCESS" ? (
                        <span className="rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-bold px-2 py-0.5">
                          ⚠️ Sebagian
                        </span>
                      ) : (
                        <span className="rounded-full bg-destructive/10 text-destructive text-[10px] font-bold px-2 py-0.5">
                          ✕ Gagal
                        </span>
                      )}
                    </div>

                    <p className="font-medium text-foreground">{receipt.summary}</p>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <span>{receipt.actionCount} aksi dieksekusi</span>
                      {receipt.reversible && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab("chat");
                            handleSendPrompt("undo that");
                          }}
                          className="text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Undo2 className="h-3 w-3" />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Suggested Chips (Only on chat tab with empty conversation) */}
        {activeTab === "chat" && messages.length <= 2 && (
          <div className="px-4 pb-2">
            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Saran instruksi:</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendPrompt(p)}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-left cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt Input Footer */}
        {activeTab === "chat" && (
          <div className="relative border-t border-border p-3 sm:p-4 bg-surface/40">
            {/* Slash Command Autocomplete Dropdown */}
            <SlashCommandAutocomplete
              suggestions={slashSuggestions}
              selectedIndex={slashSelectedIndex}
              onSelect={handleSelectSuggestion}
              onHoverIndex={setSlashSelectedIndex}
              isOpen={isSlashOpen}
              currentInput={input}
            />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsSlashOpen(false);
                handleSendPrompt();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder="Ketik '/' untuk perintah atau instruksi bebas..."
                disabled={isPlanning || isExecuting}
                className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all"
              />
              <Button
                type="submit"
                disabled={!input.trim() || isPlanning || isExecuting}
                className="h-10 w-10 shrink-0 rounded-xl p-0 cursor-pointer"
              >
                {isPlanning || isExecuting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        )}
      </aside>
    </>
  );
}
