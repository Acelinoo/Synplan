"use client";

import * as React from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MagnetButtonProps extends ButtonProps {
  magnetStrength?: number;
}

export function MagnetButton({
  children,
  className,
  magnetStrength = 0.25,
  ...props
}: MagnetButtonProps) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = (e.clientX - centerX) * magnetStrength;
    const deltaY = (e.clientY - centerY) * magnetStrength;
    setOffset({ x: deltaX, y: deltaY });
  };

  const handleMouseLeave = () => {
    setOffset({ x: 0, y: 0 });
  };

  return (
    <Button
      ref={buttonRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: offset.x === 0 ? "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
      }}
      className={cn("relative will-change-transform select-none", className)}
      {...props}
    >
      {children}
    </Button>
  );
}
