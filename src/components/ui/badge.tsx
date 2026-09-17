import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  CircleDashed,
  Circle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Ban,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AlertOctagon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskStatus, TaskPriority } from "@/types";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-[11px] font-medium tracking-tight select-none transition-colors border",
  {
    variants: {
      variant: {
        default:
          "bg-primary/10 text-primary border-primary/20",
        secondary:
          "bg-secondary text-secondary-foreground border-border",
        outline:
          "border-border text-foreground bg-transparent",
        muted:
          "bg-muted text-muted-foreground border-transparent",
        success:
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        warning:
          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        destructive:
          "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
        info:
          "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
      },
      size: {
        sm: "text-[10px] px-1.5 py-0.2",
        default: "text-[11px] px-2 py-0.5",
        md: "text-xs px-2.5 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

/** Status Badge for 7 Synplan Task State Machine States */
const statusConfig: Record<
  TaskStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; variant: BadgeProps["variant"] }
> = {
  backlog: { label: "Backlog", icon: CircleDashed, variant: "muted" },
  todo: { label: "To Do", icon: Circle, variant: "secondary" },
  in_progress: { label: "In Progress", icon: Clock, variant: "info" },
  in_review: { label: "In Review", icon: Clock, variant: "warning" },
  done: { label: "Done", icon: CheckCircle2, variant: "success" },
  blocked: { label: "Blocked", icon: Ban, variant: "destructive" },
  cancelled: { label: "Cancelled", icon: Ban, variant: "muted" },
};

export function StatusBadge({
  status,
  size = "default",
  showIcon = true,
  className,
}: {
  status: TaskStatus;
  size?: "sm" | "default" | "md";
  showIcon?: boolean;
  className?: string;
}) {
  const conf = statusConfig[status] || { label: status, icon: Circle, variant: "secondary" };
  const Icon = conf.icon;

  return (
    <Badge variant={conf.variant} size={size} className={cn("font-medium", className)}>
      {showIcon && <Icon className="h-3 w-3 shrink-0" />}
      <span>{conf.label}</span>
    </Badge>
  );
}

/** Priority Badge for 4 Urgency Levels */
const priorityConfig: Record<
  TaskPriority,
  { label: string; icon: React.ComponentType<{ className?: string }>; variant: BadgeProps["variant"] }
> = {
  low: { label: "Low", icon: ArrowDown, variant: "muted" },
  medium: { label: "Medium", icon: ArrowRight, variant: "info" },
  high: { label: "High", icon: ArrowUp, variant: "warning" },
  urgent: { label: "Urgent", icon: AlertOctagon, variant: "destructive" },
};

export function PriorityBadge({
  priority,
  size = "default",
  showIcon = true,
  className,
}: {
  priority: TaskPriority;
  size?: "sm" | "default" | "md";
  showIcon?: boolean;
  className?: string;
}) {
  const conf = priorityConfig[priority] || { label: priority, icon: AlertTriangle, variant: "muted" };
  const Icon = conf.icon;

  return (
    <Badge variant={conf.variant} size={size} className={cn("font-medium", className)}>
      {showIcon && <Icon className="h-3 w-3 shrink-0" />}
      <span>{conf.label}</span>
    </Badge>
  );
}

/** Project Status Badge for 5 Synplan Project Statuses */
const projectStatusConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; variant: BadgeProps["variant"] }
> = {
  planning: { label: "Planning", icon: CircleDashed, variant: "default" },
  active: { label: "Active", icon: Clock, variant: "info" },
  on_hold: { label: "On Hold", icon: AlertTriangle, variant: "warning" },
  completed: { label: "Completed", icon: CheckCircle2, variant: "success" },
  archived: { label: "Archived", icon: Ban, variant: "muted" },
};

export function ProjectStatusBadge({
  status,
  size = "default",
  showIcon = true,
  className,
}: {
  status: string;
  size?: "sm" | "default" | "md";
  showIcon?: boolean;
  className?: string;
}) {
  const normalized = (status || "active").toLowerCase();
  const conf = projectStatusConfig[normalized] || {
    label: status,
    icon: Circle,
    variant: "secondary",
  };
  const Icon = conf.icon;

  return (
    <Badge variant={conf.variant} size={size} className={cn("font-medium", className)}>
      {showIcon && <Icon className="h-3 w-3 shrink-0" />}
      <span>{conf.label}</span>
    </Badge>
  );
}

export { Badge, badgeVariants };
