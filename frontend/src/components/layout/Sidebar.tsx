import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Upload,
  Video,
  CheckSquare,
  Search,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={18} /> },
  { label: "Upload", path: "/upload", icon: <Upload size={18} /> },
  { label: "Meetings", path: "/meetings", icon: <Video size={18} /> },
  { label: "Tasks", path: "/tasks", icon: <CheckSquare size={18} /> },
  { label: "Search", path: "/search", icon: <Search size={18} /> },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { signOut, displayName, email } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  // First letter of display name for avatar
  const avatar = displayName.charAt(0).toUpperCase();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="relative flex flex-col h-screen bg-[#000017] border-r border-white/[0.06] shrink-0 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0F74C5] to-[#56B2EF] flex items-center justify-center shrink-0">
            <Sparkles size={14} className="text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="font-bold text-white text-base tracking-tight overflow-hidden whitespace-nowrap"
              >
                Insight
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative",
                isActive
                  ? "bg-[#0F74C5]/15 text-[#56B2EF]"
                  : "text-white/50 hover:text-white hover:bg-white/[0.05]"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-[#0F74C5]/10 border border-[#0F74C5]/20"
                    transition={{ duration: 0.2 }}
                  />
                )}
                <span className="relative z-10 shrink-0">{item.icon}</span>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="relative z-10 text-sm font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="p-2 pb-4 border-t border-white/[0.06] space-y-1">
        {/* User identity */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg overflow-hidden">
          <div className="w-6 h-6 rounded-full bg-[#0F74C5]/20 border border-[#0F74C5]/30 flex items-center justify-center shrink-0">
            {avatar ? (
              <span className="text-[10px] font-bold text-[#56B2EF]">{avatar}</span>
            ) : (
              <User size={12} className="text-[#56B2EF]" />
            )}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-w-0 flex-1"
              >
                <p className="text-xs font-medium text-white/70 truncate leading-tight">
                  {displayName}
                </p>
                {email && displayName !== email.split("@")[0] && (
                  <p className="text-[10px] text-white/30 truncate leading-tight mt-0.5">
                    {email}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/50 hover:text-danger hover:bg-danger/5 transition-all duration-150"
        >
          <LogOut size={18} className="shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium whitespace-nowrap"
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[72px] w-6 h-6 rounded-full bg-[#000017] border border-white/[0.12] flex items-center justify-center text-white/40 hover:text-white hover:border-white/25 transition-all z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  );
}
