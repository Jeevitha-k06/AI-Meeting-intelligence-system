import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, session, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Redirect destination — where the user was trying to go before being sent to /login
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard";

  // If already logged in, go straight through
  useEffect(() => {
    if (!loading && session) {
      navigate(from, { replace: true });
    }
  }, [session, loading, navigate, from]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    const authError = await signIn(email.trim(), password);
    setSubmitting(false);

    if (authError) {
      // Map Supabase error messages to user-friendly text
      const msg = authError.message.toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("email not confirmed")) {
        setError("Incorrect email or password. Please try again.");
      } else if (msg.includes("too many requests") || msg.includes("rate limit")) {
        setError("Too many login attempts. Please wait a moment and try again.");
      } else if (msg.includes("network") || msg.includes("fetch")) {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(authError.message);
      }
      return;
    }

    // onAuthStateChange in AuthContext will update session → ProtectedRoute renders
    navigate(from, { replace: true });
  };

  // Show nothing while checking existing session to avoid flash
  if (loading) {
    return (
      <div className="min-h-screen bg-[#000008] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-[#56B2EF] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000008] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#0F74C5]/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[#56B2EF]/3 blur-[80px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0F74C5] to-[#56B2EF] flex items-center justify-center mb-4 shadow-lg shadow-[#0F74C5]/20">
            <Sparkles size={20} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SyncSpace</h1>
          <p className="text-sm text-white/40 mt-1">Turn Every Meeting into Actionable Intelligence</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 border border-white/[0.08]">
          <h2 className="text-lg font-semibold text-white mb-1">Welcome back</h2>
          <p className="text-sm text-white/40 mb-6">Sign in to your workspace</p>

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-white/50 uppercase tracking-wider">
                Email
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0F74C5]/50 focus:bg-white/[0.06] transition-all"
                  autoComplete="email"
                  autoFocus
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-white/50 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0F74C5]/50 focus:bg-white/[0.06] transition-all"
                  autoComplete="current-password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 text-xs text-danger bg-danger/5 border border-danger/15 rounded-lg px-3 py-2.5"
              >
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0F74C5] hover:bg-[#0F74C5]/90 text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {submitting ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-xs text-white/20 text-center mt-6">
          Insight · Meeting Intelligence Platform
        </p>
      </motion.div>
    </div>
  );
}
