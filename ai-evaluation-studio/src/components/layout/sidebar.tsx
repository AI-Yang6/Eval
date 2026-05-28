"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  FileText,
  Cpu,
  Zap,
  History,
  LayoutDashboard,
  HardDrive,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BackupDialog } from "@/components/backup/backup-dialog";

const NAV_GROUPS = [
  {
    label: null,
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "数据准备",
    items: [
      { href: "/test-suites", label: "测试集", icon: Database },
      { href: "/prompts", label: "Prompt", icon: FileText },
      { href: "/knowledge", label: "知识库", icon: BookOpen },
      { href: "/models", label: "模型", icon: Cpu },
    ],
  },
  {
    label: "评估与分析",
    items: [
      { href: "/evaluations/new", label: "新建评估", icon: Zap },
      { href: "/history", label: "评估历史", icon: History },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [backupOpen, setBackupOpen] = useState(false);

  return (
    <aside className="fixed inset-y-0 left-0 w-56 border-r border-border-subtle bg-bg-card flex flex-col z-30">
      {/* Logo 区 */}
      <div className="h-14 flex items-center px-5 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Image
            src="/logo2.png"
            alt="Logo"
            width={28}
            height={28}
            className="rounded-md object-cover"
          />
          <span className="font-semibold text-text-primary">Eval Studio</span>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV_GROUPS.map((group, idx) => (
          <div key={idx} className={cn(idx > 0 && "mt-6")}>
            {group.label && (
              <div className="text-xs text-text-tertiary uppercase font-medium px-3 mb-2 tracking-wider">
                {group.label}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "h-9 px-3 rounded-md flex items-center gap-2.5 text-sm transition-colors relative group",
                      isActive
                        ? "text-text-primary bg-bg-active"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />
                    )}
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 底部 */}
      <div className="border-t border-border-subtle">
        <button
          type="button"
          onClick={() => setBackupOpen(true)}
          className="w-full h-9 px-5 flex items-center gap-2 text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <HardDrive className="w-3.5 h-3.5" />
          数据备份
        </button>
        <div className="px-5 py-2 text-xs text-text-tertiary border-t border-border-subtle">
          <Link href="/privacy" className="hover:text-text-secondary">
            隐私说明
          </Link>
          <span className="mx-1">·</span>
          v0.1
        </div>
      </div>

      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
    </aside>
  );
}
