"use client";

import { useEffect, useRef } from "react";

export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const stars: { x: number; y: number; r: number; o: number; ds: number }[] =
      [];

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx?.scale(dpr, dpr);

      // 重置星点
      stars.length = 0;
      const count = Math.min(80, Math.floor((width * height) / 18000));
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.2 + 0.3,
          o: Math.random() * 0.5 + 0.1,
          ds: Math.random() * 0.005 + 0.002,
        });
      }
    }

    let t = 0;
    function frame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      t += 0.005;

      for (const s of stars) {
        const tw = Math.sin(t * 60 * s.ds) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 170, 240, ${s.o * tw})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    frame();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      {/* 紫色大光斑 */}
      <div
        className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(124,92,252,0.14) 0%, transparent 60%)",
          filter: "blur(50px)",
          animation: "ambient-breathe-1 9s ease-in-out infinite",
        }}
      />
      {/* 蓝色大光斑 */}
      <div
        className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 60%)",
          filter: "blur(50px)",
          animation: "ambient-breathe-2 11s ease-in-out infinite",
        }}
      />
      {/* 底部紫粉光斑 */}
      <div
        className="absolute -bottom-40 left-1/3 w-[700px] h-[700px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(160,100,240,0.09) 0%, transparent 60%)",
          filter: "blur(70px)",
          animation: "ambient-breathe-3 13s ease-in-out infinite",
        }}
      />

      {/* 星点粒子 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-60"
      />

      {/* 噪点 */}
      <div
        className="absolute inset-0 opacity-[0.012] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <style jsx>{`
        @keyframes ambient-breathe-1 {
          0%, 100% {
            opacity: 0.7;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.08);
          }
        }
        @keyframes ambient-breathe-2 {
          0%, 100% {
            opacity: 0.6;
            transform: scale(1.05);
          }
          50% {
            opacity: 1;
            transform: scale(0.96);
          }
        }
        @keyframes ambient-breathe-3 {
          0%, 100% {
            opacity: 0.65;
            transform: scale(0.98);
          }
          50% {
            opacity: 1;
            transform: scale(1.06);
          }
        }
      `}</style>
    </div>
  );
}
