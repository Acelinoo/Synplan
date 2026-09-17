import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:scale-[0.99]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:scale-[0.99]",
        outline:
          "border border-border bg-card hover:bg-muted/70 text-foreground active:scale-[0.99]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.99]",
        ghost:
          "hover:bg-muted/70 hover:text-foreground text-muted-foreground",
        subtle:
          "bg-primary/10 text-primary hover:bg-primary/15 active:scale-[0.99]",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto font-normal",
      },
      size: {
        xs: "h-7 rounded-sm px-2 text-[11px]",
        sm: "h-8 rounded-md px-3 text-xs",
        default: "h-9 px-3.5 py-1.5 text-xs",
        lg: "h-10 rounded-md px-5 text-sm",
        icon: "h-8 w-8 rounded-md p-0",
        "icon-xs": "h-6 w-6 rounded-sm p-0 text-[10px]",
        "icon-sm": "h-7 w-7 rounded-md p-0",
        "icon-lg": "h-9 w-9 rounded-md p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export interface IconButtonProps extends ButtonProps {
  "aria-label": string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "icon", variant = "ghost", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn("shrink-0", className)}
        {...props}
      />
    );
  }
);
IconButton.displayName = "IconButton";

export { Button, IconButton, buttonVariants };
