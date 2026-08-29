"use client";

import * as React from "react";
import { Moon, Sun, Laptop, Palette, Check } from "lucide-react";
import { useUiStore } from "@/store";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";

export function ThemeSettingsPanel() {
  const { theme, setTheme, addToast } = useUiStore();

  const handleSelectTheme = (newTheme: "dark" | "light" | "system") => {
    setTheme(newTheme);

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (newTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    addToast({
      title: "Theme Updated",
      description: `Interface appearance set to ${newTheme.toUpperCase()}.`,
      variant: "success",
    });
  };

  return (
    <SpotlightCard className="space-y-5">
      <div className="flex items-center gap-2.5 border-b border-border pb-3">
        <Palette className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-bold text-foreground">Appearance & Theme</h3>
          <p className="text-xs text-muted-foreground">Customize color palettes and visual density</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { id: "dark", label: "Dark Mode (Obsidian)", desc: "Deep neutral zinc & indigo glow", icon: Moon },
          { id: "light", label: "Light Mode", desc: "Crisp white & clean borders", icon: Sun },
          { id: "system", label: "System Sync", desc: "Follow OS preference automatically", icon: Laptop },
        ].map((item) => {
          const Icon = item.icon;
          const isSelected = theme === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleSelectTheme(item.id as any)}
              className={cn(
                "flex flex-col items-start p-4 rounded-lg border text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-surface/50 hover:bg-surface"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <Icon className={cn("h-5 w-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                {isSelected && <Check className="h-4 w-4 text-primary" />}
              </div>
              <h4 className="mt-3 text-xs font-bold text-foreground">{item.label}</h4>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{item.desc}</p>
            </button>
          );
        })}
      </div>
    </SpotlightCard>
  );
}
