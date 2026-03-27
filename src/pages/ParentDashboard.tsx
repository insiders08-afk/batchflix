import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarCheck, Trophy, IndianRupee, Megaphone,
  CheckCircle2, XCircle, Clock, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AttendanceRecord {
  date: string;
  present: boolean;
}

interface FeeRecord {
  id: string;
  description: string | null;
  amount: number;
  paid: boolean;
  due_date: string | null;
  paid_date: string | null;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  type: string | null;
}

export default function ParentDashboard() {
  const [parentName, setParentName] = useState("Parent");
  const [instituteName, setInstituteName] = useState("");
  const [childName, setChildName] = useState("");
  const [childBatchName, setChildBatchName] = useState("");
  const [childTeacher, setChildTeacher] = useState("");
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, institute_code")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setParentName(profile.full_name);
        if (profile.institute_code) {
          const { data: inst } = await supabase
            .from("institutes")
            .select("institute_name, city")
            .eq("institute_code", profile.institute_code)
            .single();
          if (inst) setInstituteName(`${inst.institute_name}${inst.city ? ", " + inst.city : ""}`);
        }
      }

      // Find child via pending_requests — look for child_id (set by admin) OR fallback to studentId text match
      const { data: pendingReq } = await supabase
        .from("pending_requests")
        .select("extra_data")
        .eq("user_id", user.id)
        .eq("role", "parent")
        .maybeSingle();

      let childUserId: string | null = null;

      if (pendingReq?.extra_data && typeof pendingReq.extra_data === "object") {
        const ed = pendingReq.extra_data as Record<string, unknown>;
        // First try: admin has linked child_id (UUID)
        if (ed.child_id && typeof ed.child_id === "string") {
          childUserId = ed.child_id;
        }
        // Fallback: match by studentId text field stored in student's pending_request extra_data
        else if (ed.studentId && typeof ed.studentId === "string") {
          // Look for a student whose pending_request extra_data has a matching studentId or teacherId
          // More reliable: query profiles by role=student in same institute and try to match
          const { data: parentProf } = await supabase
            .from("profiles")
            .select("institute_code")
            .eq("user_id", user.id)
            .maybeSingle();

          if (parentProf?.institute_code) {
            // Find student pending request with matching extra_data.studentId
            const { data: studentRequests } = await supabase
              .from("pending_requests")
              .select("user_id, extra_data")
              .eq("role", "student")
              .eq("institute_code", parentProf.institute_code)
              .eq("status", "approved");

            if (studentRequests) {
              const matchedReq = studentRequests.find((sr) => {
                const srEd = sr.extra_data as Record<string, unknown> | null;
                return srEd && (srEd.studentId === ed.studentId || srEd.teacherId === ed.studentId);
              });
              if (matchedReq) {
                childUserId = matchedReq.user_id;
              }
            }
          }
        }
      }

      if (childUserId) {
        const { data: childProfile } = await supabase
          .from("profiles")
          .select("full_name, institute_code")
          .eq("user_id", childUserId)
          .single();

        if (childProfile) {
          setChildName(childProfile.full_name);

          const { data: enrollment } = await supabase
            .from("students_batches")
            .select("batch_id")
            .eq("student_id", childUserId)
            .limit(1)
            .maybeSingle();

          if (enrollment) {
            const { data: batch } = await supabase
              .from("batches")
              .select("name, teacher_name")
              .eq("id", enrollment.batch_id)
              .single();
            if (batch) {
              setChildBatchName(batch.name);
              setChildTeacher(batch.teacher_name || "");
            }

            // Attendance
            const { data: attData } = await supabase
              .from("attendance")
              .select("date, present")
              .eq("student_id", childUserId)
              .eq("batch_id", enrollment.batch_id)
              .order("date", { ascending: false })
              .limit(20);
            setAttendance(attData || []);

            // Announcements
            const { data: annData } = await supabase
              .from("announcements")
              .select("id, title, content, created_at, type")
              .eq("batch_id", enrollment.batch_id)
              .order("created_at", { ascending: false })
              .limit(5);
            setAnnouncements(annData || []);
          }

          // Fees
          const { data: feeData } = await supabase
            .from("fees")
            .select("*")
            .eq("student_id", childUserId)
            .order("due_date", { ascending: false });
          setFees(feeData || []);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const present = attendance.filter(d => d.present).length;
  const absent = attendance.length - present;
  const attendanceRate = attendance.length > 0 ? Math.round((present / attendance.length) * 100) : null;
  const totalPaid = fees.filter(f => f.paid).reduce((sum, f) => sum + f.amount, 0);
  const totalDue = fees.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (loading) {
    return (
      <DashboardLayout title="Parent Overview" role="parent">
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Parent Overview" role="parent">
      <div className="space-y-5 w-full max-w-3xl">

        {/* Welcome hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="gradient-hero rounded-xl p-5 text-white">
            <p className="text-white/70 text-sm">Welcome back,</p>
            <h2 className="font-display font-bold text-2xl">{parentName}</h2>
            <p className="text-white/70 text-sm mt-0.5">Parent · {instituteName || "..."}</p>
          </div>
        </motion.div>

        {/* Child summary */}
        {childName ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <Card className="p-5 shadow-card border-border/50">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">Your Child</h3>
                <Badge className="bg-success-light text-success border-success/20 text-xs">Enrolled</Badge>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center text-white font-bold text-base">
                  {childName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <p className="font-display font-bold text-lg">{childName}</p>
                  {childBatchName && <p className="text-sm text-muted-foreground">{childBatchName}</p>}
                  {childTeacher && <p className="text-xs text-muted-foreground">Teacher: {childTeacher}</p>}
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <Card className="p-5 shadow-card border-border/50 text-center">
            <p className="text-sm text-muted-foreground">Child profile not linked yet.</p>
            <p className="text-xs text-muted-foreground mt-1">The admin needs to link your account to your child's profile in the Approvals page.</p>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Attendance", value: attendanceRate !== null ? `${attendanceRate}%` : "N/A", color: attendanceRate !== null && attendanceRate >= 75 ? "text-success" : "text-danger", icon: CalendarCheck, sub: `${present}/${attendance.length} days` },
            { label: "Paid Fees", value: `₹${totalPaid.toLocaleString()}`, color: "text-primary", icon: IndianRupee, sub: totalDue > 0 ? `₹${totalDue.toLocaleString()} due` : "All clear" },
            { label: "Announcements", value: String(announcements.length), color: "text-accent", icon: Megaphone, sub: "recent" },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
              <Card className="p-4 text-center shadow-card border-border/50">
                <s.icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />
                <div className={`text-xl font-display font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">{s.sub}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Attendance calendar strip */}
        {attendance.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="p-5 shadow-card border-border/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold">Recent Attendance</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-success inline-block"/>P ({present})</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-danger inline-block"/>A ({absent})</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {attendance.map((d, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.present ? "bg-success-light" : "bg-danger-light"}`}>
                      {d.present ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-danger" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }).split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Fee status */}
        {fees.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
            <Card className="p-5 shadow-card border-border/50">
              <h3 className="font-display font-semibold mb-4">Fee Status</h3>
              <div className="space-y-3">
                {fees.slice(0, 5).map((fee) => (
                  <div key={fee.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                    <div>
                      <p className="text-sm font-medium">{fee.description || "Fees"}</p>
                      {!fee.paid && fee.due_date && <p className="text-xs text-muted-foreground">Due by {new Date(fee.due_date).toLocaleDateString("en-IN")}</p>}
                      {fee.paid && fee.paid_date && <p className="text-xs text-muted-foreground">Paid on {new Date(fee.paid_date).toLocaleDateString("en-IN")}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">₹{fee.amount.toLocaleString()}</span>
                      <Badge className={fee.paid ? "bg-success-light text-success border-success/20 text-xs" : "bg-accent-light text-accent border-accent/20 text-xs"}>
                        {fee.paid ? "Paid" : "Due"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Total paid: ₹{totalPaid.toLocaleString()} {totalDue > 0 && `· ₹${totalDue.toLocaleString()} pending`}
              </p>
            </Card>
          </motion.div>
        )}

        {/* Announcements */}
        {announcements.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}>
            <Card className="p-5 shadow-card border-border/50">
              <div className="flex items-center gap-2 mb-4">
                <Megaphone className="w-4 h-4 text-primary" />
                <h3 className="font-display font-semibold">Recent Announcements</h3>
              </div>
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/30">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold">{a.title}</p>
                        {a.type && <Badge className="bg-primary-light text-primary border-primary/20 text-[10px] px-1.5 py-0">{a.type}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{a.content}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-3 h-3" />{timeAgo(a.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

      </div>
    </DashboardLayout>
  );
}
