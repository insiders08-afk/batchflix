import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarCheck, Trophy, BookOpen, ExternalLink,
  FlaskConical, Megaphone, MessageSquare, Loader2, Users, IndianRupee
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Batch {
  id: string;
  name: string;
  teacher_name: string | null;
  course: string;
  schedule?: string | null;
  studentCount?: number;
}

interface TestScore {
  id: string;
  test_name: string;
  test_date: string;
  score: number;
  max_marks: number;
}

export default function StudentDashboard() {
  const [userName, setUserName] = useState("Student");
  const [instituteName, setInstituteName] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [recentTests, setRecentTests] = useState<TestScore[]>([]);
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const activeInstituteCode = localStorage.getItem("batchhub_active_institute");

      const profileQuery = supabase
        .from("profiles")
        .select("full_name, institute_code")
        .eq("user_id", user.id)
        .eq("role", "student");

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

      // All enrolled batches
      const { data: enrollments } = await supabase
        .from("students_batches")
        .select("batch_id")
        .eq("student_id", user.id);

      const batchIds = (enrollments || []).map(e => e.batch_id);
      if (batchIds.length > 0) {
        const { data: batchData } = await supabase
          .from("batches")
          .select("id, name, teacher_name, course, schedule")
          .in("id", batchIds);

        if (batchData) {
          const enriched = await Promise.all(batchData.map(async b => {
            const { count } = await supabase.from("students_batches").select("id", { count: "exact" }).eq("batch_id", b.id);
            return { ...b, studentCount: count || 0 };
          }));
          setBatches(enriched);

          // Recent test scores across all batches
          const { data: testData } = await supabase
            .from("test_scores")
            .select("*")
            .in("batch_id", batchIds)
            .eq("student_id", user.id)
            .order("test_date", { ascending: false })
            .limit(3);
          setRecentTests((testData || []) as TestScore[]);

          // Overall attendance rate
          const { data: attData } = await supabase
            .from("attendance")
            .select("present")
            .in("batch_id", batchIds)
            .eq("student_id", user.id);
          if (attData && attData.length > 0) {
            const rate = Math.round((attData.filter(a => a.present).length / attData.length) * 100);
            setAttendanceRate(rate);
          }
        }
      }

      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <DashboardLayout title="My Dashboard" role="student">
      <div className="space-y-5 w-full max-w-2xl">

        {/* Welcome hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="gradient-hero rounded-xl p-5 text-white">
            <p className="text-white/70 text-sm">Welcome back,</p>
            <h2 className="font-display font-bold text-2xl">{loading ? "..." : userName}</h2>
            <p className="text-white/70 text-sm mt-0.5">{instituteName || "..."}</p>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Attendance", value: loading ? "—" : attendanceRate !== null ? `${attendanceRate}%` : "N/A",
              color: attendanceRate !== null && attendanceRate >= 75 ? "text-success" : "text-danger", icon: CalendarCheck
            },
            { label: "Tests Done", value: loading ? "—" : String(recentTests.length), color: "text-accent", icon: Trophy },
            { label: "My Batches", value: loading ? "—" : String(batches.length), color: "text-primary", icon: BookOpen },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card className="p-4 text-center shadow-card border-border/50">
                <s.icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />
                <div className={`text-xl font-display font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-5 shadow-card border-border/50">
            <h3 className="font-display font-semibold mb-3">Quick Access</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/student/attendance">
                <Button variant="outline" className="w-full h-10 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary-light">
                  <CalendarCheck className="w-3.5 h-3.5" /> My Attendance
                </Button>
              </Link>
              <Link to="/student/tests">
                <Button variant="outline" className="w-full h-10 text-xs gap-1.5 border-accent/30 text-accent hover:bg-accent-light">
                  <FlaskConical className="w-3.5 h-3.5" /> Tests & Rankings
                </Button>
              </Link>
              <Link to="/student/homework">
                <Button variant="outline" className="w-full h-10 text-xs gap-1.5 border-success/30 text-success hover:bg-success-light">
                  <BookOpen className="w-3.5 h-3.5" /> Homework / DPP
                </Button>
              </Link>
              <Link to="/student/announcements">
                <Button variant="outline" className="w-full h-10 text-xs gap-1.5 border-border text-foreground hover:bg-muted">
                  <Megaphone className="w-3.5 h-3.5" /> Announcements
                </Button>
              </Link>
              <Link to="/student/fees" className="col-span-2">
                <Button variant="outline" className="w-full h-10 text-xs gap-1.5 border-warning/30 text-warning hover:bg-accent-light">
                  <IndianRupee className="w-3.5 h-3.5" /> My Fees
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>

        {/* My Batches */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <h3 className="font-display font-semibold mb-3">My Batches</h3>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : batches.length === 0 ? (
          <Card className="p-8 text-center shadow-card border-border/50 border-primary/20">
            <BookOpen className="w-8 h-8 mx-auto mb-3 text-primary opacity-60" />
            <p className="font-semibold text-sm">Not enrolled in any batch yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Browse active batches and apply to join one.</p>
            <Link to="/student/apply-batch">
              <Button className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2">
                <BookOpen className="w-4 h-4" /> Browse & Apply to Batches
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {batches.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 + i * 0.08 }}>
                <Card className="p-5 shadow-card border-border/50 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center text-white font-bold text-sm">
                      {b.name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{b.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs">{b.course}</Badge>
                        <span className="text-xs text-muted-foreground">{b.teacher_name || "Teacher TBD"}</span>
                      </div>
                      {b.schedule && (() => {
                        try {
                          const t = JSON.parse(b.schedule!);
                          if (t?.days?.length) {
                            const fmt = (h: number, m: number, ap: string) => `${h}:${String(m).padStart(2,"0")} ${ap}`;
                            return <p className="text-xs text-muted-foreground mt-0.5">{t.days.join(", ")} · {fmt(t.startHour, t.startMinute, t.startAmPm)}–{fmt(t.endHour, t.endMinute, t.endAmPm)}</p>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Users className="w-3.5 h-3.5" />{b.studentCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link to={`/batch/${b.id}`}>
                      <Button className="w-full h-8 text-xs gap-1.5 gradient-hero text-white border-0 hover:opacity-90">
                        <MessageSquare className="w-3 h-3" /> Batch Chat
                      </Button>
                    </Link>
                    <Link to="/student/tests">
                      <Button variant="outline" className="w-full h-8 text-xs gap-1.5 text-accent border-accent/30 hover:bg-accent-light">
                        <Trophy className="w-3 h-3" /> Rankings
                      </Button>
                    </Link>
                  </div>
                  <Link to={`/batch/${b.id}`} className="mt-2 block">
                    <Button variant="outline" className="w-full h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary-light">
                      Open Workspace <ExternalLink className="w-3 h-3" />
                    </Button>
                  </Link>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Recent Test Scores */}
        {recentTests.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}>
            <Card className="p-5 shadow-card border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  <h3 className="font-display font-semibold">Recent Scores</h3>
                </div>
                <Link to="/student/tests">
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary">View All →</Button>
                </Link>
              </div>
              <div className="space-y-3">
                {recentTests.map(t => {
                  const pct = Math.round((t.score / t.max_marks) * 100);
                  return (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/30">
                      <div>
                        <p className="text-sm font-semibold">{t.test_name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(t.test_date).toLocaleDateString("en-IN")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-bold">{t.score}<span className="text-xs text-muted-foreground">/{t.max_marks}</span></p>
                        <Badge className={`text-xs ${pct >= 75 ? "bg-success-light text-success border-success/20" : "bg-accent-light text-accent border-accent/20"}`}>
                          {pct}%
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
