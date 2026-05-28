"use client";

import { useRef, type ReactNode, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  borderHighlight?: boolean;
}

export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(124, 92, 252, 0.15)",
  borderHighlight = true,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={cn(
        "group relative rounded-lg overflow-hidden transition-all duration-300",
        "bg-bg-card border border-border-subtle",
        "hover:border-border-default hover:-translate-y-px",
        className
      )}
      style={
        {
          "--spotlight-color": spotlightColor,
        } as React.CSSProperties
      }
    >
      {/* 边框流光（顶层光圈） */}
      {borderHighlight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background:
              "radial-gradient(450px circle at var(--mx, 50%) var(--my, 50%), var(--spotlight-color), transparent 40%)",
          }}
        />
      )}
      {/* 内容层 */}
      <div className="relative">{children}</div>
    </div>
  );
}
