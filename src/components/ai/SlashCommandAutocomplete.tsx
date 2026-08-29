"use client";

import * as React from "react";
import {
  Sparkles,
  PlusCircle,
  Edit3,
  Trash2,
  UserPlus,
  FolderKanban,
  CheckSquare,
  AlertTriangle,
  Layers,
  User,
  Command,
  ChevronRight,
  ShieldAlert,
  Info,
  Calendar,
  Lock,
} from "lucide-react";
import { SlashSuggestion } from "@/lib/ai/slash/types";
import { cn } from "@/lib/utils";

interface SlashCommandAutocompleteProps {
  suggestions: SlashSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: SlashSuggestion) => void;
  onHoverIndex: (index: number) => void;
  isOpen: boolean;
  currentInput: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Sparkles,
  PlusCircle,
  Edit3,
  Trash2,
  UserPlus,
  FolderKanban,
  CheckSquare,
  AlertTriangle,
  Layers,
  User,
  Command,
  ChevronRight,
  ShieldAlert,
  Calendar,
};

export function SlashCommandAutocomplete({
  suggestions,
  selectedIndex,
  onSelect,
  onHoverIndex,
  isOpen,
  currentInput,
}: SlashCommandAutocompleteProps) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to selected index in list
  React.useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen || suggestions.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Slash command suggestions"
      className="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-hidden rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header bar / Breadcrumb hint */}
      <div className="flex items-center justify-between border-b border-border/50 bg-surface/50 px-3.5 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 font-mono">
          <Command className="h-3 w-3 text-primary" />
          <span className="font-semibold text-foreground">Slash Commands</span>
          <span className="text-border">/</span>
          <span className="text-muted-foreground truncate max-w-[200px]">{currentInput}</span>
        </div>
        <span className="text-[10px] hidden sm:inline-block font-mono text-muted-foreground/80">
          ↑↓ navigasi · ↵ pilih · Esc tutup
        </span>
      </div>

      {/* Suggestion list */}
      <div ref={listRef} className="overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
        {suggestions.map((item, index) => {
          const isSelected = index === selectedIndex;
          const IconComponent = (item.icon && ICON_MAP[item.icon]) || Command;
          const isDisabled = item.disabled;

          return (
            <div
              key={item.id}
              role="option"
              aria-selected={isSelected}
              aria-disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) {
                  onSelect(item);
                }
              }}
              onMouseEnter={() => onHoverIndex(index)}
              className={cn(
                "group relative flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs transition-all cursor-pointer select-none",
                isSelected
                  ? "bg-primary/10 text-foreground border border-primary/30 shadow-xs"
                  : "text-foreground hover:bg-surface border border-transparent",
                isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* Icon wrapper */}
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    item.badge === "Destructive" || item.badge === "CRITICAL"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : isSelected
                      ? "border-primary/40 bg-primary/20 text-primary"
                      : "border-border/60 bg-surface/80 text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  {isDisabled ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <IconComponent className="h-3.5 w-3.5" />
                  )}
                </div>

                {/* Text Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground tracking-tight truncate">
                      {item.label}
                    </span>
                    {item.category && (
                      <span className="text-[10px] text-muted-foreground/70 hidden md:inline truncate">
                        · {item.category}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                    {isDisabled ? item.disabledReason || item.description : item.description}
                  </p>
                </div>
              </div>

              {/* Badges / Pill tags */}
              <div className="flex items-center gap-1.5 shrink-0">
                {item.badge && (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider",
                      item.badge === "Destructive" || item.badge === "CRITICAL"
                        ? "bg-destructive/15 text-destructive border border-destructive/30"
                        : item.badge === "HIGH"
                        ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                        : item.badge === "OWNER" || item.badge === "ADMIN"
                        ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        : "bg-surface border border-border/70 text-muted-foreground"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground/50 transition-transform",
                    isSelected && "text-primary translate-x-0.5"
                  )}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
