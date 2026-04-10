import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Users,
  BookOpen,
  ClipboardList,
  MessageSquare,
  IndianRupee,
  TrendingUp,
  ArrowRight,
  Zap,
  Shield,
  Smartphone,
  Download,
  X,
  Check,
  UserCheck,
  Bell,
  FileText,
  Settings2,
  Sparkles,
  Star,
  GraduationCap,
  ChevronRight,
  ChevronDown,
  
  XCircle,
  CheckCircle2,
  Clock,
  Rocket,
  MousePointerClick,
} from "lucide-react";
import InstallButton from "@/components/InstallButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const roleToPath: Record<string, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
  parent: "/parent",
  super_admin: "/superadmin",
  app_owner: "/owner",
};

const roleToAuthPath: Record<string, string> = {
  admin: "/auth/admin",
  teacher: "/auth/teacher",
  student: "/auth/student",
  parent: "/auth/parent",
  super_admin: "/auth/superadmin",
  app_owner: "/auth/owner",
};

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Why Us", href: "#problem-solution" },
  { label: "Pricing", href: "#pricing" },
];

const oldProblems = [
  { icon: FileText, title: "Paper Registers", desc: "Easily lost, damaged, or outdated. No backup available." },
  {
    icon: MessageSquare,
    title: "Scattered WhatsApp Groups",
    desc: "Chaotic communication, missed messages, no structure.",
  },
  { icon: BarChart3, title: "Messy Spreadsheets", desc: "Manual errors, version conflicts, no real-time updates." },
];

const batchhubSolutions = [
  {
    icon: CheckCircle2,
    title: "Digital Everything",
    desc: "Cloud-based records, automatic backups, accessible anywhere.",
  },
  { icon: Users, title: "Organized Batch Chat", desc: "Structured communication per batch, announcements, and polls." },
  { icon: TrendingUp, title: "Real-time Analytics", desc: "Live dashboards, attendance tracking, and fee insights." },
];

const featureCards = [
  {
    icon: Users,
    title: "Batch Management",
    desc: "Organize students into intelligent batches with simplicity.",
    tags: ["Scheduling", "Transfers"],
    bg: "#0EA5E9",
  },
  {
    icon: CheckCircle2,
    title: "Digital Attendance",
    desc: "One-tap attendance with instant notifications to parents.",
    tags: ["One-Tap", "Alerts"],
    bg: "#8B6F4E",
  },
  {
    icon: MessageSquare,
    title: "Batch Chat",
    desc: "Dedicated chat spaces for each batch with file sharing.",
    tags: ["File Share", "Structured"],
    bg: "#E6C2A0",
  },
  {
    icon: BarChart3,
    title: "Test & Rankings",
    desc: "Create tests, enter scores, and watch auto-generated leaderboards.",
    tags: ["Scores", "Rankings"],
    bg: "#D4C4B0",
  },
  {
    icon: IndianRupee,
    title: "Fee Tracking",
    desc: "Automated reminders, digital receipts, and payment analytics.",
    tags: ["Auto Remind", "Receipts"],
    bg: "#0EA5E9",
  },
  {
    icon: BookOpen,
    title: "Homework & DPP",
    desc: "Digital assignment distribution and practice papers.",
    tags: ["PDF Upload", "Tracking"],
    bg: "#8B6F4E",
  },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    sub: "First 15 days on us",
    desc: "Perfect for new or small institutes",
    features: ["Up to 3 batches", "Up to 60 students", "Attendance + Chat", "Basic fee tracking", "Email support"],
    cta: "Start Free",
    highlighted: false,
    dark: false,
  },
  {
    name: "Growing",
    price: "₹8",
    priceSuffix: "/student",
    sub: "per month · min ₹499",
    desc: "Most institutes choose this",
    features: [
      "Unlimited batches",
      "Per-student billing",
      "Full fee management",
      "Test scores & rankings",
      "Push notifications",
      "Priority support",
    ],
    cta: "Get Started",
    highlighted: true,
    dark: true,
  },
];

const faqs = [
  {
    q: "Is BatchHub right for my coaching institute?",
    a: "If you run a coaching class, tuition centre, or training institute in India with batches of students — yes, BatchHub is built exactly for you. It works for JEE/NEET coaching, foundation classes, language schools, and more.",
  },
  {
    q: "How long does it take to set up?",
    a: "Under 5 minutes. Sign up, create your institute, add your first batch, and invite students. That's it. No complex configuration or training needed.",
  },
  {
    q: "Do I need any technical experience?",
    a: "Not at all. BatchHub is designed for institute owners and teachers, not IT teams. If you can use WhatsApp, you can use BatchHub.",
  },
  {
    q: "What if it doesn't work for my use case?",
    a: "Your first month is completely free with no credit card required. Try it risk-free. If it's not the right fit, you can walk away — no questions asked.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, absolutely. There are no lock-in contracts. You can cancel, upgrade, or downgrade your plan at any time from your dashboard.",
  },
  {
    q: "Does it work on mobile phones?",
    a: "Yes! BatchHub is a PWA (Progressive Web App) — it works on any phone's browser and can be added to the home screen. No Play Store or App Store required.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

export default function Index() {
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Never touch auth state if we're on the password-reset callback URL.
    // Supabase embeds the recovery token in the hash; Index.tsx must stay completely
    // hands-off in that case or it will invalidate the token before ResetPassword.tsx
    // can consume it.
    const isResetPasswordPage =
      window.location.pathname === "/reset-password" ||
      window.location.hash.includes("type=recovery") ||
      window.location.hash.includes("access_token");

    if (isResetPasswordPage) {
      setAuthChecking(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const rememberMe = localStorage.getItem("batchhub_remember_me") === "true";
        const sessionOnly = sessionStorage.getItem("batchhub_session_only") === "true";

        // Only sign out if NEITHER persistent session NOR session-only flag is set.
        // This prevents signing out users who just logged in and haven't had the flag
        // written yet (rare race), while still cleaning up truly stale sessions.
        if (!rememberMe && !sessionOnly) {
          await supabase.auth.signOut();
          setAuthChecking(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, status")
          .eq("user_id", session.user.id)
          .single();
        
        if (profile?.role) {
          // If approved, go to dashboard. Otherwise, go to their auth page to see the pending/rejected card.
          const path = profile.status === "approved" ? roleToPath[profile.role] : roleToAuthPath[profile.role];
          if (path) {
            navigate(path, { replace: true });
            return;
          }
        }
      }
      setAuthChecking(false);
    });
  }, [navigate]);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;
    if (window.innerWidth < 768) setShowBanner(true);
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleNativeInstall = async () => {
    if (!installPrompt) return;
    const p = installPrompt as BeforeInstallPromptEvent;
    p.prompt();
    const r = await p.userChoice;
    if (r.outcome === "accepted") setShowBanner(false);
  };

  if (authChecking) return null;

  return (
    <div
      className="min-h-screen overflow-x-hidden antialiased bg-background text-foreground"
    >
      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[9999]"
        style={{
          opacity: 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ══════════════════ NAVBAR ══════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          borderBottom: scrolled ? "1px solid rgba(139,111,78,0.15)" : "none",
          background: scrolled ? "rgba(237,232,220,0.85)" : "transparent",
          backdropFilter: scrolled ? "blur(20px)" : "none",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg transition-transform duration-300 group-hover:scale-105"
                style={{ background: "linear-gradient(135deg, #8B6F4E, #3D2B1F)" }}
              >
                B
              </div>
              <span
                className="text-2xl font-bold tracking-tight"
                style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
              >
                BatchHub
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="text-sm font-medium transition-colors duration-200 hover:opacity-100"
                  style={{ color: "rgba(61,43,31,0.75)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#3D2B1F")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(61,43,31,0.75)")}
                >
                  {l.label}
                </a>
              ))}
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <InstallButton />
              <Link to="/role-select" className="hidden sm:inline-flex">
                <button
                  className="text-sm font-medium px-4 py-2 transition-colors duration-200"
                  style={{ color: "#3D2B1F" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#8B6F4E")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#3D2B1F")}
                >
                  Log In
                </button>
              </Link>
              <Link to="/role-select">
                <button
                  className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hidden sm:block"
                  style={{
                    background: "#0EA5E9",
                    boxShadow: "0 4px 15px -3px rgba(14,165,233,0.5)",
                  }}
                >
                  Start Free Trial
                </button>
              </Link>
              {/* Mobile: just show login */}
              <Link to="/role-select" className="sm:hidden">
                <button
                  className="px-4 py-2 rounded-full text-sm font-semibold text-white"
                  style={{ background: "#0EA5E9" }}
                >
                  Login
                </button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ══════════════════ HERO ══════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
        {/* Floating ambient orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-32 left-10 w-80 h-80 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)" }}
          />
          <div
            className="absolute top-40 right-20 w-96 h-96 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(230,194,160,0.15) 0%, transparent 70%)" }}
          />
          <div
            className="absolute bottom-20 left-1/3 w-64 h-64 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(139,111,78,0.1) 0%, transparent 70%)" }}
          />
        </div>

        {/* Floating UI decorations */}
        <div className="absolute inset-0 pointer-events-none hidden md:block">
          {/* Notebook page */}
          <div
            className="absolute top-32 left-10 w-28 h-36 rounded-lg shadow-2xl opacity-60"
            style={{
              background: "#EDE8DC",
              animation: "pageFly 3s ease-in-out infinite alternate",
              transformStyle: "preserve-3d",
            }}
          >
            <div className="p-3 space-y-2">
              <div className="h-2 rounded" style={{ background: "#D4C4B0", width: "75%" }} />
              <div className="h-2 rounded" style={{ background: "#E8DCC4", width: "100%" }} />
              <div className="h-2 rounded" style={{ background: "#E8DCC4", width: "83%" }} />
            </div>
          </div>

          {/* Rupee floating */}
          <div
            className="absolute top-44 right-24 text-6xl font-bold"
            style={{
              color: "#8B6F4E",
              animation: "floatEl 8s ease-in-out infinite",
              filter: "drop-shadow(0 4px 6px rgba(139,111,78,0.2))",
            }}
          >
            ₹
          </div>
          <div
            className="absolute bottom-44 left-24 text-4xl font-bold"
            style={{
              color: "#0EA5E9",
              animation: "floatEl 7s ease-in-out infinite 1s",
              filter: "drop-shadow(0 4px 6px rgba(14,165,233,0.2))",
            }}
          >
            ₹
          </div>

          {/* Chat bubbles */}
          <div
            className="absolute rounded-2xl rounded-tl-sm px-4 py-2 shadow-lg"
            style={{
              bottom: "35%",
              left: "22%",
              background: "rgba(237,232,220,0.75)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(139,111,78,0.1)",
              animation: "floatEl 6s ease-in-out infinite 2s",
            }}
          >
            <p className="text-xs font-medium" style={{ color: "#3D2B1F" }}>
              Fee reminder sent to 12 students
            </p>
          </div>

          {/* Check circle */}
          <div
            className="absolute w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
            style={{ top: "50%", right: "10%", background: "#0EA5E9", animation: "floatEl 5s ease-in-out infinite" }}
          >
            <Check className="w-6 h-6 text-white" strokeWidth={3} />
          </div>

          {/* Avatar cluster */}
          <div
            className="absolute flex -space-x-3"
            style={{ bottom: "32%", right: "30%", animation: "floatEl 9s ease-in-out infinite" }}
          >
            {[
              { l: "A", bg: "#E6C2A0" },
              { l: "R", bg: "#D4C4B0" },
              { l: "S", bg: "#0EA5E9" },
            ].map((a) => (
              <div
                key={a.l}
                className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold text-white"
                style={{ background: a.bg, borderColor: "#F5F1E8" }}
              >
                {a.l}
              </div>
            ))}
          </div>
        </div>

        {/* Main hero content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 text-center">
          {/* Trust badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
            style={{ background: "rgba(139,111,78,0.1)", border: "1px solid rgba(139,111,78,0.2)" }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#0EA5E9" }} />
            <span className="text-sm font-medium" style={{ color: "#3D2B1F" }}>
              Made in India, Made by Indians, Made for Indian Institutes
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight mb-6"
            style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
          >
            Run your coaching
            <br />
            <span
              className="italic"
              style={{
                background: "linear-gradient(135deg, #3D2B1F 0%, #8B6F4E 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              institute smarter
            </span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ color: "rgba(61,43,31,0.7)" }}
          >
            BatchHub replaces paper registers, scattered WhatsApp groups, and manual fee tracking with one clean
            platform built for how Indian coaching institutes actually work.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-4"
          >
            <Link to="/role-select">
              <button
                className="px-8 py-4 rounded-full text-base font-semibold text-white flex items-center gap-2 group transition-all duration-300 hover:-translate-y-1"
                style={{ background: "#0EA5E9", boxShadow: "0 4px 20px -4px rgba(14,165,233,0.5)" }}
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-sm"
            style={{ color: "rgba(61,43,31,0.5)" }}
          >
            No credit card required · Setup in under 5 minutes
          </motion.p>

          {/* Dashboard mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-20 relative max-w-5xl mx-auto"
          >
            {/* Fade-out gradient at bottom */}
            <div
              className="absolute inset-0 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to top, #F5F1E8 0%, transparent 60%)" }}
            />
            <div
              className="rounded-3xl p-2 shadow-2xl hover:scale-[1.01] transition-transform duration-500"
              style={{
                background: "rgba(237,232,220,0.7)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(139,111,78,0.1)",
              }}
            >
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: "#EDE8DC", border: "1px solid #E8DCC4" }}
              >
                {/* Browser chrome */}
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ background: "rgba(245,241,232,0.5)", borderBottom: "1px solid #E8DCC4" }}
                >
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: "#E6C2A0" }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: "#D4C4B0" }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: "#0EA5E9" }} />
                  </div>
                  <div className="flex-1 text-center text-xs font-medium" style={{ color: "#8B6F4E" }}>
                    BatchHub Dashboard
                  </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Stat cards */}
                  <div className="col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                    {[
                      { v: "156", l: "Total Students", c: "#3D2B1F" },
                      { v: "94%", l: "Attendance", c: "#0EA5E9" },
                      { v: "₹2.4L", l: "Fee Collected", c: "#8B6F4E" },
                      { v: "12", l: "Active Batches", c: "#E6C2A0" },
                    ].map((s) => (
                      <div
                        key={s.l}
                        className="rounded-xl p-4"
                        style={{ background: "#F5F1E8", border: "1px solid #E8DCC4" }}
                      >
                        <div className="text-2xl font-bold" style={{ color: s.c }}>
                          {s.v}
                        </div>
                        <div className="text-xs mt-1" style={{ color: "#8B6F4E" }}>
                          {s.l}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Batch list */}
                  <div
                    className="md:col-span-2 rounded-xl p-4"
                    style={{ background: "#EDE8DC", border: "1px solid #E8DCC4" }}
                  >
                    <h3 className="font-semibold text-sm mb-3" style={{ color: "#3D2B1F" }}>
                      Active Batches
                    </h3>
                    <div className="space-y-2">
                      {[
                        { l: "JEE Advanced 2025", s: "42 students · Physics", c: "#0EA5E9" },
                        { l: "NEET Crash Course", s: "32 students · Biology", c: "#E6C2A0" },
                        { l: "Foundation XI", s: "55 students · Maths", c: "#8B6F4E" },
                      ].map((b) => (
                        <div
                          key={b.l}
                          className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors"
                          style={{ background: "#F5F1E8", border: "1px solid #E8DCC4" }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                              style={{ background: b.c }}
                            >
                              {b.l[0]}
                            </div>
                            <div>
                              <div className="text-sm font-medium" style={{ color: "#3D2B1F" }}>
                                {b.l}
                              </div>
                              <div className="text-xs" style={{ color: "#8B6F4E" }}>
                                {b.s}
                              </div>
                            </div>
                          </div>
                          <span className="w-2 h-2 rounded-full" style={{ background: "#0EA5E9" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Attendance chart */}
                  <div className="rounded-xl p-4" style={{ background: "#EDE8DC", border: "1px solid #E8DCC4" }}>
                    <h3 className="font-semibold text-sm mb-3" style={{ color: "#3D2B1F" }}>
                      Today's Attendance
                    </h3>
                    <div className="space-y-3">
                      {[
                        { l: "Batch A", v: 92, c: "#0EA5E9" },
                        { l: "Batch B", v: 88, c: "#8B6F4E" },
                        { l: "Batch C", v: 95, c: "#E6C2A0" },
                      ].map((a) => (
                        <div key={a.l}>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: "#3D2B1F" }}>{a.l}</span>
                            <span className="font-semibold" style={{ color: a.c }}>
                              {a.v}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E8DCC4" }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${a.v}%`, background: a.c }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2" style={{ animation: "bounce 2s infinite" }}>
          <ChevronDown className="w-6 h-6" style={{ color: "#8B6F4E" }} />
        </div>
      </section>

      {/* ══════════════════ PROBLEM → SOLUTION ══════════════════ */}
      <section id="problem-solution" className="py-24 relative" style={{ background: "#EDE8DC" }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            {/* Why Us button */}
            <Link to="/owner">
              <button
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold mb-6 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg, #3D2B1F, #8B6F4E)",
                  color: "white",
                  boxShadow: "0 4px 15px -3px rgba(61,43,31,0.35)",
                }}
              >
                <Sparkles className="w-4 h-4" /> Why Us
              </button>
            </Link>
            <h2
              className="text-4xl md:text-5xl font-bold mb-4"
              style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
            >
              The Old Way vs{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #3D2B1F, #8B6F4E)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                BatchHub
              </span>
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "#8B6F4E" }}>
              See how we transform chaos into clarity
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 items-stretch max-w-5xl mx-auto">
            {/* Old */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative group"
            >
              <div
                className="absolute inset-0 rounded-3xl transform rotate-1 group-hover:rotate-2 transition-transform duration-500"
                style={{ background: "linear-gradient(135deg, #e2e8f0, #cbd5e1)" }}
              />
              <div
                className="relative rounded-3xl p-8 h-full"
                style={{ background: "#EDE8DC", border: "2px solid #e2e8f0" }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "#f1f5f9" }}
                  >
                    <XCircle className="w-6 h-6" style={{ color: "#94a3b8" }} />
                  </div>
                  <h3
                    className="text-2xl font-bold"
                    style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#64748b" }}
                  >
                    The Old Way
                  </h3>
                </div>
                <div className="space-y-4">
                  {oldProblems.map((p) => (
                    <div
                      key={p.title}
                      className="flex items-start gap-4 p-4 rounded-xl"
                      style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "white", border: "1px solid #e2e8f0" }}
                      >
                        <p.icon className="w-5 h-5" style={{ color: "#94a3b8" }} />
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1" style={{ color: "#475569" }}>
                          {p.title}
                        </h4>
                        <p className="text-sm" style={{ color: "#94a3b8" }}>
                          {p.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* New */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative group"
            >
              <div
                className="absolute inset-0 rounded-3xl transform -rotate-1 group-hover:-rotate-2 transition-transform duration-500 opacity-20"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #8B6F4E)" }}
              />
              <div
                className="relative rounded-3xl p-8 h-full shadow-xl"
                style={{ background: "#EDE8DC", border: "2px solid rgba(14,165,233,0.3)" }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "#0EA5E9" }}
                  >
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <h3
                    className="text-2xl font-bold"
                    style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
                  >
                    With BatchHub
                  </h3>
                </div>
                <div className="space-y-4">
                  {batchhubSolutions.map((s, i) => (
                    <div
                      key={s.title}
                      className="flex items-start gap-4 p-4 rounded-xl transition-colors"
                      style={{ background: "#F5F1E8", border: "1px solid #E8DCC4" }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-white"
                        style={{ background: i === 0 ? "#0EA5E9" : i === 1 ? "#8B6F4E" : "#E6C2A0" }}
                      >
                        <s.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1" style={{ color: "#3D2B1F" }}>
                          {s.title}
                        </h4>
                        <p className="text-sm" style={{ color: "#8B6F4E" }}>
                          {s.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Mid CTA */}
          <div className="mt-14 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/role-select">
              <button
                className="px-8 py-4 rounded-full text-base font-semibold text-white flex items-center gap-2 group transition-all duration-300 hover:-translate-y-1"
                style={{ background: "#0EA5E9", boxShadow: "0 4px 20px -4px rgba(14,165,233,0.5)" }}
              >
                Get Started Free <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════ FEATURES ══════════════════ */}
      <section id="features" className="py-24 relative" style={{ background: "#F5F1E8" }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2
              className="text-4xl md:text-5xl font-bold mb-4"
              style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
            >
              Everything you need to{" "}
              <span className="italic" style={{ color: "#8B6F4E" }}>
                run smarter
              </span>
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "#8B6F4E" }}>
              Powerful features designed specifically for Indian coaching institutes
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureCards.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="group cursor-pointer h-64 relative"
                style={{ perspective: "1000px" }}
              >
                <div
                  className="absolute inset-0 rounded-2xl p-6 flex flex-col justify-between transition-all duration-500"
                  style={{
                    background: "linear-gradient(135deg, #F5F1E8, #E8DCC4)",
                    border: "1px solid #D4C4B0",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-4 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: f.bg }}
                  >
                    <f.icon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3
                      className="text-xl font-bold mb-2"
                      style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
                    >
                      {f.title}
                    </h3>
                    <p className="text-sm" style={{ color: "#8B6F4E" }}>
                      {f.desc}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-4">
                    {f.tags.map((t) => (
                      <span
                        key={t}
                        className="px-3 py-1 rounded-full text-xs"
                        style={{ background: "rgba(255,255,255,0.5)", color: "#8B6F4E" }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ PRICING ══════════════════ */}
      <section id="pricing" className="py-24 relative" style={{ background: "#F5F1E8" }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2
              className="text-4xl md:text-5xl font-bold mb-4"
              style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
            >
              Simple, transparent{" "}
              <span className="italic" style={{ color: "#8B6F4E" }}>
                pricing
              </span>
            </h2>
            <p className="text-lg" style={{ color: "#8B6F4E" }}>
              Choose the plan that fits your institute size. No credit card required.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-3xl p-8 hover:-translate-y-2 transition-all duration-300 overflow-hidden group ${plan.dark ? "md:-translate-y-4" : ""}`}
                style={{
                  background: plan.dark ? "#3D2B1F" : "#F5F1E8",
                  border: plan.dark ? "1px solid #3D2B1F" : "1px solid #E8DCC4",
                  boxShadow: plan.dark ? "0 20px 40px rgba(61,43,31,0.25)" : "none",
                }}
              >
                {plan.highlighted && (
                  <div
                    className="absolute top-0 right-0 text-white text-xs font-bold px-4 py-1 rounded-bl-xl"
                    style={{ background: "#0EA5E9" }}
                  >
                    POPULAR
                  </div>
                )}
                {!plan.dark && (
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"
                    style={{ background: "linear-gradient(135deg, transparent, rgba(232,220,196,0.5))" }}
                  />
                )}
                <div className="relative">
                  <h3
                    className="text-xl font-bold mb-2"
                    style={{ fontFamily: "'Bricolage Grotesque', serif", color: plan.dark ? "white" : "#3D2B1F" }}
                  >
                    {plan.name}
                  </h3>
                  <p className="text-sm mb-6" style={{ color: plan.dark ? "#D4C4B0" : "#8B6F4E" }}>
                    {plan.desc}
                  </p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-5xl font-bold" style={{ color: plan.dark ? "white" : "#3D2B1F" }}>
                      {plan.price}
                    </span>
                    {plan.priceSuffix && (
                      <span className="text-base" style={{ color: plan.dark ? "#D4C4B0" : "#8B6F4E" }}>
                        {plan.priceSuffix}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mb-6" style={{ color: plan.dark ? "#D4C4B0" : "#8B6F4E" }}>
                    {plan.sub}
                  </p>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-3 text-sm">
                        <Check className="w-5 h-5 flex-shrink-0" style={{ color: "#0EA5E9" }} />
                        <span style={{ color: plan.dark ? "white" : "#3D2B1F" }}>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/role-select">
                    <button
                      className="w-full py-3 rounded-full font-semibold transition-all duration-300"
                      style={
                        plan.dark
                          ? { background: "#0EA5E9", color: "white", boxShadow: "0 4px 15px rgba(14,165,233,0.3)" }
                          : { border: "2px solid #8B6F4E", color: "#3D2B1F", background: "transparent" }
                      }
                      onMouseEnter={(e) => {
                        if (!plan.dark) {
                          (e.currentTarget as HTMLButtonElement).style.background = "#8B6F4E";
                          (e.currentTarget as HTMLButtonElement).style.color = "white";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!plan.dark) {
                          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          (e.currentTarget as HTMLButtonElement).style.color = "#3D2B1F";
                        }
                      }}
                    >
                      {plan.cta}
                    </button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="text-center text-sm mt-10" style={{ color: "#8B6F4E" }}>
            All plans include GST. Annual billing saves 20%. 🎁
          </p>
        </div>
      </section>

      {/* ══════════════════ FAQ ══════════════════ */}
      <section id="faq" className="py-24" style={{ background: "#EDE8DC" }}>
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
            >
              Common Questions
            </h2>
            <p className="text-lg" style={{ color: "#8B6F4E" }}>
              Everything you need to know before you start
            </p>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid #E8DCC4", background: "#EDE8DC" }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left transition-colors duration-200"
                  style={{ background: openFaq === i ? "#F5F1E8" : "transparent" }}
                >
                  <span className="font-semibold pr-4" style={{ color: "#3D2B1F" }}>
                    {faq.q}
                  </span>
                  <ChevronDown
                    className="w-5 h-5 flex-shrink-0 transition-transform duration-300"
                    style={{ color: "#8B6F4E", transform: openFaq === i ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div
                        className="px-5 pb-5 pt-4 text-sm leading-relaxed"
                        style={{ color: "#8B6F4E", borderTop: "1px solid #E8DCC4" }}
                      >
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ FINAL CTA ══════════════════ */}
      <section className="py-24 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, #F5F1E8, #E8DCC4)" }} />
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-64 h-64 rounded-full blur-3xl" style={{ background: "#0EA5E9" }} />
          <div
            className="absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl"
            style={{ background: "#E6C2A0" }}
          />
        </div>
        {/* Floating elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-10 w-20 h-20 bg-white rounded-2xl shadow-2xl opacity-60"
            style={{ animation: "floatEl 10s ease-in-out infinite" }}
          >
            <div className="p-2 space-y-1">
              <div className="h-1.5 rounded" style={{ background: "#D4C4B0", width: "75%" }} />
              <div className="h-1.5 rounded" style={{ background: "#E8DCC4", width: "100%" }} />
            </div>
          </div>
          <div
            className="absolute bottom-1/4 right-20 text-8xl font-bold"
            style={{ color: "rgba(139,111,78,0.1)", animation: "floatEl 12s ease-in-out infinite" }}
          >
            ₹
          </div>
          <div
            className="absolute top-1/3 right-1/4 w-16 h-16 rounded-full flex items-center justify-center shadow-xl"
            style={{ background: "#0EA5E9", animation: "floatEl 8s ease-in-out infinite 2s" }}
          >
            <Check className="w-8 h-8 text-white" />
          </div>
        </div>

        <div className="relative max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
              style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(139,111,78,0.2)" }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#0EA5E9" }} />
              <span className="text-sm font-medium" style={{ color: "#3D2B1F" }}>
                Join institutes already using BatchHub
              </span>
            </div>

            <h2
              className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
              style={{ fontFamily: "'Bricolage Grotesque', serif", color: "#3D2B1F" }}
            >
              Ready to transform your
              <br />
              <span
                className="italic"
                style={{
                  background: "linear-gradient(135deg, #3D2B1F, #8B6F4E)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                coaching institute?
              </span>
            </h2>

            <p className="text-xl mb-10 max-w-2xl mx-auto" style={{ color: "#8B6F4E" }}>
              Join educators who have already moved from chaos to clarity. Start your free trial today.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/role-select">
                <button
                  className="px-10 py-5 rounded-full text-lg font-semibold text-white flex items-center gap-3 group transition-all duration-300 hover:-translate-y-1"
                  style={{ background: "#0EA5E9", boxShadow: "0 8px 30px -5px rgba(14,165,233,0.5)" }}
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </button>
              </Link>
            </div>

            <p className="mt-8 text-sm" style={{ color: "#8B6F4E" }}>
              Want a personal demo? Call our team at{" "}
              <a href="tel:7505915754" className="font-semibold underline" style={{ color: "#3D2B1F" }}>
                7505915754
              </a>
            </p>

            <div
              className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm"
              style={{ color: "#8B6F4E" }}
            >
              {["No credit card required", "14-day free trial", "Cancel anytime"].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <Check className="w-4 h-4" style={{ color: "#0EA5E9" }} />
                  {t}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════ FOOTER ══════════════════ */}
      <footer className="py-16 pb-24 md:pb-16" style={{ background: "#3D2B1F", color: "#E8DCC4" }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xl"
                  style={{ background: "linear-gradient(135deg, #0EA5E9, #8B6F4E)" }}
                >
                  B
                </div>
                <span className="text-2xl font-bold" style={{ fontFamily: "'Bricolage Grotesque', serif" }}>
                  BatchHub
                </span>
              </div>
              <p className="max-w-sm mb-6" style={{ color: "#D4C4B0" }}>
                The complete coaching institute management platform built for Indian educators. Replace chaos with
                clarity.
              </p>
              <div className="flex gap-4">
                {[
                  { href: "#", label: "Twitter" },
                  { href: "#", label: "Instagram" },
                  { href: "#", label: "LinkedIn" },
                ].map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors duration-200"
                    style={{ background: "rgba(139,111,78,0.2)", color: "#D4C4B0" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = "#0EA5E9";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = "rgba(139,111,78,0.2)";
                    }}
                  >
                    {s.label[0]}
                  </a>
                ))}
              </div>
            </div>

            {/* Product links */}
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <a
                    href="#features"
                    className="transition-colors"
                    style={{ color: "#D4C4B0" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#D4C4B0")}
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#pricing"
                    className="transition-colors"
                    style={{ color: "#D4C4B0" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#D4C4B0")}
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="transition-colors"
                    style={{ color: "#D4C4B0" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#D4C4B0")}
                  >
                    FAQ
                  </a>
                </li>
              </ul>
            </div>

            {/* Company links */}
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <a
                    href="mailto:hello@batchhub.in"
                    className="transition-colors"
                    style={{ color: "#D4C4B0" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#D4C4B0")}
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <Link
                    to="/apply/city-partner"
                    className="transition-colors"
                    style={{ color: "#D4C4B0" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#D4C4B0")}
                  >
                    Become a City Partner
                  </Link>
                </li>
                <li>
                  <Link
                    to="/auth/superadmin"
                    className="transition-colors"
                    style={{ color: "#D4C4B0" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#D4C4B0")}
                  >
                    City Partner Login
                  </Link>
                </li>
                <li>
                  <Link
                    to="/owner"
                    className="transition-colors"
                    style={{ color: "#D4C4B0" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#D4C4B0")}
                  >
                    Owner Login
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div
            className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8"
            style={{ borderTop: "1px solid rgba(139,111,78,0.2)" }}
          >
            <p className="text-sm" style={{ color: "#8B6F4E" }}>
              © 2025 BatchHub. All rights reserved. Built for India's coaching ecosystem.
            </p>
            <div className="flex gap-6 text-sm">
              <a
                href="#"
                className="transition-colors"
                style={{ color: "#8B6F4E" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#8B6F4E")}
              >
                Privacy Policy
              </a>
              <a
                href="#"
                className="transition-colors"
                style={{ color: "#8B6F4E" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#0EA5E9")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#8B6F4E")}
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* ══════════════════ MOBILE INSTALL BANNER ══════════════════ */}
      {showBanner && (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <div
            className="border-t shadow-2xl px-4 py-3"
            style={{
              background: "rgba(237,232,220,0.95)",
              backdropFilter: "blur(20px)",
              borderColor: "rgba(139,111,78,0.2)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #0EA5E9, #8B6F4E)" }}
              >
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#3D2B1F" }}>
                  Install BatchHub
                </p>
                <p className="text-xs" style={{ color: "#8B6F4E" }}>
                  Add to home screen — no Play Store needed
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {installPrompt ? (
                  <button
                    onClick={handleNativeInstall}
                    className="h-8 px-3 text-xs text-white rounded-lg flex items-center gap-1.5"
                    style={{ background: "#0EA5E9" }}
                  >
                    <Download className="w-3.5 h-3.5" /> Install
                  </button>
                ) : (
                  <Link to="/install">
                    <button
                      className="h-8 px-3 text-xs text-white rounded-lg flex items-center gap-1.5"
                      style={{ background: "#0EA5E9" }}
                    >
                      <Download className="w-3.5 h-3.5" /> How to Install
                    </button>
                  </Link>
                )}
                <button
                  onClick={() => setShowBanner(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                  style={{ background: "rgba(139,111,78,0.15)", color: "#8B6F4E" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations injected via style tag */}
      <style>{`
        @keyframes floatEl {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes pageFly {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(-180deg); }
        }
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateX(-50%) translateY(0); }
          40% { transform: translateX(-50%) translateY(-10px); }
          60% { transform: translateX(-50%) translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
