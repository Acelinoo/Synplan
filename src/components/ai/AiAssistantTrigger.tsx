"use client";

import * as React from "react";
import { Bot, Sparkles } from "lucide-react";
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
        aria-label="Toggle AI Assistant"
        aria-expanded={isOpen}
        className={cn(
          "relative flex h-8 items-center gap-1.5 rounded-md border border-border bg-card hover:bg-muted/70 px-2.5 text-xs font-medium text-foreground transition-colors cursor-pointer shadow-2xs",
          isOpen && "ring-1 ring-ring",
          className
        )}
        title="AI Workflow Assistant"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline text-xs">AI Assistant</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleOpen}
      aria-label="Open AI Assistant"
      aria-expanded={isOpen}
      className={cn(
        "fixed bottom-5 right-5 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary-hover active:scale-95 transition-all cursor-pointer border border-primary/20",
        isOpen && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        className
      )}
      title="Open AI Assistant"
    >
      <Sparkles className="h-4 w-4" />
      <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background" />
    </button>
  );
}
