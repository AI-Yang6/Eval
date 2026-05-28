"use client";

import { cn } from "@/lib/utils";

interface CenterFlowProps {
  label?: string;
  title?: string;
  description?: string;
  height?: number;
  className?: string;
}

/**
 * 居中流动光带 —— 用于「评测中 / 长时间等待」场景。
 * 现在简化为：卡片底色与其他卡片一致，中心一束紫色光晕左右往返扫动，
 * 类似骨架屏 shimmer 但更柔和、更"活"。
 */
export function CenterFlow({
  label,
  title,
  description,
  height = 180,
  className,
}: CenterFlowProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-border-subtle bg-bg-card",
        className
      )}
      style={{ height }}
    >
      {/* 左右扫动的中心光晕 */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: "55%",
          height: "260%",
          background:
            "radial-gradient(circle, rgba(124,92,252,0.45) 0%, rgba(124,92,252,0.18) 35%, transparent 70%)",
          filter: "blur(30px)",
          animation: "centerflow-sweep 2.6s ease-in-out infinite",
        }}
      />

      {/* 顶层文字 */}
      {(label || title || description) && (
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          {label && (
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-primary mb-2">
              {label}
            </div>
          )}
          {title && (
            <div className="text-base sm:text-lg font-semibold text-text-primary mb-1">
              {title}
            </div>
          )}
          {description && (
            <div className="text-xs text-text-secondary max-w-md">
              {description}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes centerflow-sweep {
          0% {
            left: -30%;
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
          100% {
            left: 75%;
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}
