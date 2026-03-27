import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, CheckCircle2, XCircle, Clock, CalendarDays, Loader2, Users, BarChart3, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import AttendanceAnalyticsModal from "@/components/attendance/AttendanceAnalyticsModal";
import AttendanceCalendarView from "@/components/attendance/AttendanceCalendarView";
import { isAttendanceEditable, formatTimingDisplay } from "@/lib/batchTiming";

type Batch = Tables<"batches">;
type Profile = Tables<"profiles">;

interface AttendanceHistoryItem {
  date: string;
  present: number;
  absent: number;
  pct: number;
}

interface StudentStats {
  student: { user_id: string; full_name: string; email: string; phone: string | null };
  total: number;
  present: number;
  pct: number;
  history: { date: string; present: boolean }[];
}

export default function AdminAttendance() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [students, setStudents] = useState<Profile[]>([]);
  const [attendance, setAttendance] = useState<Record<string, "present" | "absent">>({});
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [instituteCode, setInstituteCode] = useState("");

  const [analyticsStudent, setAnalyticsStudent] = useState<StudentStats | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const todayDisplay = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    const fetchBatches = async () => {
      setLoadingBatches(true);
      const { data: code } = await supabase.rpc("get_my_institute_code");
      setInstituteCode(code || "");
      const { data, error } = await supabase.from("batches").select("*").eq("institute_code", code || "").eq("is_active", true).order("name");
      if (!error && data) {
        setBatches(data);
        if (data.length > 0) setSelectedBatchId(data[0].id);
      }
      setLoadingBatches(false);
    };
    fetchBatches();
  }, []);

  const loadBatchData = useCallback(async (batchId: string) => {
    if (!batchId) return;
    setLoadingStudents(true);
    try {
      const { data: enrollments } = await supabase.from("students_batches").select("student_id").eq("batch_id", batchId);
      const enrolledIds = (enrollments || []).map(e => e.student_id);
      let profiles: Profile[] = [];
      if (enrolledIds.length > 0) {
        const { data: profileData } = await supabase.from("profiles").select("*").in("user_id", enrolledIds);
        profiles = profileData || [];
      }
      setStudents(profiles);

      const studentIds = profiles.map(p => p.user_id);

      // Fix #5: early-return instead of ["none"] hack
      const attMap: Record<string, "present" | "absent"> = {};
      if (studentIds.length > 0) {
        const { data: todayAtt } = await supabase
          .from("attendance").select("student_id, present")
          .eq("batch_id", batchId).eq("date", today)
          .in("student_id", studentIds);

        // Fix #8: Only populate from actual DB records — leave students without records
        // as undefined so we can distinguish "not taken" from "all present"
        (todayAtt || []).forEach(a => { attMap[a.student_id] = a.present ? "present" : "absent"; });
      }
      setAttendance(attMap);

      const { data: histData } = await supabase.from("attendance").select("date, present")
        .eq("batch_id", batchId).neq("date", today).order("date", { ascending: false }).limit(200);

      const dateMap: Record<string, { present: number; total: number }> = {};
      (histData || []).forEach(a => {
        if (!dateMap[a.date]) dateMap[a.date] = { present: 0, total: 0 };
        dateMap[a.date].total++;
        if (a.present) dateMap[a.date].present++;
      });

      const histItems: AttendanceHistoryItem[] = Object.entries(dateMap).slice(0, 5).map(([date, val]) => ({
        date: new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        present: val.present, absent: val.total - val.present,
        pct: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0,
      }));
      setHistory(histItems);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load", variant: "destructive" });
    } finally {
      setLoadingStudents(false);
    }
  }, [today, toast]);

  useEffect(() => { if (selectedBatchId) loadBatchData(selectedBatchId); }, [selectedBatchId, loadBatchData]);

  const selectedBatch = batches.find(b => b.id === selectedBatchId);
  const { editable: attEditable, reason: attLockReason, openTime, lockTime } = isAttendanceEditable(selectedBatch?.schedule ?? null);

  // Check if today is marked as a day-off for this batch using machine-readable tag
  const [todayIsDayOff, setTodayIsDayOff] = useState(false);
  useEffect(() => {
    if (!selectedBatchId) return;
    setTodayIsDayOff(false);
    supabase
      .from("announcements")
      .select("content, title")
      .eq("batch_id", selectedBatchId)
      .eq("type", "day_off")
      .then(({ data }) => {
        if (!data) return;
        const todayKey = today; // YYYY-MM-DD
        const found = data.some(ann => {
          // Primary: machine-readable tag
          const tagMatch = (ann.content || "").match(/day_off_date:(\d{4}-\d{2}-\d{2})/);
          if (tagMatch) return tagMatch[1] === todayKey;
          // Fallback: parse from title
          const titleMatch = ann.title.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
          if (titleMatch) {
            const day = parseInt(titleMatch[1]);
            const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
            const monthIdx = months.indexOf(titleMatch[2].toLowerCase());
            const year = parseInt(titleMatch[3]);
            if (monthIdx !== -1) {
              const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              return key === todayKey;
            }
          }
          return false;
        });
        setTodayIsDayOff(found);
      });
  }, [selectedBatchId, today]);

  const isLocked = !attEditable || todayIsDayOff;

  const toggle = (userId: string) => {
    if (isLocked) return;
    setAttendance(prev => {
      const current = prev[userId];
      // If not taken yet, default to present on first click
      if (!current) return { ...prev, [userId]: "present" };
      return { ...prev, [userId]: current === "present" ? "absent" : "present" };
    });
  };

  const markAll = (status: "present" | "absent") => {
    if (isLocked) return;
    setAttendance(Object.fromEntries(students.map(s => [s.user_id, status])));
  };

  const saveAttendance = async () => {
    if (!selectedBatchId || students.length === 0) return;
    if (todayIsDayOff) {
      toast({ title: "Day Off", description: "Today is marked as a day off for this batch. No attendance saved.", variant: "destructive" });
      return;
    }
    if (!attEditable) {
      toast({ title: "Attendance locked", description: attLockReason, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const records = students.map(s => ({
        batch_id: selectedBatchId, student_id: s.user_id, date: today,
        present: attendance[s.user_id] === "present",
        institute_code: instituteCode, marked_by: user?.id ?? null,
      }));
      const { error } = await supabase.from("attendance").upsert(records, { onConflict: "batch_id,student_id,date" });
      if (error) throw error;
      toast({ title: "✅ Attendance saved!", description: `Saved for ${students.length} students.` });
      loadBatchData(selectedBatchId);
    } catch (err: unknown) {
      toast({ title: "Error saving attendance", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openStudentAnalytics = async (student: Profile) => {
    setAnalyticsOpen(true); setAnalyticsLoading(true); setAnalyticsStudent(null);
    const { data: attData } = await supabase.from("attendance").select("date, present")
      .eq("batch_id", selectedBatchId).eq("student_id", student.user_id)
      .order("date", { ascending: false }).limit(200);
    const records = attData || [];
    const presentCount = records.filter(a => a.present).length;
    setAnalyticsStudent({
      student: { user_id: student.user_id, full_name: student.full_name, email: student.email, phone: student.phone },
      total: records.length, present: presentCount,
      pct: records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0,
      history: records.map(a => ({ date: a.date, present: a.present })),
    });
    setAnalyticsLoading(false);
  };

  const presentCount = Object.values(attendance).filter(v => v === "present").length;
  const pct = students.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;
  const filtered = students.filter(s => s.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout title="Attendance">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          {loadingBatches ? (
            <div className="w-56 h-9 bg-muted animate-pulse rounded-md" />
          ) : (
            <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
              <SelectTrigger className="w-full sm:w-56 h-9">
                <SelectValue placeholder="Select batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => markAll("present")}
              disabled={isLocked}
              className={cn("h-9 gap-1.5", !isLocked ? "text-success border-success/30 hover:bg-success-light" : "opacity-40 cursor-not-allowed")}>
              <CheckCircle2 className="w-3.5 h-3.5" /> All Present
            </Button>
            <Button size="sm" variant="outline" onClick={() => markAll("absent")}
              disabled={isLocked}
              className={cn("h-9 gap-1.5", !isLocked ? "text-danger border-danger/30 hover:bg-danger-light" : "opacity-40 cursor-not-allowed")}>
              <XCircle className="w-3.5 h-3.5" /> All Absent
            </Button>
          </div>
        </div>

        {/* Batch schedule info + status notice */}
        {selectedBatch?.schedule && (() => {
          const t = (() => { try { const p = JSON.parse(selectedBatch.schedule!); return p.days?.length ? p : null; } catch { return null; } })();
          const todayName = new Date().toLocaleDateString("en-IN", { weekday: "long" });
          const fmt = (h: number, m: number, ap: string) => `${h}:${String(m).padStart(2, "0")} ${ap}`;
          return (
            <div className="space-y-1.5">
              {t && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg text-xs bg-muted/30 border border-border/40">
                  <CalendarDays className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="font-semibold text-foreground">{t.days.join(", ")}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{fmt(t.startHour, t.startMinute, t.startAmPm)} – {fmt(t.endHour, t.endMinute, t.endAmPm)}</span>
                  <span className="text-muted-foreground">· Today: <span className="font-semibold text-foreground">{todayName}</span></span>
                </div>
              )}
              {/* Day-off always wins — shown all day, no timing info shown */}
              {todayIsDayOff ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border bg-warning/8 border-warning/25 text-warning">
                  <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="font-semibold">Window closed — Day Off for this batch today.</span>
                </div>
              ) : (
                <div className={cn(
                  "flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg text-xs border",
                  attEditable ? "bg-success/5 border-success/20 text-success" : "bg-warning/5 border-warning/20 text-warning"
                )}>
                  {attEditable ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <Lock className="w-3.5 h-3.5 flex-shrink-0" />}
                  {attEditable ? (
                    <span>Attendance opens at <span className="font-semibold">{openTime}</span> (class start time). Locks at <span className="font-semibold">{lockTime}</span></span>
                  ) : (
                    <span>{attLockReason}</span>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Intentionally removed: duplicate day-off banner was redundant with the schedule status notice above */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Present", value: todayIsDayOff ? "—" : presentCount, color: "success" },
                { label: "Absent", value: todayIsDayOff ? "—" : students.length - presentCount, color: "danger" },
                { label: "Attendance %", value: todayIsDayOff ? "—" : `${pct}%`, color: pct >= 75 ? "success" : "danger" },
              ].map(s => (
                <Card key={s.label} className="p-4 text-center shadow-card border-border/50">
                  <div className={`text-2xl font-display font-bold ${s.value === "—" ? "text-muted-foreground" : s.color === "success" ? "text-success" : "text-danger"}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                </Card>
              ))}
            </div>

            <Card className="shadow-card border-border/50 overflow-hidden">
              <div className="p-4 border-b border-border/50 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="font-display font-semibold text-sm">Today — {selectedBatch?.name || "No Batch"}</span>
                <Badge variant="secondary" className="ml-auto text-xs">{todayDisplay}</Badge>
                {!attEditable && <Lock className="w-3.5 h-3.5 text-warning ml-1" />}
              </div>

              {loadingStudents ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                  <Users className="w-8 h-8 mb-2" />
                  <p className="text-sm">No students enrolled in this batch.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40 max-h-[420px] overflow-y-auto">
                  {filtered.map((s, i) => (
                    <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                      <button className="flex items-center gap-3 flex-1 text-left" onClick={() => openStudentAnalytics(s)}>
                        <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {s.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium hover:text-primary transition-colors">{s.full_name}</p>
                          <p className="text-xs text-muted-foreground">{s.phone || s.email}</p>
                        </div>
                        <BarChart3 className="w-3.5 h-3.5 text-muted-foreground ml-1 flex-shrink-0" />
                      </button>
                      <button
                        onClick={() => toggle(s.user_id)}
                        disabled={isLocked}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ml-3",
                          isLocked ? "opacity-50 cursor-not-allowed" : "",
                          attendance[s.user_id] === "present"
                            ? "bg-success-light text-success hover:bg-success hover:text-white"
                            : attendance[s.user_id] === "absent"
                            ? "bg-danger-light text-danger hover:bg-danger hover:text-white"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                      >
                        {attendance[s.user_id] === "present"
                          ? <><CheckCircle2 className="w-3.5 h-3.5" /> Present</>
                          : attendance[s.user_id] === "absent"
                          ? <><XCircle className="w-3.5 h-3.5" /> Absent</>
                          : <><Clock className="w-3.5 h-3.5" /> Not taken</>
                        }
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}

              <div className="p-4 border-t border-border/50">
                <Button
                  className={cn("w-full border-0", !isLocked ? "gradient-hero text-white shadow-primary hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed")}
                  onClick={saveAttendance}
                  disabled={saving || students.length === 0 || isLocked}
                >
                  {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                    : todayIsDayOff ? <><Lock className="w-4 h-4 mr-2" />Day Off — No Attendance</>
                    : !attEditable ? <><Lock className="w-4 h-4 mr-2" />Attendance Locked</>
                    : "Save Attendance"}
                </Button>
                {todayIsDayOff && <p className="text-xs text-warning text-center mt-1.5">Today is marked as a day off.</p>}
                {!todayIsDayOff && !attEditable && <p className="text-xs text-muted-foreground text-center mt-1.5">{attLockReason}</p>}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="shadow-card border-border/50">
              <div className="p-4 border-b border-border/50 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="font-display font-semibold text-sm">Recent History</span>
              </div>
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground px-4 text-center">
                  <CalendarDays className="w-7 h-7 mb-2" />
                  <p className="text-sm">No previous records yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {history.map((h, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{h.date}</span>
                        <span className={`text-sm font-bold ${h.pct >= 85 ? "text-success" : h.pct >= 75 ? "text-warning" : "text-danger"}`}>{h.pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${h.pct >= 85 ? "bg-success" : h.pct >= 75 ? "bg-warning" : "bg-danger"}`} style={{ width: `${h.pct}%` }} />
                      </div>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">{h.present} present</span>
                        <span className="text-xs text-muted-foreground">{h.absent} absent</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {selectedBatchId && (
              <AttendanceCalendarView
                batchId={selectedBatchId}
                batchName={selectedBatch?.name}
                instituteCode={instituteCode}
                role="admin"
                schedule={selectedBatch?.schedule}
                onDayOffChange={() => {
                  // Re-check day-off status for today when calendar changes
                  setTodayIsDayOff(false);
                  supabase
                    .from("announcements")
                    .select("content, title")
                    .eq("batch_id", selectedBatchId)
                    .eq("type", "day_off")
                    .then(({ data }) => {
                      if (!data) return;
                      const todayKey = today;
                      const found = data.some(ann => {
                        const tagMatch = (ann.content || "").match(/day_off_date:(\d{4}-\d{2}-\d{2})/);
                        if (tagMatch) return tagMatch[1] === todayKey;
                        return false;
                      });
                      setTodayIsDayOff(found);
                    });
                }}
              />
            )}
          </div>
        </div>
      </div>

      <AttendanceAnalyticsModal
        open={analyticsOpen}
        onClose={() => { setAnalyticsOpen(false); setAnalyticsStudent(null); }}
        stats={analyticsStudent}
        loading={analyticsLoading}
        batchId={selectedBatchId}
        schedule={selectedBatch?.schedule}
      />
    </DashboardLayout>
  );
}
