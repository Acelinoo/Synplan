"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { useAiStore } from "@/store";
import { cn } from "@/lib/utils";

interface AiAssistantTriggerProps {
  className?: string;
  variant?: "floating" | "header";
}

export function AiAssistantTrigger({ className, variant = "floating" }: AiAssistantTriggerProps) {
  const { toggleOpen, isOpen } = useAiStore();

  if (variant === "header") {
    return (
      <button
        onClick={toggleOpen}
        className={cn(
          "relative flex h-9 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20 transition-all cursor-pointer shadow-xs",
          isOpen && "ring-2 ring-primary/40",
          className
        )}
        title="AI Project & Task Assistant"
      >
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="hidden sm:inline">AI Assistant</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleOpen}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-indigo-500 text-white shadow-xl hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-white/20",
        isOpen && "rotate-12 ring-4 ring-primary/30",
        className
      )}
      title="Open AI Assistant (Create Projects, Tasks & Phases)"
    >
      <Sparkles className="h-6 w-6" />
      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-card" />
    </button>
  );
}
