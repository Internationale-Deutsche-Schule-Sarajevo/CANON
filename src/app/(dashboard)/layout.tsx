// src/app/(dashboard)/layout.tsx
import { GamificationBar } from "@/components/gamification/GamificationBar";

/**
 * Shared chrome for every (dashboard) route. Currently just the gamification
 * status bar (name, level, streak) above the page. The bar is fail-safe (see
 * GamificationBar) and each page keeps its own auth/data logic untouched;
 * this is the one place the future persistent logo and further chrome go.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GamificationBar />
      {children}
    </>
  );
}
