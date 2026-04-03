/**
 * AdminApprovals — unified page combining batch applications
 * and student/teacher/parent approval workflows.
 * Includes enrollment toggle switches for spam prevention.
 */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, XCircle, Clock, BookOpen, GraduationCap, UserCircle,
  Search, Loader2, RotateCcw, Link2, ShieldOff, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PendingRequest = Tables<"pending_requests">;

// ── Batch Application types ──
interface BatchApplication {
  id: string;
  student_id: string;
  batch_id: string;
  status: string;
  applied_at: string;
  studentName: string;
  studentEmail: string;
  batchName: string;
  batchCourse: string;
  batchEnrollmentOpen: boolean;
}

const roleConfig: Record<string, { icon: React.ElementType; gradient: string; label: string; bg: string; text: string }> = {
  teacher: { icon: BookOpen, gradient: "from-success to-emerald-400", label: "Teacher", bg: "bg-success-light", text: "text-success" },
  student: { icon: GraduationCap, gradient: "from-accent to-orange-400", label: "Student", bg: "bg-accent-light", text: "text-accent" },
  parent: { icon: UserCircle, gradient: "from-violet-500 to-purple-600", label: "Parent", bg: "bg-violet-100", text: "text-violet-600" },
  admin: { icon: CheckCircle2, gradient: "from-primary to-primary", label: "Admin", bg: "bg-primary-light", text: "text-primary" },
  super_admin: { icon: CheckCircle2, gradient: "from-primary to-primary", label: "Super Admin", bg: "bg-primary-light", text: "text-primary" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h}h ago`;
  return `${m}m ago`;
}

type ToggleView = "batch-applications" | "registration-approvals";
const TOGGLE_KEY = "batchhub_approvals_view";

export default function AdminApprovals() {
  const { toast } = useToast();
  const [view, setView] = useState<ToggleView>(() => {
    return (localStorage.getItem(TOGGLE_KEY) as ToggleView) || "batch-applications";
  });

  // ── Shared state ──
  const [instituteCode, setInstituteCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  // ── Enrollment toggles ──
  const [studentEnrollment, setStudentEnrollment] = useState(true);
  const [teacherEnrollment, setTeacherEnrollment] = useState(true);
  const [enrollmentLoading, setEnrollmentLoading] = useState<string | null>(null);

  // ── Registration Approvals state ──
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; req: PendingRequest | null }>({ open: false, req: null });
  const [studentProfiles, setStudentProfiles] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");

  // ── Batch Applications state ──
  const [batchApps, setBatchApps] = useState<BatchApplication[]>([]);

  // ── Toggle persistence ──
  const handleViewChange = (v: ToggleView) => {
    setView(v);
    localStorage.setItem(TOGGLE_KEY, v);
    setFilter("pending");
    setSearch("");
  };

  // ── Fetch institute + enrollment flags ──
  const fetchInstituteData = useCallback(async () => {
    const { data: code } = await supabase.rpc("get_my_institute_code");
    if (!code) return;
    setInstituteCode(code);

    const { data: inst } = await supabase
      .from("institutes")
      .select("student_enrollment_enabled, teacher_enrollment_enabled")
      .eq("institute_code", code)
      .single();
    if (inst) {
      setStudentEnrollment(inst.student_enrollment_enabled ?? true);
      setTeacherEnrollment(inst.teacher_enrollment_enabled ?? true);
    }
    return code;
  }, []);

  // ── Fetch registration requests ──
  const fetchRequests = useCallback(async (code?: string) => {
    const instCode = code || instituteCode;
    if (!instCode) return;
    const { data } = await supabase
      .from("pending_requests")
      .select("*")
      .eq("institute_code", instCode)
      .order("created_at", { ascending: false });
    setRequests(data || []);
  }, [instituteCode]);

  // ── Fetch batch applications ──
  const fetchBatchApps = useCallback(async (code?: string) => {
    const instCode = code || instituteCode;
    if (!instCode) return;
    const { data: applications } = await supabase
      .from("batch_applications")
      .select("*")
      .order("applied_at", { ascending: false });
    if (!applications) return;

    const studentIds = [...new Set(applications.map(a => a.student_id))];
    const batchIds = [...new Set(applications.map(a => a.batch_id))];

    const [studentsRes, batchesRes] = await Promise.all([
      studentIds.length > 0
        ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", studentIds)
        : Promise.resolve({ data: [] as { user_id: string; full_name: string; email: string }[] }),
      batchIds.length > 0
        ? supabase.from("batches").select("id, name, course, enrollment_open").in("id", batchIds)
        : Promise.resolve({ data: [] as { id: string; name: string; course: string; enrollment_open: boolean }[] }),
    ]);

    const studentMap: Record<string, { full_name: string; email: string }> = {};
    (studentsRes.data || []).forEach(s => { studentMap[s.user_id] = s; });

    const batchMap: Record<string, { name: string; course: string; enrollment_open: boolean }> = {};
    ((batchesRes.data || []) as { id: string; name: string; course: string; enrollment_open: boolean }[]).forEach(b => { batchMap[b.id] = b; });

    setBatchApps(applications.map(a => ({
      ...a,
      studentName: studentMap[a.student_id]?.full_name || "Unknown",
      studentEmail: studentMap[a.student_id]?.email || "",
      batchName: batchMap[a.batch_id]?.name || "Unknown Batch",
      batchCourse: batchMap[a.batch_id]?.course || "",
      batchEnrollmentOpen: batchMap[a.batch_id]?.enrollment_open ?? true,
    })));
  }, [instituteCode]);

  // ── Auto-repair missing roles ──
  const repairMissingRoles = useCallback(async (code: string) => {
    try {
      const { data: approved } = await supabase
        .from("profiles")
        .select("user_id, role, institute_code")
        .eq("institute_code", code)
        .in("status", ["approved", "active"])
        .not("institute_code", "is", null);
      if (!approved || approved.length === 0) return;

      const { data: existingRoles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("institute_code", code);
      const existingSet = new Set((existingRoles || []).map(r => `${r.user_id}::${r.role}`));
      const missing = approved.filter(p => !existingSet.has(`${p.user_id}::${p.role}`));
      if (missing.length === 0) return;
      await supabase.from("user_roles").insert(
        missing.map(p => ({ user_id: p.user_id, role: p.role, institute_code: p.institute_code })),
      );
    } catch (err) {
      console.warn("Auto-repair warning:", err);
    }
  }, []);

  // ── Initial load ──
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const code = await fetchInstituteData();
      if (code) {
        await Promise.all([fetchRequests(code), fetchBatchApps(code), repairMissingRoles(code)]);
      }
      setLoading(false);
    };
    init();
  }, [fetchInstituteData, fetchRequests, fetchBatchApps, repairMissingRoles]);

  // ── Realtime ──
  useEffect(() => {
    const ch1 = supabase
      .channel("admin-approvals-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_requests" }, () => fetchRequests())
      .subscribe();
    const ch2 = supabase
      .channel("admin-batch-apps-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "batch_applications" }, () => fetchBatchApps())
      .subscribe();
    const ch3 = supabase
      .channel("admin-institutes-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "institutes" }, () => fetchInstituteData())
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
  }, [fetchRequests, fetchBatchApps, fetchInstituteData]);

  // ── Enrollment toggle handler ──
  const toggleEnrollment = async (field: "student_enrollment_enabled" | "teacher_enrollment_enabled", value: boolean) => {
    setEnrollmentLoading(field);
    const { error } = await supabase
      .from("institutes")
      .update({ [field]: value })
      .eq("institute_code", instituteCode);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (field === "student_enrollment_enabled") setStudentEnrollment(value);
      else setTeacherEnrollment(value);
      toast({ title: value ? "Enrollment enabled" : "Enrollment disabled", description: `${field === "student_enrollment_enabled" ? "Student" : "Teacher"} enrollment is now ${value ? "open" : "closed"}.` });
    }
    setEnrollmentLoading(null);
  };

  // ── Batch enrollment toggle ──
  const toggleBatchEnrollment = async (batchId: string, value: boolean) => {
    setEnrollmentLoading(batchId);
    const { error } = await supabase
      .from("batches")
      .update({ enrollment_open: value })
      .eq("id", batchId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setBatchApps(prev => prev.map(a => a.batch_id === batchId ? { ...a, batchEnrollmentOpen: value } : a));
      toast({ title: value ? "Batch enrollment opened" : "Batch enrollment closed" });
    }
    setEnrollmentLoading(null);
  };

  // ═══════════════════════════════════════════════
  // Registration approval actions (unchanged logic)
  // ═══════════════════════════════════════════════
  const handleAction = async (req: PendingRequest, action: "approved" | "rejected") => {
    if (action === "approved" && req.role === "parent") {
      const { data: students } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("institute_code", req.institute_code)
        .eq("role", "student")
        .in("status", ["approved", "active"]);
      setStudentProfiles(students || []);
      setSelectedChildId("");
      setLinkDialog({ open: true, req });
      return;
    }
    await executeApproval(req, action, null);
  };

  const handleRevoke = async (req: PendingRequest) => {
    if (!confirm(`Revoke ${req.role} access for ${req.full_name}?`)) return;
    setActionLoading(req.id);
    try {
      await supabase.from("user_roles").delete().eq("user_id", req.user_id).eq("role", req.role).eq("institute_code", req.institute_code);
      await supabase.from("profiles").update({ status: "rejected" }).eq("user_id", req.user_id).eq("institute_code", req.institute_code);
      await supabase.from("pending_requests").update({ status: "rejected" }).eq("id", req.id);
      toast({ title: "Access revoked", description: `${req.full_name}'s ${req.role} access has been removed.` });
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "rejected" } : r));
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Revoke failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const executeApproval = async (req: PendingRequest, action: "approved" | "rejected", childId: string | null) => {
    setActionLoading(req.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: reqError } = await supabase
        .from("pending_requests")
        .update({ status: action, reviewed_by: user?.id })
        .eq("id", req.id);
      if (reqError) throw reqError;

      if (action === "approved") {
        const extra = (req.extra_data as Record<string, string>) || {};
        const profileUpdates: Record<string, unknown> = { status: "approved" };
        if (req.role === "student" && extra.studentId) profileUpdates.role_based_code = extra.studentId;
        if (req.role === "teacher" && extra.teacherId) profileUpdates.role_based_code = extra.teacherId;

        const { error: profError } = await supabase.from("profiles").update(profileUpdates).eq("user_id", req.user_id).eq("institute_code", req.institute_code);
        if (profError) throw profError;

        const { error: roleError } = await supabase.from("user_roles").insert({ user_id: req.user_id, role: req.role, institute_code: req.institute_code });
        if (roleError && !roleError.code?.includes("23505") && !roleError.message?.includes("duplicate")) {
          await supabase.from("profiles").update({ status: "pending" }).eq("user_id", req.user_id).eq("institute_code", req.institute_code);
          await supabase.from("pending_requests").update({ status: "pending", reviewed_by: null }).eq("id", req.id);
          throw new Error(`Failed to assign role: ${roleError.message}`);
        }

        const { data: roleCheck } = await supabase.from("user_roles").select("id").eq("user_id", req.user_id).eq("role", req.role).eq("institute_code", req.institute_code).maybeSingle();
        if (!roleCheck) {
          await supabase.from("profiles").update({ status: "pending" }).eq("user_id", req.user_id).eq("institute_code", req.institute_code);
          await supabase.from("pending_requests").update({ status: "pending", reviewed_by: null }).eq("id", req.id);
          throw new Error("Role assignment could not be verified. Rolled back.");
        }

        if (req.role === "parent" && childId) {
          const existingExtra = (req.extra_data as Record<string, unknown>) || {};
          await supabase.from("pending_requests").update({ extra_data: { ...existingExtra, child_id: childId } }).eq("id", req.id);
        }
        toast({ title: "Approved!", description: `${req.full_name} has been granted ${req.role} access.` });
      } else {
        await supabase.from("profiles").update({ status: "rejected" }).eq("user_id", req.user_id).eq("institute_code", req.institute_code);
        await supabase.from("user_roles").delete().eq("user_id", req.user_id).eq("role", req.role).eq("institute_code", req.institute_code);
        toast({ title: "Rejected", description: `${req.full_name}'s request has been rejected.` });
      }
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: action } : r));
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Action failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleParentLinkConfirm = async () => {
    if (!linkDialog.req) return;
    setLinkDialog({ open: false, req: null });
    await executeApproval(linkDialog.req, "approved", selectedChildId || null);
  };

  // ═══════════════════════════════════
  // Batch Application actions
  // ═══════════════════════════════════
  const handleBatchAction = async (app: BatchApplication, action: "approved" | "rejected") => {
    setActionLoading(app.id);
    const { data: { user } } = await supabase.auth.getUser();

    const { error: appErr } = await supabase
      .from("batch_applications")
      .update({ status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", app.id);

    if (appErr) {
      toast({ title: "Error", description: appErr.message, variant: "destructive" });
      setActionLoading(null);
      return;
    }

    if (action === "approved") {
      const { data: codeData } = await supabase.rpc("get_my_institute_code");
      if (!codeData) {
        toast({ title: "Error", description: "Could not determine your institute code.", variant: "destructive" });
        setActionLoading(null);
        return;
      }

      const { error: enrollErr } = await supabase.from("students_batches").insert({
        student_id: app.student_id,
        batch_id: app.batch_id,
        institute_code: codeData,
      });

      if (enrollErr && !enrollErr.message?.includes("duplicate") && !enrollErr.code?.includes("23505")) {
        toast({ title: "Warning", description: "Approved but enrollment issue: " + enrollErr.message, variant: "destructive" });
        setActionLoading(null);
        return;
      }
      toast({ title: "Approved!", description: `${app.studentName} enrolled in ${app.batchName}` });
    } else {
      toast({ title: "Rejected", description: `${app.studentName}'s application rejected` });
    }

    setBatchApps(prev => prev.map(a => a.id === app.id ? { ...a, status: action } : a));
    setActionLoading(null);
  };

  // ── Filtered data ──
  const filteredRequests = requests.filter(r => {
    const matchesFilter = filter === "all" || r.status === filter;
    const matchesSearch = r.full_name.toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredBatchApps = batchApps.filter(a => {
    const matchesFilter = filter === "all" || a.status === filter;
    const matchesSearch = a.studentName.toLowerCase().includes(search.toLowerCase()) || a.batchName.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const pendingRequestCount = requests.filter(r => r.status === "pending").length;
  const pendingBatchAppCount = batchApps.filter(a => a.status === "pending").length;
  const totalPending = pendingRequestCount + pendingBatchAppCount;

  // Get unique batches from applications for per-batch enrollment toggles
  const uniqueBatches = Array.from(
    new Map(batchApps.map(a => [a.batch_id, { id: a.batch_id, name: a.batchName, enrollmentOpen: a.batchEnrollmentOpen }])).values()
  );

  // Current view data
  const currentData = view === "batch-applications" ? filteredBatchApps : filteredRequests;
  const currentDataSource = view === "batch-applications" ? batchApps : requests;

  return (
    <DashboardLayout title="Approvals">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <p className="text-muted-foreground text-sm">Manage batch join requests and registration approvals.</p>
          {totalPending > 0 && (
            <Badge className="bg-danger-light text-danger border-danger/20 text-sm px-3 py-1">
              {totalPending} pending
            </Badge>
          )}
        </div>

        {/* Toggle Group */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-full sm:w-auto">
          <button
            onClick={() => handleViewChange("batch-applications")}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${
              view === "batch-applications"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Batch Applications
            {pendingBatchAppCount > 0 && (
              <span className="ml-2 text-xs font-bold bg-danger text-white rounded-full px-1.5 py-0.5">
                {pendingBatchAppCount}
              </span>
            )}
          </button>
          <button
            onClick={() => handleViewChange("registration-approvals")}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all ${
              view === "registration-approvals"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Student / Teacher Approvals
            {pendingRequestCount > 0 && (
              <span className="ml-2 text-xs font-bold bg-danger text-white rounded-full px-1.5 py-0.5">
                {pendingRequestCount}
              </span>
            )}
          </button>
        </div>

        {/* Enrollment Toggles */}
        {view === "batch-applications" ? (
          <Card className="p-4 shadow-card border-border/50">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Batch Enrollment Controls
            </h3>
            {uniqueBatches.length === 0 ? (
              <p className="text-xs text-muted-foreground">No batch applications yet.</p>
            ) : (
              <div className="space-y-3">
                {uniqueBatches.map(b => (
                  <div key={b.id} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`batch-enroll-${b.id}`} className="text-sm flex-1 cursor-pointer">
                      {b.name} — New Enrollments
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${b.enrollmentOpen ? "text-success" : "text-danger"}`}>
                        {b.enrollmentOpen ? "OPEN" : "CLOSED"}
                      </span>
                      <Switch
                        id={`batch-enroll-${b.id}`}
                        checked={b.enrollmentOpen}
                        disabled={enrollmentLoading === b.id}
                        onCheckedChange={(v) => toggleBatchEnrollment(b.id, v)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-4 shadow-card border-border/50">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ShieldOff className="w-4 h-4 text-primary" />
              Registration Controls
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="student-enrollment" className="text-sm flex-1 cursor-pointer">
                  Student Enrollment
                </Label>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${studentEnrollment ? "text-success" : "text-danger"}`}>
                    {studentEnrollment ? "ON" : "OFF"}
                  </span>
                  <Switch
                    id="student-enrollment"
                    checked={studentEnrollment}
                    disabled={enrollmentLoading === "student_enrollment_enabled"}
                    onCheckedChange={(v) => toggleEnrollment("student_enrollment_enabled", v)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="teacher-enrollment" className="text-sm flex-1 cursor-pointer">
                  Teacher Enrollment
                </Label>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${teacherEnrollment ? "text-success" : "text-danger"}`}>
                    {teacherEnrollment ? "ON" : "OFF"}
                  </span>
                  <Switch
                    id="teacher-enrollment"
                    checked={teacherEnrollment}
                    disabled={enrollmentLoading === "teacher_enrollment_enabled"}
                    onCheckedChange={(v) => toggleEnrollment("teacher_enrollment_enabled", v)}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={view === "batch-applications" ? "Search students or batches..." : "Search by name or email..."}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["pending", "approved", "rejected", "all"] as const).map(f => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className={filter === f ? "gradient-hero text-white border-0" : ""}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== "all" && (
                  <span className="ml-1.5 text-xs opacity-70">
                    ({currentDataSource.filter((r: any) => r.status === f).length})
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Role summary (registration view only) */}
        {view === "registration-approvals" && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { role: "teacher", count: requests.filter(r => r.role === "teacher" && r.status === "pending").length, cfg: roleConfig.teacher },
              { role: "student", count: requests.filter(r => r.role === "student" && r.status === "pending").length, cfg: roleConfig.student },
              { role: "parent", count: requests.filter(r => r.role === "parent" && r.status === "pending").length, cfg: roleConfig.parent },
            ].map(({ role, count, cfg }) => (
              <Card key={role} className="p-4 shadow-card border-border/50 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center flex-shrink-0`}>
                  <cfg.icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold capitalize">{role}s</p>
                  <p className="text-xs text-muted-foreground">{count} pending</p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="space-y-3">
          {loading ? (
            <Card className="p-10 text-center shadow-card border-border/50">
              <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading...</p>
            </Card>
          ) : currentData.length === 0 ? (
            <Card className="p-10 text-center shadow-card border-border/50">
              <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
              <p className="font-semibold">All caught up!</p>
              <p className="text-muted-foreground text-sm">No {filter === "all" ? "" : filter} {view === "batch-applications" ? "applications" : "requests"} found.</p>
            </Card>
          ) : view === "batch-applications" ? (
            /* ── Batch Applications List ── */
            (filteredBatchApps as BatchApplication[]).map((app, i) => (
              <motion.div key={app.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-4 shadow-card border-border/50 hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{app.studentName}</span>
                        {app.status === "pending" && <Badge className="text-xs bg-accent-light text-accent border-0 gap-1"><Clock className="w-2.5 h-2.5" />Pending</Badge>}
                        {app.status === "approved" && <Badge className="text-xs bg-success-light text-success border-0 gap-1"><CheckCircle2 className="w-2.5 h-2.5" />Approved</Badge>}
                        {app.status === "rejected" && <Badge className="text-xs bg-danger-light text-danger border-0 gap-1"><XCircle className="w-2.5 h-2.5" />Rejected</Badge>}
                        {!app.batchEnrollmentOpen && <Badge className="text-xs bg-danger-light text-danger border-0">Enrollment Closed</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Wants to join: <strong className="text-foreground">{app.batchName}</strong> ({app.batchCourse})</span>
                        <span>{app.studentEmail}</span>
                        <span className="text-muted-foreground/60">{timeAgo(app.applied_at)}</span>
                      </div>
                    </div>
                    {(app.status === "pending" || app.status === "rejected") && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          disabled={actionLoading === app.id}
                          className="bg-success-light text-success hover:bg-success hover:text-white border border-success/20 h-8 text-xs gap-1 transition-colors"
                          onClick={() => handleBatchAction(app, "approved")}
                        >
                          {actionLoading === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : app.status === "rejected" ? <RotateCcw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          {app.status === "rejected" ? "Re-approve" : "Approve"}
                        </Button>
                        {app.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionLoading === app.id}
                            className="text-danger border-danger/30 hover:bg-danger-light h-8 text-xs gap-1"
                            onClick={() => handleBatchAction(app, "rejected")}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))
          ) : (
            /* ── Registration Approvals List ── */
            filteredRequests.map((req, i) => {
              const role = req.role as keyof typeof roleConfig;
              const cfg = roleConfig[role] || roleConfig.teacher;
              const extra = (req.extra_data as Record<string, string>) || {};
              const isPending = req.status === "pending";
              const isRejected = req.status === "rejected";

              return (
                <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card className="p-4 shadow-card border-border/50 hover:border-primary/20 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center flex-shrink-0`}>
                        <cfg.icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm">{req.full_name}</span>
                          <Badge className={`text-xs ${cfg.bg} ${cfg.text} border-0`}>{cfg.label}</Badge>
                          {isPending && <Badge className="text-xs bg-accent-light text-accent border-0 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Pending</Badge>}
                          {req.status === "approved" && <Badge className="text-xs bg-success-light text-success border-0 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Approved</Badge>}
                          {isRejected && <Badge className="text-xs bg-danger-light text-danger border-0 flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> Rejected</Badge>}
                          {req.status === "approved" && req.role === "parent" && extra.child_id && (
                            <Badge className="text-xs bg-violet-100 text-violet-600 border-0 flex items-center gap-1"><Link2 className="w-2.5 h-2.5" /> Child linked</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Institute: <strong className="text-foreground">{req.institute_code}</strong></span>
                          <span>Email: <strong className="text-foreground">{req.email}</strong></span>
                          {extra.teacherId && <span>Teacher ID: <strong className="text-foreground">{extra.teacherId}</strong></span>}
                          {extra.studentId && <span>Student ID: <strong className="text-foreground">{extra.studentId}</strong></span>}
                          {extra.subject && <span>Subject: <strong className="text-foreground">{extra.subject}</strong></span>}
                          {extra.batchName && <span>Batch: <strong className="text-foreground">{extra.batchName}</strong></span>}
                          {extra.relation && <span>Relation: <strong className="text-foreground">{extra.relation}</strong></span>}
                          {extra.phone && <span>Phone: <strong className="text-foreground">{extra.phone}</strong></span>}
                          <span className="text-muted-foreground/60">{timeAgo(req.created_at)}</span>
                        </div>
                      </div>
                      {(isPending || isRejected) && (
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            disabled={actionLoading === req.id}
                            className="bg-success-light text-success hover:bg-success hover:text-white border border-success/20 h-8 text-xs gap-1 transition-colors"
                            onClick={() => handleAction(req, "approved")}
                          >
                            {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isRejected ? <RotateCcw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            {isRejected ? "Re-approve" : "Approve"}
                          </Button>
                          {isPending && (
                            <Button size="sm" variant="outline" disabled={actionLoading === req.id} className="text-danger border-danger/30 hover:bg-danger-light h-8 text-xs gap-1" onClick={() => handleAction(req, "rejected")}>
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </Button>
                          )}
                        </div>
                      )}
                      {req.status === "approved" && (
                        <Button size="sm" variant="outline" disabled={actionLoading === req.id} className="text-danger border-danger/30 hover:bg-danger-light h-8 text-xs gap-1 flex-shrink-0" onClick={() => handleRevoke(req)}>
                          {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                          Revoke
                        </Button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Parent-Child Link Dialog */}
      <Dialog open={linkDialog.open} onOpenChange={(open) => !open && setLinkDialog({ open: false, req: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="w-5 h-5 text-violet-500" /> Link Parent to Child</DialogTitle>
            <DialogDescription>
              Select which student <strong>{linkDialog.req?.full_name}</strong> is the parent of.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Child's Student ID: <span className="font-mono text-primary">{(linkDialog.req?.extra_data as Record<string, string>)?.studentId || "Not provided"}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Select child from approved students:</p>
              <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                <SelectTrigger><SelectValue placeholder="Select student..." /></SelectTrigger>
                <SelectContent>
                  {studentProfiles.length === 0 ? (
                    <SelectItem value="none" disabled>No approved students found</SelectItem>
                  ) : (
                    studentProfiles.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name} — {s.email}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1 gradient-hero text-white border-0" onClick={handleParentLinkConfirm} disabled={actionLoading === linkDialog.req?.id}>
                {actionLoading === linkDialog.req?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve & Link"}
              </Button>
              <Button variant="outline" onClick={() => { if (linkDialog.req) { setLinkDialog({ open: false, req: null }); executeApproval(linkDialog.req, "approved", null); } }}>
                Approve Without Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
