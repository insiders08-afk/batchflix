import { Link } from "react-router-dom";
import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  CalendarCheck,
  Users,
  ExternalLink,
  Megaphone,
  ClipboardList,
  Loader2,
  Trophy,
  MessageSquare,
  CheckCircle2,
  X,
  Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Batch {
  id: string;
  name: string;
  course: string;
  schedule: string | null;
  studentCount: number;
}

interface BatchRequest {
  id: string;
  batch_id: string;
  batch_name: string | null;
  course: string | null;
  status: string;
}

export default function TeacherDashboard() {
  const { toast } = useToast();
  const [userName, setUserName] = useState("Teacher");
  const [instituteName, setInstituteName] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [batchRequests, setBatchRequests] = useState<BatchRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const activeInstituteCode = localStorage.getItem("batchhub_active_institute");

    const profileQuery = supabase
      .from("profiles")
      .select("full_name, institute_code")
      .eq("user_id", user.id)
      .eq("role", "teacher");

    const { data: profile } = activeInstituteCode
      ? await profileQuery.eq("institute_code", activeInstituteCode).maybeSingle()
      : await profileQuery.single();

    if (profile) {
      setUserName(profile.full_name);
      if (profile.institute_code) {
        const { data: inst } = await supabase
          .from("institutes")
          .select("institute_name, city")
          .eq("institute_code", profile.institute_code)
          .single();
        if (inst) setInstituteName(`${inst.institute_name}${inst.city ? ", " + inst.city : ""}`);
      }
    }

    const { data: batchData } = await supabase
      .from("batches")
      .select("id, name, course, schedule")
      .eq("teacher_id", user.id)
      .eq("is_active", true);

    if (batchData) {
      const enriched = await Promise.all(
        batchData.map(async (b) => {
          const { count } = await supabase
            .from("students_batches")
            .select("id", { count: "exact" })
            .eq("batch_id", b.id);
          return { ...b, studentCount: count || 0 };
        }),
      );
      setBatches(enriched);
      setTotalStudents(enriched.reduce((sum, b) => sum + b.studentCount, 0));
    }

    const { data: requests } = await supabase
      .from("batch_teacher_requests")
      .select("id, batch_id, batch_name, course, status")
      .eq("teacher_id", user.id)
      .eq("status", "pending");
    setBatchRequests(requests || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // LIMIT-03 fix: compute actual classes scheduled for today
  const JS_DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const classesToday = useMemo(() => {
    const todayAbbr = JS_DAY_ABBREVS[new Date().getDay()];
    return batches.filter((b) => {
      if (!b.schedule) return true; // no schedule = assume today
      try {
        const t = JSON.parse(b.schedule);
        if (t?.days?.length) return t.days.includes(todayAbbr);
      } catch {
        /* legacy text schedule — assume today */
      }
      return true;
    }).length;
  }, [batches]);

  // Realtime subscription for batch assignment requests
  useEffect(() => {
    const channel = supabase
      .channel("teacher-batch-requests-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "batch_teacher_requests" }, () => fetchData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const handleRequest = async (req: BatchRequest, accept: boolean) => {
    setRespondingId(req.id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRespondingId(null);
      return;
    }

    if (accept) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).single();

      const teacherName = profile?.full_name || userName;

      const { data: updated, error: batchErr } = await supabase
        .from("batches")
        .update({ teacher_id: user.id, teacher_name: teacherName, pending_teacher_name: null })
        .eq("id", req.batch_id)
        .select("id");

      if (batchErr || !updated || updated.length === 0) {
        toast({
          title: "Assignment failed",
          description: batchErr?.message || "Could not update the batch. Please ask your admin to re-send the request.",
          variant: "destructive",
        });
        setRespondingId(null);
        return;
      }

      await supabase.from("batch_teacher_requests").update({ status: "accepted" }).eq("id", req.id);
      toast({
        title: `✅ You've joined "${req.batch_name}"!`,
        description: "The batch now appears in your dashboard.",
      });
    } else {
      await supabase.from("batch_teacher_requests").update({ status: "rejected" }).eq("id", req.id);
      toast({ title: `Request for "${req.batch_name}" declined.` });
    }
    await fetchData();
    setRespondingId(null);
  };

  return (
    <DashboardLayout title="My Dashboard" role="teacher">
      <div className="space-y-5 w-full max-w-3xl">
        {/* Welcome hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="gradient-hero rounded-xl p-5 text-white">
            <p className="text-white/70 text-sm">Welcome back,</p>
            <h2 className="font-display font-bold text-2xl">{loading ? "..." : userName}</h2>
            <p className="text-white/70 text-sm mt-0.5">Teacher · {instituteName || "..."}</p>
          </div>
        </motion.div>

        {/* Pending batch assignment requests */}
        {batchRequests.length > 0 && (
          <Card className="p-5 shadow-card border-accent/30 bg-accent/5">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-accent" />
              <h3 className="font-display font-semibold text-accent">Batch Assignment Requests</h3>
              <Badge className="bg-accent/10 text-accent border-accent/20 text-xs">{batchRequests.length}</Badge>
            </div>
            <div className="space-y-2">
              {batchRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50"
                >
                  <div>
                    <p className="text-sm font-semibold">{req.batch_name || "Unnamed Batch"}</p>
                    <p className="text-xs text-muted-foreground">{req.course} · Admin wants you to teach this batch</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-success/10 text-success hover:bg-success hover:text-white border border-success/20"
                      disabled={respondingId === req.id}
                      onClick={() => handleRequest(req, true)}
                    >
                      {respondingId === req.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}{" "}
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                      disabled={respondingId === req.id}
                      onClick={() => handleRequest(req, false)}
                    >
                      <X className="w-3 h-3" /> Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "My Students", value: loading ? "—" : String(totalStudents), icon: Users, color: "text-primary" },
            {
              label: "My Batches",
              value: loading ? "—" : String(batches.length),
              icon: CalendarCheck,
              color: "text-success",
            },
            {
              label: "Classes Today",
              value: loading ? "—" : String(classesToday),
              icon: ClipboardList,
              color: "text-accent",
            },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="p-4 text-center shadow-card border-border/50">
                <s.icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />
                <div className={`text-xl font-display font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="p-5 shadow-card border-border/50">
            <h3 className="font-display font-semibold mb-3">Quick Actions</h3>
            {batches.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <Link to="/teacher/attendance">
                  <Button className="w-full gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2 h-11">
                    <CalendarCheck className="w-4 h-4" /> Mark Attendance
                  </Button>
                </Link>
                <Link to="/teacher/announcements">
                  <Button
                    variant="outline"
                    className="w-full gap-2 h-11 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Megaphone className="w-4 h-4" /> Post Announcement
                  </Button>
                </Link>
                <Link to="/teacher/tests">
                  <Button
                    variant="outline"
                    className="w-full gap-2 h-11 border-accent/30 text-accent hover:bg-accent/10"
                  >
                    <Trophy className="w-4 h-4" /> Enter Test Scores
                  </Button>
                </Link>
                <Link to="/teacher/homework">
                  <Button
                    variant="outline"
                    className="w-full gap-2 h-11 border-success/30 text-success hover:bg-success/10"
                  >
                    <BookOpen className="w-4 h-4" /> Post Homework / DPP
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No batches assigned yet. Ask your admin to assign you a batch.
              </p>
            )}
          </Card>
        </motion.div>

        {/* My Batches */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
          <h3 className="font-display font-semibold">My Batches</h3>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : batches.length === 0 ? (
          <Card className="p-8 text-center shadow-card border-border/50">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No batches assigned to you yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {batches.map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.36 + i * 0.08 }}
              >
                <Card className="p-5 shadow-card border-border/50 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center text-white font-bold text-sm">
                      {b.name.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{b.name}</p>
                      <Badge variant="secondary" className="text-xs mt-0.5">
                        {b.course}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {b.studentCount} students
                    </span>
                    {b.schedule &&
                      (() => {
                        try {
                          const t = JSON.parse(b.schedule);
                          if (t?.days?.length) {
                            const fmt = (h: number, m: number, ap: string) =>
                              `${h}:${String(m).padStart(2, "0")} ${ap}`;
                            return (
                              <span className="text-xs">
                                {t.days.join(", ")} · {fmt(t.startHour, t.startMinute, t.startAmPm)}–
                                {fmt(t.endHour, t.endMinute, t.endAmPm)}
                              </span>
                            );
                          }
                        } catch {
                          /* ignore */
                        }
                        return <span className="text-xs">{b.schedule}</span>;
                      })()}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link to={`/batch/${b.id}`}>
                      <Button className="w-full h-8 text-xs gap-1.5 gradient-hero text-white border-0 hover:opacity-90">
                        <MessageSquare className="w-3 h-3" /> Chat & More
                      </Button>
                    </Link>
                    <Link to={`/teacher/tests`}>
                      <Button
                        variant="outline"
                        className="w-full h-8 text-xs gap-1.5 text-accent border-accent/30 hover:bg-accent-light"
                      >
                        <Trophy className="w-3 h-3" /> Rankings
                      </Button>
                    </Link>
                  </div>
                  <Link to={`/batch/${b.id}`} className="mt-2 block">
                    <Button
                      variant="outline"
                      className="w-full h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary-light"
                    >
                      Open Workspace <ExternalLink className="w-3 h-3" />
                    </Button>
                  </Link>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
