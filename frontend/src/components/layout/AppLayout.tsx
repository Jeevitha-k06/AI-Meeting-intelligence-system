import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useAuth } from "@/context/AuthContext";

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Your meeting intelligence overview" },
  "/upload": { title: "Upload Meeting", subtitle: "Process a new transcript" },
  "/meetings": { title: "Meetings", subtitle: "All processed meetings" },
  "/tasks": { title: "Tasks", subtitle: "Action items from meetings" },
  "/search": { title: "Search", subtitle: "Find anything across meetings" },
};

export default function AppLayout() {
  const location = useLocation();
  const { displayName } = useAuth();

  // Match exact path or strip meeting detail segment
  const pathKey =
    pageTitles[location.pathname] != null
      ? location.pathname
      : location.pathname.startsWith("/meetings/")
      ? "/meetings"
      : location.pathname;

  const meta = pageTitles[pathKey] ?? { title: "SyncSpace", subtitle: "" };

  return (
    <div className="flex h-screen bg-[#000008] overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="h-16 border-b border-white/[0.06] bg-[#000008]/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
          <div>
            <h1 className="text-base font-semibold text-white">{meta.title}</h1>
            {meta.subtitle && (
              <p className="text-xs text-white/40 mt-0.5">{meta.subtitle}</p>
            )}
          </div>
          {/* Authenticated user indicator */}
          <div className="flex items-center gap-2 text-xs text-white/30">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="hidden sm:inline">{displayName}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
