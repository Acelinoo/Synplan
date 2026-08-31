"use client";

import * as React from "react";
import { Bot } from "lucide-react";
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
        aria-label="Toggle AI Project & Task Assistant"
        aria-expanded={isOpen}
        className={cn(
          "relative flex h-9 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 transition-all cursor-pointer shadow-xs",
          isOpen && "ring-2 ring-white/40",
          className
        )}
        title="AI Project & Task Assistant"
      >
        <Bot className="h-4 w-4 text-sky-300" />
        <span className="hidden sm:inline">AI Assistant</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleOpen}
      aria-label="Open AI Project & Task Assistant"
      aria-expanded={isOpen}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-primary/20",
        isOpen && "ring-4 ring-primary/30",
        className
      )}
      title="Open AI Assistant (Create Projects, Tasks & Phases)"
    >
      <Bot className="h-6 w-6" />
      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-card" />
    </button>
  );
}
