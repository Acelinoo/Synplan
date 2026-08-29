"use client";

import * as React from "react";
import {
  X,
  FolderPlus,
  Sparkles,
  Calendar,
  Layers,
  Check,
  ArrowLeft,
  Users2,
  CheckSquare,
  AlertTriangle,
  Send,
  Loader2,
  Bot,
} from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import { Project } from "@/types";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { AiPlan } from "@/lib/ai/types";

const projectColors = [
  { name: "Indigo", value: "#6366F1" },
  { name: "Emerald", value: "#10B981" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Rose", value: "#EF4444" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Sky", value: "#0EA5E9" },
];

const suggestionChips = [
  "Website toko online",
  "Project mobile app",
  "Website company profile",
  "Project marketing",
];

interface ProjectModalProps {
  editingProject?: Project | null;
  onClose?: () => void;
}

export function ProjectModal({ editingProject, onClose }: ProjectModalProps) {
  const { isCreateProjectModalOpen, setCreateProjectModalOpen, addToast } = useUiStore();
  const { addProject, setProjects, updateProject, activeWorkspace, members, setMembers } = useWorkspaceStore();

  const isOpen = editingProject ? true : isCreateProjectModalOpen;

  // Modal Flow Mode: "CHOICE" | "AI" | "MANUAL"
  const [modalMode, setModalMode] = React.useState<"CHOICE" | "AI" | "MANUAL">(
    editingProject ? "MANUAL" : "CHOICE"
  );

  // Manual Form States
  const [name, setName] = React.useState(editingProject?.name || "");
  const [description, setDescription] = React.useState(editingProject?.description || "");
  const [deadline, setDeadline] = React.useState(editingProject?.deadline || "2026-09-30");
  const [color, setColor] = React.useState(editingProject?.color || "#6366F1");
  const [status, setStatus] = React.useState<Project["status"]>(editingProject?.status || "active");
  const [selectedMembers, setSelectedMembers] = React.useState<string[]>(
    editingProject?.assignedMemberIds || []
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // AI Creation States
  const [aiPrompt, setAiPrompt] = React.useState("");
  const [isGeneratingPlan, setIsGeneratingPlan] = React.useState(false);
  const [isExecutingPlan, setIsExecutingPlan] = React.useState(false);
  const [aiPlan, setAiPlan] = React.useState<AiPlan | null>(null);
  const [conversationHistory, setConversationHistory] = React.useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [conversationalInput, setConversationalInput] = React.useState("");

  // Fetch squad members if empty
  React.useEffect(() => {
    async function loadSquadMembers() {
      if (isOpen && (!members || members.length === 0)) {
        try {
          const res = await apiClient.getTeamMembers();
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            const mapped = res.data.map((m: any) => ({
              id: m.id,
              workspaceId: m.workspaceId,
              user: {
                id: m.userId,
                name: m.name,
                email: m.email,
                role: m.role?.toLowerCase() || "member",
              },
              role: m.role?.toLowerCase() || "member",
              joinedAt: m.joinedAt,
              assignedTasksCount: m.activeTaskCount || 0,
              workloadScore: m.workloadScore || 0,
            }));
            setMembers(mapped);
          }
        } catch (e) {
          // ignore
        }
      }
    }
    loadSquadMembers();
  }, [isOpen, members, setMembers]);

  const squadList = React.useMemo(() => {
    if (members && members.length > 0) {
      return members.map((m) => ({
        id: m.user?.id || m.id,
        name: m.user?.name || m.user?.email || "Member",
        initial: (m.user?.name || "M").charAt(0).toUpperCase(),
      }));
    }
    return [];
  }, [members]);

  React.useEffect(() => {
    if (!isOpen) return;

    if (editingProject) {
      setModalMode("MANUAL");
      setName(editingProject.name || "");
      setDescription(editingProject.description || "");
      setDeadline(editingProject.deadline ? editingProject.deadline.split("T")[0] : "2026-09-30");
      setColor(editingProject.color || "#6366F1");
      setStatus(editingProject.status || "active");
      setSelectedMembers(
        Array.isArray(editingProject.assignedMemberIds) && editingProject.assignedMemberIds.length > 0
          ? editingProject.assignedMemberIds
          : []
      );
    } else {
      setModalMode("CHOICE");
      setName("");
      setDescription("");
      setDeadline("2026-09-30");
      setColor("#6366F1");
      setStatus("active");
      setSelectedMembers([]);
      setAiPrompt("");
      setAiPlan(null);
      setConversationHistory([]);
      setConversationalInput("");
    }
  }, [isOpen, editingProject]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (onClose) onClose();
    setCreateProjectModalOpen(false);
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      return current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId];
    });
  };

  // Manual Form Submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (editingProject) {
        const res = await apiClient.updateProject(editingProject.id, {
          name: name.trim(),
          description: description.trim(),
          deadline: new Date(deadline).toISOString(),
          color,
          status: status.toUpperCase(),
        });

        if (res.success) {
          updateProject(editingProject.id, {
            name: name.trim(),
            description: description.trim(),
            deadline,
            color,
            status,
            assignedMemberIds: selectedMembers,
            updatedAt: new Date().toISOString(),
          });
          addToast({
            title: "Project Updated",
            description: `Project "${name.trim()}" has been updated.`,
            variant: "success",
          });
          handleClose();
        } else {
          addToast({
            title: "Update Failed",
            description: res.error || "Failed to update project",
            variant: "danger",
          });
        }
      } else {
        const res = await apiClient.createProject({
          name: name.trim(),
          description: description.trim(),
          deadline: new Date(deadline).toISOString(),
          color,
          status: status.toUpperCase(),
          memberIds: selectedMembers,
        });

        if (res.success && res.data) {
          addProject({
            id: res.data.id,
            workspaceId: res.data.workspaceId || activeWorkspace?.id || "workspace-1",
            name: res.data.name,
            description: res.data.description || "",
            progress: 0,
            status: (res.data.status?.toLowerCase() as any) || "active",
            deadline: res.data.deadline || deadline,
            color: res.data.color || color,
            totalTasks: 0,
            completedTasks: 0,
            assignedMemberIds: selectedMembers,
            createdAt: res.data.createdAt || new Date().toISOString(),
            updatedAt: res.data.updatedAt || new Date().toISOString(),
          });
          addToast({
            title: "Project Created",
            description: `Project "${name.trim()}" has been created.`,
            variant: "success",
          });
          handleClose();
        } else {
          addToast({
            title: "Creation Failed",
            description: res.error || "Failed to create project",
            variant: "danger",
          });
        }
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "An unexpected error occurred",
        variant: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate AI Action Plan
  const handleGenerateAiPlan = async (customPrompt?: string) => {
    const promptToUse = customPrompt || aiPrompt;
    if (!promptToUse.trim() || isGeneratingPlan) return;

    setIsGeneratingPlan(true);
    try {
      const historyPayload = [...conversationHistory, { role: "user" as const, content: promptToUse }];
      const res = await apiClient.generateAiPlan({
        prompt: promptToUse,
        conversationHistory: historyPayload,
      });

      if (res.success && res.data) {
        setAiPlan(res.data);
        setConversationHistory([
          ...historyPayload,
          { role: "assistant", content: res.data.assistantMessage || "Rencana project telah disiapkan." },
        ]);
        setConversationalInput("");
      } else {
        addToast({
          title: "AI Generation Error",
          description: res.error || "Could not generate project plan",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "AI Error",
        description: err?.message || "Failed to contact AI service",
        variant: "danger",
      });
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Execute AI Action Plan into PostgreSQL
  const handleExecuteAiPlan = async () => {
    if (!aiPlan || isExecutingPlan) return;

    setIsExecutingPlan(true);
    try {
      const res = await apiClient.executeAiPlan({
        plan: aiPlan,
        confirmed: true,
      });

      if (res.success) {
        apiClient.invalidate("/api/projects");
        apiClient.invalidate("/api/dashboard/summary");

        try {
          const fresh = await apiClient.getProjects({ workspaceId: activeWorkspace?.id });
          if (fresh.success && Array.isArray(fresh.data)) {
            setProjects(fresh.data);
          }
        } catch (e) {
          // ignore
        }

        addToast({
          title: "Project Created Successfully ✨",
          description: res.data?.summary || res.message || "Project, phases, and tasks created.",
          variant: "success",
        });
        handleClose();
      } else {
        addToast({
          title: "Execution Error",
          description: res.error || res.message || "Failed to execute project plan",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Execution Error",
        description: err?.message || "Failed to execute plan",
        variant: "danger",
      });
    } finally {
      setIsExecutingPlan(false);
    }
  };

  // Extract structured preview data from AI plan
  const createProjectAction = aiPlan?.actions.find((a) => a.type === "CREATE_PROJECT");
  const memberActions = aiPlan?.actions.filter(
    (a) => a.type === "ADD_MEMBER" || a.type === "ADD_PROJECT_MEMBER"
  ) || [];
  const taskActions = aiPlan?.actions.filter((a) => a.type === "CREATE_TASK") || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface/40">
          <div className="flex items-center gap-3">
            {modalMode !== "CHOICE" && !editingProject && (
              <button
                type="button"
                onClick={() => setModalMode("CHOICE")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Back to options"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              {modalMode === "AI" ? (
                <Sparkles className="h-5 w-5" />
              ) : (
                <FolderPlus className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-foreground text-base">
                {editingProject
                  ? "Edit Project"
                  : modalMode === "CHOICE"
                  ? "Create New Project"
                  : modalMode === "AI"
                  ? "Create Project with AI"
                  : "Create Project Manually"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {modalMode === "CHOICE"
                  ? "Choose how you'd like to build your new workspace project."
                  : modalMode === "AI"
                  ? "Describe your project naturally and let AI configure everything."
                  : "Fill in the details to set up your project."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* ========================================================= */}
          {/* 1. CHOICE MODE: Choose between AI vs Manual               */}
          {/* ========================================================= */}
          {modalMode === "CHOICE" && !editingProject && (
            <div className="space-y-4 py-2">
              {/* Option A: Create with AI (Recommended) */}
              <button
                type="button"
                onClick={() => setModalMode("AI")}
                className="group relative w-full text-left rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-card to-card p-5 hover:border-primary transition-all duration-200 shadow-xs hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm group-hover:scale-105 transition-transform">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-foreground text-sm">Create with AI</h3>
                        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                          ✨ Recommended
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Describe your project naturally. Synplan AI will build delivery phases, tasks, deadlines, and assign team members automatically.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Use AI Assistant &rarr;
                  </span>
                </div>
              </button>

              {/* Separator */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-border" />
                <span className="flex-shrink mx-4 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
                  OR
                </span>
                <div className="flex-grow border-t border-border" />
              </div>

              {/* Option B: Create Manually */}
              <button
                type="button"
                onClick={() => setModalMode("MANUAL")}
                className="group w-full text-left rounded-xl border border-border bg-surface/50 p-5 hover:bg-surface hover:border-border/80 transition-all duration-200"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:text-foreground transition-colors">
                    <FolderPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-sm">Create Manually</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Fill in project name, description, deadlines, color, and assign squad members yourself using the standard form.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                    Create Manually &rarr;
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* 2. AI CREATION MODE                                       */}
          {/* ========================================================= */}
          {modalMode === "AI" && (
            <div className="space-y-4">
              {!aiPlan ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground">
                      Tell Synplan what you want to create
                    </label>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleGenerateAiPlan();
                        }
                      }}
                      rows={4}
                      placeholder="Contoh: Buatin projek website toko buah, deadline 1 September. Tambahkan Marchel dan Sarah ke tim. Buat task desain homepage dan assign ke Marchelino."
                      className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                    />
                  </div>

                  {/* Suggestion Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground">Contoh ide:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestionChips.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAiPrompt(`Buatkan ${chip} dengan deadline akhir bulan dan assign ke Marchelino.`)}
                          className="rounded-lg bg-surface border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 flex justify-between items-center border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setModalMode("CHOICE")}
                    >
                      Back
                    </Button>
                    <MagnetButton
                      type="button"
                      disabled={!aiPrompt.trim() || isGeneratingPlan}
                      onClick={() => handleGenerateAiPlan()}
                      className="gap-2 bg-primary text-primary-foreground font-semibold px-4"
                    >
                      {isGeneratingPlan ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Generating Plan...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          <span>Generate Project Plan</span>
                        </>
                      )}
                    </MagnetButton>
                  </div>
                </>
              ) : (
                /* Structured AI Preview Card */
                <div className="space-y-4">
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                      <span className="font-bold text-xs text-primary flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4" /> Structured Project Preview
                      </span>
                      <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                        {aiPlan.planner === "llm" ? "Gemini LLM" : "Fallback NLP"}
                      </span>
                    </div>

                    {/* Clarification Alert if ambiguous */}
                    {aiPlan.needsClarification && aiPlan.clarificationsNeeded && aiPlan.clarificationsNeeded.length > 0 && (
                      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-500 space-y-1">
                        <p className="font-bold text-[11px] flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" /> Klarifikasi Diperlukan:
                        </p>
                        <ul className="list-disc list-inside text-[11px] text-foreground/90 space-y-0.5">
                          {aiPlan.clarificationsNeeded.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Project Overview */}
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Project Name
                        </span>
                        <p className="font-bold text-foreground text-sm">
                          {createProjectAction?.payload?.name || "New Project"}
                        </p>
                      </div>

                      {createProjectAction?.payload?.deadline && (
                        <div>
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Target Deadline
                          </span>
                          <p className="font-medium text-foreground flex items-center gap-1.5 mt-0.5">
                            <Calendar className="h-3.5 w-3.5 text-primary" />
                            {createProjectAction.payload.deadline}
                          </p>
                        </div>
                      )}

                      {/* Team Members */}
                      {memberActions.length > 0 && (
                        <div>
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Team Members ({memberActions.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {memberActions.map((m, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 rounded-md bg-surface border border-border px-2 py-0.5 text-xs text-foreground"
                              >
                                <Users2 className="h-3 w-3 text-primary" />
                                {m.payload?.userName || m.payload?.memberName || "Member"}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tasks Overview */}
                      {taskActions.length > 0 && (
                        <div>
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Tasks ({taskActions.length})
                          </span>
                          <div className="space-y-1 mt-1 max-h-32 overflow-y-auto pr-1">
                            {taskActions.map((t, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-lg bg-surface/80 p-2 text-xs border border-border/50"
                              >
                                <span className="font-medium text-foreground flex items-center gap-1.5">
                                  <CheckSquare className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                  {t.payload?.title}
                                </span>
                                {t.payload?.assigneeName && (
                                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {t.payload.assigneeName}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Conversational Refinement Input */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Mau ubah sesuatu? Ketik instruksi lanjutan:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={conversationalInput}
                        onChange={(e) => setConversationalInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (conversationalInput.trim()) {
                              handleGenerateAiPlan(conversationalInput);
                            }
                          }
                        }}
                        placeholder="Contoh: Tambahkan Devon ke tim dan ubah deadline jadi 15 September"
                        className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!conversationalInput.trim() || isGeneratingPlan}
                        onClick={() => handleGenerateAiPlan(conversationalInput)}
                        className="h-9 px-3"
                      >
                        {isGeneratingPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 flex justify-between items-center border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAiPlan(null)}
                    >
                      Edit Prompt
                    </Button>
                    <div className="flex items-center gap-2">
                      <MagnetButton
                        type="button"
                        disabled={isExecutingPlan}
                        onClick={handleExecuteAiPlan}
                        className="gap-2 bg-primary text-primary-foreground font-semibold px-4"
                      >
                        {isExecutingPlan ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Creating Project...</span>
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4" />
                            <span>Create Project Now</span>
                          </>
                        )}
                      </MagnetButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 3. MANUAL CREATION MODE (Preserved 100%)                   */}
          {/* ========================================================= */}
          {modalMode === "MANUAL" && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              {/* Project Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Project Name *</span>
                  {!editingProject && (
                    <button
                      type="button"
                      onClick={() => setModalMode("AI")}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      <Sparkles className="h-3 w-3" /> Switch to AI
                    </button>
                  )}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Website Redesign"
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary/20"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Briefly describe the project goals..."
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary/20 resize-none"
                />
              </div>

              {/* Color Accent & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Color Accent</label>
                  <div className="flex items-center gap-1.5 py-1">
                    {projectColors.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.value)}
                        className={cn(
                          "h-6 w-6 rounded-full transition-transform",
                          color === c.value
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-card scale-110"
                            : "hover:scale-105 opacity-80"
                        )}
                        style={{ backgroundColor: c.value }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Project["status"])}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on-hold">On Hold</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              {/* Deadline */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Target Deadline</span>
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                />
              </div>

              {/* Assigned Squad Members */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Assigned Squad</span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {selectedMembers.length} selected
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                  {squadList.map((m) => {
                    const isSelected = selectedMembers.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMember(m.id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all border",
                          isSelected
                            ? "bg-primary/10 border-primary text-primary font-medium"
                            : "bg-surface border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold">
                          {m.initial}
                        </span>
                        <span>{m.name}</span>
                        {isSelected && <Check className="h-3 w-3 ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex justify-end gap-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <MagnetButton
                  type="submit"
                  disabled={!name.trim() || isSubmitting}
                  className="bg-primary text-primary-foreground font-semibold px-4"
                >
                  {isSubmitting
                    ? "Saving..."
                    : editingProject
                    ? "Save Changes"
                    : "Create Project"}
                </MagnetButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
