/**
 * AdminBatchApplications — admin/teacher view to approve or reject
 * student batch-join applications.
 */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Clock, Search, Loader2, GraduationCap, BookOpen, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Application {
  id: string;
  student_id: string;
  batch_id: string;
  status: string;
  applied_at: string;
  studentName: string;
  studentEmail: string;
  batchName: string;
  batchCourse: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h}h ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

export default function AdminBatchApplications() {
  const { toast } = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  const fetchApps = useCallback(async () => {
    const { data: applications } = await supabase
      .from("batch_applications")
      .select("*")
      .order("applied_at", { ascending: false });

    if (!applications) { setLoading(false); return; }

    // Enrich with student and batch names
    const studentIds = [...new Set(applications.map(a => a.student_id))];
    const batchIds = [...new Set(applications.map(a => a.batch_id))];

    const [studentsRes, batchesRes] = await Promise.all([
      studentIds.length > 0
        ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", studentIds)
        : Promise.resolve({ data: [] }),
      batchIds.length > 0
        ? supabase.from("batches").select("id, name, course").in("id", batchIds)
        : Promise.resolve({ data: [] }),
    ]);

    const studentMap: Record<string, { full_name: string; email: string }> = {};
    (studentsRes.data || []).forEach(s => { studentMap[s.user_id] = s; });

    const batchMap: Record<string, { name: string; course: string }> = {};
    (batchesRes.data || []).forEach(b => { batchMap[b.id] = b; });

    const enriched: Application[] = applications.map(a => ({
      ...a,
      studentName: studentMap[a.student_id]?.full_name || "Unknown",
      studentEmail: studentMap[a.student_id]?.email || "",
      batchName: batchMap[a.batch_id]?.name || "Unknown Batch",
      batchCourse: batchMap[a.batch_id]?.course || "",
    }));

    setApps(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  // Realtime: re-fetch when a student applies or admin reviews
  useEffect(() => {
    const channel = supabase
      .channel("admin-batch-applications-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "batch_applications" },
        () => fetchApps()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchApps]);

  const handleAction = async (app: Application, action: "approved" | "rejected") => {
    setActionLoading(app.id);
    const { data: { user } } = await supabase.auth.getUser();

    // Update application status
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
      // Get institute_code
      const { data: codeData } = await supabase.rpc("get_my_institute_code");

      // Fix #10: null check before insert
      if (!codeData) {
        toast({ title: "Error", description: "Could not determine your institute code. Enrollment skipped.", variant: "destructive" });
        setActionLoading(null);
        return;
      }

      // Enroll student in batch
      const { error: enrollErr } = await supabase.from("students_batches").insert({
        student_id: app.student_id,
        batch_id: app.batch_id,
        institute_code: codeData,
      });

      if (enrollErr && !enrollErr.message?.includes("duplicate") && !enrollErr.code?.includes("23505")) {
        toast({ title: "Warning", description: "Application approved but enrollment had an issue: " + enrollErr.message, variant: "destructive" });
        setActionLoading(null);
        return;
      } else {
        toast({ title: "Approved!", description: `${app.studentName} enrolled in ${app.batchName}` });
      }
    } else {
      toast({ title: "Rejected", description: `${app.studentName}'s application rejected` });
    }

    // Fix #6: Only update UI state after ALL DB operations have succeeded
    setApps(prev => prev.map(a => a.id === app.id ? { ...a, status: action } : a));
    setActionLoading(null);
  };

  const filtered = apps.filter(a => {
    const matchesFilter = filter === "all" || a.status === filter;
    const matchesSearch = a.studentName.toLowerCase().includes(search.toLowerCase()) ||
      a.batchName.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const pendingCount = apps.filter(a => a.status === "pending").length;

  return (
    <DashboardLayout title="Batch Applications">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <p className="text-muted-foreground text-sm">Review students' requests to join batches.</p>
          {pendingCount > 0 && (
            <Badge className="bg-danger-light text-danger border-danger/20 text-sm px-3 py-1">
              {pendingCount} pending
            </Badge>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search students or batches..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
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
                {f !== "all" && <span className="ml-1.5 text-xs opacity-70">({apps.filter(a => a.status === f).length})</span>}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
            <p className="font-semibold">No {filter === "all" ? "" : filter} applications</p>
            <p className="text-muted-foreground text-sm mt-1">Students can apply to join batches from their dashboard.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((app, i) => (
              <motion.div key={app.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-4 shadow-card border-border/50 hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{app.studentName}</span>
                        <Badge className="text-xs bg-accent-light text-accent border-0">Student</Badge>
                        {app.status === "pending" && <Badge className="text-xs bg-accent-light text-accent border-0 gap-1"><Clock className="w-2.5 h-2.5" />Pending</Badge>}
                        {app.status === "approved" && <Badge className="text-xs bg-success-light text-success border-0 gap-1"><CheckCircle2 className="w-2.5 h-2.5" />Approved</Badge>}
                        {app.status === "rejected" && <Badge className="text-xs bg-danger-light text-danger border-0 gap-1"><XCircle className="w-2.5 h-2.5" />Rejected</Badge>}
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
                          onClick={() => handleAction(app, "approved")}
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
                            onClick={() => handleAction(app, "rejected")}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
