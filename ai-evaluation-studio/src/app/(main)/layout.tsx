import { Sidebar } from "@/components/layout/sidebar";
import { AmbientBackground } from "@/components/layout/ambient-background";
import { EvaluationRecovery } from "@/components/evaluations/evaluation-recovery";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex relative">
      <AmbientBackground />
      <EvaluationRecovery />
      <Sidebar />
      <main className="flex-1 ml-56">
        <div className="min-h-screen">{children}</div>
      </main>
    </div>
  );
}
