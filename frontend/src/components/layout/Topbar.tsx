import { useNavigate } from "react-router-dom";
import { Search, Upload, Bell } from "lucide-react";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const navigate = useNavigate();

  return (
    <header className="h-16 border-b border-white/[0.06] bg-[#000008]/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
      <div>
        <h1 className="text-base font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/search")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all text-sm"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search...</span>
          <span className="hidden md:inline text-xs text-white/25 ml-1">⌘K</span>
        </button>

        <button
          onClick={() => navigate("/upload")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0F74C5]/15 border border-[#0F74C5]/25 text-[#56B2EF] hover:bg-[#0F74C5]/25 transition-all text-sm font-medium"
        >
          <Upload size={14} />
          <span className="hidden sm:inline">Upload</span>
        </button>

        <button className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all">
          <Bell size={14} />
        </button>
      </div>
    </header>
  );
}
