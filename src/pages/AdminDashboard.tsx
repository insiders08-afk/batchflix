import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, CalendarCheck, IndianRupee, AlertTriangle,
  ArrowUpRight, Megaphone, Clock, CheckCircle2
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeBatches: 0,
    todayAttendance: 0,
    unpaidFees: 0,
  });
  const [batches, setBatches] = useState<{ id: string; name: string; teacher_name: string | null; studentCount: number }[]>([]);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; batch_id: string | null; created_at: string; posted_by_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const code = await supabase.rpc("get_my_institute_code");
    const instituteCode = code.data;
    if (!instituteCode) { setLoading(false); return; }

    const today = new Date().toISOString().split("T")[0];

    const [studentsRes, batchesRes, attendanceRes, feesRes, announcementsRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact" }).eq("institute_code", instituteCode).eq("role", "student"),
      supabase.from("batches").select("id, name, teacher_name").eq("institute_code", instituteCode).eq("is_active", true),
      supabase.from("attendance").select("present").eq("institute_code", instituteCode).eq("date", today),
      supabase.from("fees").select("id", { count: "exact" }).eq("institute_code", instituteCode).eq("paid", false),
      supabase.from("announcements").select("id, title, batch_id, created_at, posted_by_name").eq("institute_code", instituteCode).order("created_at", { ascending: false }).limit(5),
    ]);

    const totalStudents = studentsRes.count || 0;
    const activeBatches = batchesRes.data?.length || 0;
    const attendanceRows = attendanceRes.data || [];
    const hasAttendanceToday = attendanceRows.length > 0;
    const todayAttendance = hasAttendanceToday
      ? Math.round((attendanceRows.filter(r => r.present).length / attendanceRows.length) * 100)
      : -1; // -1 signals "not taken yet"
    const unpaidFees = feesRes.count || 0;

    // Fix #3: Single aggregated query for student counts instead of N+1 per-batch
    const batchIds = (batchesRes.data || []).slice(0, 5).map(b => b.id);
    let studentCountMap: Record<string, number> = {};
    if (batchIds.length > 0) {
      const { data: enrollments } = await supabase
        .from("students_batches")
        .select("batch_id")
        .in("batch_id", batchIds);
      (enrollments || []).forEach(e => {
        studentCountMap[e.batch_id] = (studentCountMap[e.batch_id] || 0) + 1;
      });
    }

    const enrichedBatches = (batchesRes.data || []).slice(0, 5).map(b => ({
      ...b,
      studentCount: studentCountMap[b.id] || 0,
    }));

    setStats({ totalStudents, activeBatches, todayAttendance, unpaidFees });
    setBatches(enrichedBatches);
    setAnnouncements(announcementsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime: re-fetch when new announcements are posted
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => fetchData()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const statCards = [
    { title: "Total Students", value: loading ? "—" : String(stats.totalStudents), icon: Users, bg: "bg-primary-light", iconColor: "text-primary" },
    { title: "Active Batches", value: loading ? "—" : String(stats.activeBatches), icon: CalendarCheck, bg: "bg-success-light", iconColor: "text-success" },
    { title: "Today's Attendance", value: loading ? "—" : stats.todayAttendance === -1 ? "Not taken yet" : `${stats.todayAttendance}%`, icon: CheckCircle2, bg: "bg-accent-light", iconColor: "text-accent" },
    { title: "Unpaid Fees", value: loading ? "—" : String(stats.unpaidFees), icon: IndianRupee, bg: "bg-danger-light", iconColor: "text-danger" },
  ];

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <DashboardLayout title="Overview">
      <div className="space-y-6 w-full">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="p-5 shadow-card border-border/50 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                  </div>
                </div>
                <div className="text-2xl font-display font-bold mb-0.5">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.title}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Announcements + Batches */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Announcements */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="p-5 shadow-card border-border/50 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-base">Recent Announcements</h3>
                <Link to="/admin/announcements">
                  <Button variant="ghost" size="sm" className="text-primary h-8 text-xs gap-1">
                    View all <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No announcements yet.</p>
              ) : (
                <div className="space-y-3">
                  {announcements.map((ann) => (
                    <div key={ann.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/60 border border-border/40">
                      <div className="w-7 h-7 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0">
                        <Megaphone className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ann.title}</p>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {timeAgo(ann.created_at)}
                          {ann.posted_by_name && ` · ${ann.posted_by_name}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>

          {/* Alerts */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}>
            <Card className="p-5 shadow-card border-border/50 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-base">Alerts</h3>
                {stats.unpaidFees > 0 && (
                  <Badge className="bg-danger-light text-danger border-danger/20 text-xs">{stats.unpaidFees} unpaid</Badge>
                )}
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : stats.unpaidFees === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-success mb-2" />
                  <p className="text-sm text-muted-foreground">All fees are up to date!</p>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-danger-light/30 border border-danger/20">
                  <div className="w-7 h-7 rounded-lg bg-danger-light flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm leading-snug">{stats.unpaidFees} student(s) have unpaid fees</p>
                    <Link to="/admin/fees">
                      <Button variant="ghost" size="sm" className="text-danger h-7 text-xs p-0 mt-1">View fees →</Button>
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        </div>

        {/* Active Batches */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.56 }}>
          <Card className="p-5 shadow-card border-border/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-base">Active Batches</h3>
              <Link to="/admin/batches">
                <Button variant="ghost" size="sm" className="text-primary h-8 text-xs gap-1">
                  Manage <ArrowUpRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : batches.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">No batches created yet.</p>
                <Link to="/admin/batches">
                  <Button size="sm" className="gradient-hero text-white border-0 hover:opacity-90">Create First Batch</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center text-white text-xs font-bold">
                        {batch.name.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{batch.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.teacher_name || "No teacher assigned"} · {batch.studentCount} students
                        </p>
                      </div>
                    </div>
                    <Link to={`/batch/${batch.id}`}>
                      <Button size="sm" variant="outline" className="h-8 text-xs">Open</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
