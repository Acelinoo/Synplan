"use client";

import * as React from "react";
import { X, UserPlus, Mail, Shield, Sparkles } from "lucide-react";
import { useUiStore } from "@/store";
import { MemberRole } from "@/types";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import { cn } from "@/lib/utils";

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (member: { name: string; email: string; role: MemberRole }) => void;
}

export function InviteMemberModal({ isOpen, onClose, onInvite }: InviteMemberModalProps) {
  const { addToast } = useUiStore();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<MemberRole>("member");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    onInvite({
      name: name.trim() || email.split("@")[0],
      email: email.trim(),
      role,
    });

    setEmail("");
    setName("");
    setRole("member");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Invite Squad Member</h2>
              <p className="text-[11px] text-muted-foreground">
                Grant access to projects and workload collaboration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Full Name (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Alex Morgan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Email Address <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                required
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Workspace Role</label>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {(["admin", "member", "viewer"] as MemberRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center text-xs capitalize transition-colors",
                    role === r
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                  )}
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>{r}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs font-semibold">
              Send Invitation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
