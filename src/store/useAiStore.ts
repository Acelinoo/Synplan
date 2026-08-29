import { create } from "zustand";
import { AiChatMessage, AiPlan, AiExecutionResult } from "@/lib/ai/types";

interface AiState {
  isOpen: boolean;
  messages: AiChatMessage[];
  isPlanning: boolean;
  isExecuting: boolean;
  currentPlan: AiPlan | null;
  pendingConfirmationPlan: AiPlan | null;

  // Actions
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  addMessage: (msg: AiChatMessage) => void;
  setIsPlanning: (loading: boolean) => void;
  setIsExecuting: (executing: boolean) => void;
  setCurrentPlan: (plan: AiPlan | null) => void;
  setPendingConfirmationPlan: (plan: AiPlan | null) => void;
  clearMessages: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  isOpen: false,
  messages: [
    {
      id: "msg_initial",
      role: "assistant",
      content:
        "Hello! I am your **Synplan AI Assistant**. How can I help you manage projects, create delivery phases, or assign tasks today?",
      timestamp: new Date().toISOString(),
    },
  ],
  isPlanning: false,
  isExecuting: false,
  currentPlan: null,
  pendingConfirmationPlan: null,

  setOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
    })),

  setIsPlanning: (isPlanning) => set({ isPlanning }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setCurrentPlan: (currentPlan) => set({ currentPlan }),
  setPendingConfirmationPlan: (pendingConfirmationPlan) => set({ pendingConfirmationPlan }),

  clearMessages: () =>
    set({
      messages: [
        {
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: "Conversation cleared. What project or task would you like to build next?",
          timestamp: new Date().toISOString(),
        },
      ],
      currentPlan: null,
      pendingConfirmationPlan: null,
    }),
}));
