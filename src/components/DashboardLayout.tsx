import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, CalendarCheck, Megaphone,
  FlaskConical, IndianRupee, GraduationCap, Settings,
  LogOut, Zap, ChevronLeft, Menu, X, ShieldCheck,
  BookOpen, Trophy, ClipboardList, UserCircle, BookMarked, PlusCircle, Download
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import InstallButton from "@/components/InstallButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePushNotifications } from "@/hooks/use-push-notifications";

type Role = "admin" | "teacher" | "student" | "parent";

const menusByRole: Record<Role, { icon: React.ElementType; label: string; path: string }[]> = {
  admin: [
    { icon: LayoutDashboard, label: "Overview", path: "/admin" },
    { icon: Users, label: "Batches", path: "/admin/batches" },
    { icon: CalendarCheck, label: "Attendance", path: "/admin/attendance" },
    { icon: Megaphone, label: "Announcements", path: "/admin/announcements" },
    { icon: FlaskConical, label: "Tests", path: "/admin/tests" },
    { icon: IndianRupee, label: "Fees", path: "/admin/fees" },
    { icon: GraduationCap, label: "Students", path: "/admin/students" },
    { icon: ClipboardList, label: "Team", path: "/admin/team" },
    { icon: ShieldCheck, label: "Approvals", path: "/admin/approvals" },
    { icon: Settings, label: "Settings", path: "/admin/settings" },
  ],
  teacher: [
    { icon: LayoutDashboard, label: "My Dashboard", path: "/teacher" },
    { icon: CalendarCheck, label: "Attendance", path: "/teacher/attendance" },
    { icon: Megaphone, label: "Announcements", path: "/teacher/announcements" },
    { icon: FlaskConical, label: "Tests & Scores", path: "/teacher/tests" },
    { icon: BookOpen, label: "Homework / DPP", path: "/teacher/homework" },
    { icon: Settings, label: "Settings", path: "/teacher/settings" },
  ],
  student: [
    { icon: LayoutDashboard, label: "My Dashboard", path: "/student" },
    { icon: PlusCircle, label: "Join a Batch", path: "/student/apply-batch" },
    { icon: CalendarCheck, label: "My Attendance", path: "/student/attendance" },
    { icon: Trophy, label: "Tests & Scores", path: "/student/tests" },
    { icon: BookOpen, label: "Homework / DPP", path: "/student/homework" },
    { icon: IndianRupee, label: "My Fees", path: "/student/fees" },
    { icon: Megaphone, label: "Announcements", path: "/student/announcements" },
    { icon: Settings, label: "Settings", path: "/student/settings" },
  ],
  parent: [
    { icon: LayoutDashboard, label: "Overview", path: "/parent" },
    { icon: UserCircle, label: "My Child", path: "/parent" },
    { icon: CalendarCheck, label: "Attendance", path: "/parent/attendance" },
    { icon: IndianRupee, label: "Fees", path: "/parent/fees" },
    { icon: Megaphone, label: "Announcements", path: "/parent/announcements" },
  ],
};

const roleAuthPaths: Record<Role, string> = {
  admin: "/auth/admin",
  teacher: "/auth/teacher",
  student: "/auth/student",
  parent: "/auth/parent",
};

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  role?: Role;
}

export default function DashboardLayout({ children, title, role = "admin" }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [approvalsPending, setApprovalsPending] = useState(0);
  const [userName, setUserName] = useState("Loading...");
  const [userInitials, setUserInitials] = useState("...");
  const [instituteName, setInstituteName] = useState("");
  const [instituteCode, setInstituteCode] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Register push notification subscription once we have the institute code
  usePushNotifications(instituteCode);

  const menuItems = menusByRole[role];
  const isAdmin = role === "admin";

  // Auth guard + profile fetch — uses getSession() (localStorage, instant) not getUser() (network)
  useEffect(() => {
    const loadProfile = async (userId: string, email: string | undefined) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, institute_code")
        .eq("user_id", userId)
        .single();

      if (profile) {
        setUserName(profile.full_name || email || "User");
        const parts = (profile.full_name || "U").split(" ");
        setUserInitials(parts.map((p: string) => p[0]).join("").toUpperCase().slice(0, 2));

        if (profile.institute_code) {
          setInstituteCode(profile.institute_code);
          const { data: institute } = await supabase
            .from("institutes")
            .select("institute_name, city")
            .eq("institute_code", profile.institute_code)
            .single();
          if (institute) {
            setInstituteName(`${institute.institute_name}${institute.city ? ", " + institute.city : ""}`);
          } else {
            setInstituteName(profile.institute_code);
          }
        }
      }
      setAuthChecked(true);
    };

    // Read session from localStorage instantly (no network round-trip)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate(roleAuthPaths[role], { replace: true });
        return;
      }

      // INC-11 fix: verify user actually has the required role
      const { data: roleCheck } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", role)
        .maybeSingle();

      if (!roleCheck) {
        // User doesn't have this role — send them to role selection
        navigate("/role-select", { replace: true });
        return;
      }

      loadProfile(session.user.id, session.user.email);
    });

    // Listen for sign-out events to redirect immediately
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) {
        navigate(roleAuthPaths[role], { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, role]);

  // Fetch pending count for admin sidebar badges
  useEffect(() => {
    if (!isAdmin || !authChecked || !instituteCode) return;
    const fetchPending = async () => {
      const [reqRes, appRes] = await Promise.all([
        supabase.from("pending_requests").select("id").eq("status", "pending").eq("institute_code", instituteCode),
        supabase.from("batch_applications").select("id").eq("status", "pending"),
      ]);
      setApprovalsPending((reqRes.data?.length || 0) + (appRes.data?.length || 0));
    };
    fetchPending();
  }, [isAdmin, authChecked, instituteCode]);

  const handleLogout = async () => {
    localStorage.removeItem("batchhub_active_institute");
    await supabase.auth.signOut();
    navigate("/");
  };

  const isActiveItem = (itemPath: string) => location.pathname === itemPath;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Institute Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        {!collapsed ? (
          <div className="flex-1 min-w-0">
            <p className="text-xs text-sidebar-foreground/60 font-medium truncate">{roleLabels[role]}</p>
            <p className="text-sm font-semibold text-sidebar-foreground truncate">
              {instituteName || "Loading..."}
            </p>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:flex text-sidebar-foreground hover:bg-sidebar-accent w-8 h-8 flex-shrink-0"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const active = isActiveItem(item.path);
          const showApprovalBadge = isAdmin && approvalsPending > 0 && item.path === "/admin/approvals";
          return (
            <Link
              key={`${item.path}-${item.label}`}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                active
                  ? "bg-sidebar-primary text-white shadow-primary/30 shadow-md"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-white" : "")} />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && showApprovalBadge && (
                <span className="text-xs font-bold bg-danger text-white rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {approvalsPending}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-4 border-t border-sidebar-border pt-4">
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{userName}</p>
              <p className="text-xs text-sidebar-foreground/60">{roleLabels[role]}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent w-full transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-sidebar flex-shrink-0 transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar — max-w so it never covers full screen */}
      <aside className={cn(
        "fixed left-0 top-0 bottom-0 w-[72vw] max-w-[260px] bg-sidebar z-50 lg:hidden transition-transform duration-300",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border/50 bg-card flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden w-9 h-9 flex-shrink-0"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
            {title && <h1 className="font-display font-semibold text-base sm:text-lg truncate">{title}</h1>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <InstallButton />
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Live
            </div>
            <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold">
              {userInitials}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
