"use client";

import * as React from "react";
import { X, UserPlus, Mail, Shield, Loader2, Info } from "lucide-react";
import { MemberRole } from "@/types";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (member: { name: string; email: string; role: MemberRole }) => Promise<void> | void;
}

export function InviteMemberModal({ isOpen, onClose, onInvite }: InviteMemberModalProps) {
  const { isAdmin } = usePermissions();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<MemberRole>("member");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // RBAC Hierarchy: Admins cannot grant admin or owner role
  const availableRoles: MemberRole[] = isAdmin ? ["member", "viewer"] : ["admin", "member", "viewer"];

  // Handle ESC key
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isSubmitting]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onInvite({
        name: name.trim() || email.split("@")[0],
        email: email.trim(),
        role,
      });
      setEmail("");
      setName("");
      setRole("member");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs animate-in fade-in"
    >
      <div className="fixed inset-0" onClick={isSubmitting ? undefined : onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 id="invite-modal-title" className="text-sm font-bold text-foreground">Invite Squad Member</h2>
              <p className="text-[11px] text-muted-foreground">
                Grant access to projects and sprint allocations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Notice */}
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>Members are added directly to your workspace squad and receive in-app notifications.</span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6 pt-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Full Name (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Alex Morgan"
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
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
                disabled={isSubmitting}
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Workspace Role</label>
            <div className={cn("grid gap-2 pt-1", availableRoles.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
              {availableRoles.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center text-xs capitalize transition-colors cursor-pointer disabled:opacity-50",
                    role === r
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
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
              disabled={isSubmitting}
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="text-xs font-semibold gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Inviting...</span>
                </>
              ) : (
                <span>Add to Squad</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
