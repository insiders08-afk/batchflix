/**
 * StudentBatchApply — lets an approved student browse active batches
 * and apply to join them. Shows application status per batch.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, Clock, CheckCircle2, XCircle, Loader2, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatTimingDisplay } from "@/lib/batchTiming";

interface BatchWithStatus {
  id: string;
  name: string;
  course: string;
  teacher_name: string | null;
  schedule: string | null;
  studentCount: number;
  applicationStatus: "none" | "pending" | "approved" | "rejected";
  enrolled: boolean;
  enrollment_open: boolean;
}

export default function StudentBatchApply() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<BatchWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // All active batches in the student's institute
    const { data: activeBatches } = await supabase
      .from("batches")
      .select("id, name, course, teacher_name, schedule")
      .eq("is_active", true);

    if (!activeBatches) { setLoading(false); return; }

    // Student's existing enrollments
    const { data: enrollments } = await supabase
      .from("students_batches")
      .select("batch_id")
      .eq("student_id", user.id);

    const enrolledIds = new Set((enrollments || []).map(e => e.batch_id));

    // Student's pending/approved/rejected applications
    const { data: applications } = await supabase
      .from("batch_applications")
      .select("batch_id, status")
      .eq("student_id", user.id);

    const appMap: Record<string, string> = {};
    (applications || []).forEach(a => { appMap[a.batch_id] = a.status; });

    // Student count per batch
    const enriched = await Promise.all(
      activeBatches.map(async (b) => {
        const { count } = await supabase
          .from("students_batches")
          .select("id", { count: "exact" })
          .eq("batch_id", b.id);

        const enrolled = enrolledIds.has(b.id);
        const appStatus = appMap[b.id] as "pending" | "approved" | "rejected" | undefined;

        return {
          ...b,
          studentCount: count || 0,
          enrolled,
          applicationStatus: enrolled ? "approved" : (appStatus || "none"),
        } as BatchWithStatus;
      })
    );

    setBatches(enriched);
    setLoading(false);
  };

  const handleApply = async (batchId: string) => {
    setApplying(batchId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const instituteCode = await supabase.rpc("get_my_institute_code");

    const { error } = await supabase.from("batch_applications").insert({
      student_id: user.id,
      batch_id: batchId,
      institute_code: instituteCode.data,
      status: "pending",
    });

    if (error) {
      toast({ title: "Error applying", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Application sent!", description: "Your teacher/admin will review your request." });
      setBatches(prev =>
        prev.map(b => b.id === batchId ? { ...b, applicationStatus: "pending" } : b)
      );
    }
    setApplying(null);
  };

  const statusBadge = (b: BatchWithStatus) => {
    if (b.enrolled) return (
      <Badge className="text-xs bg-success-light text-success border-success/20 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Enrolled
      </Badge>
    );
    if (b.applicationStatus === "pending") return (
      <Badge className="text-xs bg-accent-light text-accent border-accent/20 gap-1">
        <Hourglass className="w-3 h-3" /> Pending
      </Badge>
    );
    if (b.applicationStatus === "rejected") return (
      <Badge className="text-xs bg-danger-light text-danger border-danger/20 gap-1">
        <XCircle className="w-3 h-3" /> Rejected
      </Badge>
    );
    return null;
  };

  return (
    <DashboardLayout title="Join a Batch" role="student">
      <div className="space-y-5 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Browse active batches at your institute and apply to join. Your teacher or admin will approve your request.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : batches.length === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="font-semibold">No active batches</p>
            <p className="text-sm text-muted-foreground mt-1">Your institute hasn't created any batches yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {batches.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                <Card className="p-5 shadow-card border-border/50 hover:shadow-lg transition-all flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {b.name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">{b.name}</p>
                      <Badge variant="secondary" className="text-xs mt-0.5">{b.course}</Badge>
                    </div>
                    {statusBadge(b)}
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <BookOpen className="w-3 h-3" />
                      {b.teacher_name || "Teacher TBD"}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Users className="w-3 h-3" />
                      {b.studentCount} students enrolled
                    </p>
                    {b.schedule && (
                      <p className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {formatTimingDisplay(b.schedule)}
                      </p>
                    )}
                  </div>

                  {b.enrolled ? (
                    <Button disabled className="w-full h-8 text-xs bg-success-light text-success border border-success/20">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Already enrolled
                    </Button>
                  ) : b.applicationStatus === "pending" ? (
                    <Button disabled className="w-full h-8 text-xs bg-accent-light text-accent border border-accent/20">
                      <Hourglass className="w-3.5 h-3.5 mr-1.5" /> Application pending...
                    </Button>
                  ) : b.applicationStatus === "rejected" ? (
                    <Button
                      variant="outline"
                      onClick={() => handleApply(b.id)}
                      disabled={applying === b.id}
                      className="w-full h-8 text-xs border-danger/30 text-danger hover:bg-danger-light"
                    >
                      {applying === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
                      Re-apply
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleApply(b.id)}
                      disabled={applying === b.id}
                      className="w-full h-8 text-xs gradient-hero text-white border-0 hover:opacity-90"
                    >
                      {applying === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                      Apply to Join
                    </Button>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
