import { Sidebar } from "@/components/layout/sidebar";
import { AmbientBackground } from "@/components/layout/ambient-background";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex relative">
      <AmbientBackground />
      <Sidebar />
      <main className="flex-1 ml-56">
        <div className="min-h-screen">{children}</div>
      </main>
    </div>
  );
}
