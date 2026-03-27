import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, CheckCircle2, XCircle, TrendingUp, Loader2, CalendarCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AttendanceRecord {
  date: string;
  present: boolean;
  batch_id: string;
}

interface BatchInfo {
  id: string;
  name: string;
  course: string;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export default function StudentAttendance() {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar heatmap view
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [lookupDay, setLookupDay] = useState("any");
  const [lookupMonth, setLookupMonth] = useState(String(today.getMonth()));
  const [lookupYear, setLookupYear] = useState(String(today.getFullYear()));
  const [lookupResult, setLookupResult] = useState<{ date: string; present: boolean } | "not-found" | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: enrollments } = await supabase
        .from("students_batches")
        .select("batch_id")
        .eq("student_id", user.id);

      const batchIds = (enrollments || []).map(e => e.batch_id);
      if (batchIds.length > 0) {
        const { data: batchData } = await supabase
          .from("batches")
          .select("id, name, course")
          .in("id", batchIds);
        setBatches((batchData || []) as BatchInfo[]);
        if (batchData && batchData.length === 1) setSelectedBatch(batchData[0].id);
      }

      const { data: attData } = await supabase
        .from("attendance")
        .select("date, present, batch_id")
        .eq("student_id", user.id)
        .order("date", { ascending: false })
        .limit(365);

      setRecords((attData || []) as AttendanceRecord[]);
      setLoading(false);
    };
    init();
  }, []);

  const filteredRecords = selectedBatch === "all" ? records : records.filter(r => r.batch_id === selectedBatch);
  const totalClasses = filteredRecords.length;
  const presentClasses = filteredRecords.filter(r => r.present).length;
  const absentClasses = totalClasses - presentClasses;
  const attendancePct = totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100) : 0;

  // Calendar heatmap
  const isFutureMonth = calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth());
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();

  const calMap: Record<number, boolean | null> = {};
  filteredRecords.forEach(r => {
    const d = new Date(r.date);
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
      calMap[d.getDate()] = r.present;
    }
  });

  const handleAccess = () => {
    setLookupResult(null);
    if (lookupDay && lookupDay !== "any") {
      // Specific date lookup from existing records
      const m = String(parseInt(lookupMonth) + 1).padStart(2, "0");
      const d = String(parseInt(lookupDay)).padStart(2, "0");
      const dateStr = `${lookupYear}-${m}-${d}`;
      const found = filteredRecords.find(r => r.date === dateStr);
      setLookupResult(found ? { date: found.date, present: found.present } : "not-found");
    } else {
      // Show monthly calendar
      setCalYear(parseInt(lookupYear));
      setCalMonth(parseInt(lookupMonth));
      setShowCalendar(true);
    }
  };

  if (loading) return (
    <DashboardLayout title="My Attendance" role="student">
      <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title="My Attendance" role="student">
      <div className="space-y-5 max-w-2xl">
        {batches.length > 1 && (
          <Select value={selectedBatch} onValueChange={setSelectedBatch}>
            <SelectTrigger className="w-full sm:w-56 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Batches</SelectItem>
              {batches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Classes", value: totalClasses, color: "text-foreground" },
            { label: "Present", value: presentClasses, color: "text-success" },
            { label: "Absent", value: absentClasses, color: "text-danger" },
            { label: "Attendance %", value: `${attendancePct}%`, color: attendancePct >= 75 ? "text-success" : "text-danger" },
          ].map(s => (
            <Card key={s.label} className="p-4 text-center shadow-card border-border/50">
              <div className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Progress bar */}
        {totalClasses > 0 && (
          <Card className="p-4 shadow-card border-border/50">
            <div className="flex justify-between text-sm mb-2">
              <span className="flex items-center gap-1.5 font-medium">
                <TrendingUp className="w-4 h-4 text-primary" /> Attendance Rate
              </span>
              <span className={`font-bold ${attendancePct >= 75 ? "text-success" : "text-danger"}`}>
                {attendancePct >= 75 ? "✓ Good Standing" : "⚠ Below 75%"}
              </span>
            </div>
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${attendancePct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`h-full rounded-full ${attendancePct >= 85 ? "bg-success" : attendancePct >= 75 ? "bg-warning" : "bg-danger"}`}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0%</span>
              <span className="text-warning">75% required</span>
              <span>100%</span>
            </div>
          </Card>
        )}

        {/* Date Lookup + Monthly Heatmap */}
        <Card className="shadow-card border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border/50 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="font-display font-semibold text-sm">Look Up Attendance</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Select value={lookupDay} onValueChange={setLookupDay}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Day (opt)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">— Any day —</SelectItem>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={lookupMonth} onValueChange={setLookupMonth}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => {
                    const future = parseInt(lookupYear) > today.getFullYear() || (parseInt(lookupYear) === today.getFullYear() && i > today.getMonth());
                    return <SelectItem key={i} value={String(i)} disabled={future}>{m}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <Select value={lookupYear} onValueChange={setLookupYear}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full h-9 gradient-hero text-white border-0 text-sm" onClick={handleAccess}>
              Access
            </Button>

            {lookupResult === "not-found" && (
              <p className="text-sm text-muted-foreground text-center">No attendance record found for this date.</p>
            )}
            {lookupResult && lookupResult !== "not-found" && (
              <div className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium border",
                lookupResult.present ? "bg-success-light border-success/20 text-success" : "bg-danger-light border-danger/20 text-danger"
              )}>
                <span>{new Date(lookupResult.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                <span>{lookupResult.present ? "✓ Present" : "✗ Absent"}</span>
              </div>
            )}

            {/* Monthly Calendar Heatmap */}
            {showCalendar && (
              <div className="border border-border/40 rounded-lg p-3 space-y-3">
                <div className="flex gap-2">
                  <Select value={String(calMonth)} onValueChange={v => setCalMonth(parseInt(v))}>
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => {
                        const future = calYear > today.getFullYear() || (calYear === today.getFullYear() && i > today.getMonth());
                        return <SelectItem key={i} value={String(i)} disabled={future}>{m}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  <Select value={String(calYear)} onValueChange={v => setCalYear(parseInt(v))}>
                    <SelectTrigger className="h-8 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {isFutureMonth ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Cannot view future months.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-7 gap-1">
                      {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                        <div key={d} className="text-center text-[10px] text-muted-foreground font-medium">{d}</div>
                      ))}
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const isFutureDay = new Date(calYear, calMonth, day) > today;
                        const isToday = calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();
                        const status = calMap[day];
                        return (
                          <div key={day} className={cn(
                            "aspect-square flex items-center justify-center text-[11px] font-medium rounded border",
                            isFutureDay ? "text-muted-foreground/20 border-transparent" :
                            status === true ? "bg-success-light text-success border-success/20" :
                            status === false ? "bg-danger-light text-danger border-danger/20" :
                            "bg-muted/20 border-border/10 text-muted-foreground/40",
                            isToday && "ring-1 ring-primary"
                          )}>
                            {day}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground justify-center">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-success-light border border-success/20 inline-block" /> Present</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-danger-light border border-danger/20 inline-block" /> Absent</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Daily records by month (last 7 per month) */}
        {totalClasses === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <CalendarCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">No attendance records yet</p>
            <p className="text-muted-foreground text-sm mt-1">Your teacher hasn't marked attendance yet.</p>
          </Card>
        ) : (
          (() => {
            const byMonth: Record<string, AttendanceRecord[]> = {};
            filteredRecords.forEach(r => {
              const month = r.date.slice(0, 7);
              if (!byMonth[month]) byMonth[month] = [];
              byMonth[month].push(r);
            });
            const monthEntries = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));

            return monthEntries.map(([month, recs]) => {
              const mDate = new Date(month + "-01");
              const mLabel = mDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
              const mPresent = recs.filter(r => r.present).length;
              const mPct = Math.round((mPresent / recs.length) * 100);
              // Show last 7 days only
              const displayRecs = [...recs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
              return (
                <motion.div key={month} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="shadow-card border-border/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-muted/30">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">{mLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{mPresent}/{recs.length} present</span>
                        <Badge className={`text-xs ${mPct >= 75 ? "bg-success-light text-success border-success/20" : "bg-danger-light text-danger border-danger/20"}`}>
                          {mPct}%
                        </Badge>
                      </div>
                    </div>
                    <div className="divide-y divide-border/30">
                      {displayRecs.map(r => (
                        <div key={`${r.date}-${r.batch_id}`} className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${r.present ? "bg-success" : "bg-danger"}`} />
                            <div>
                              <p className="text-sm font-medium">
                                {new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                              </p>
                              {batches.length > 1 && (
                                <p className="text-xs text-muted-foreground">
                                  {batches.find(b => b.id === r.batch_id)?.name}
                                </p>
                              )}
                            </div>
                          </div>
                          {r.present ? (
                            <div className="flex items-center gap-1.5 text-success text-sm font-medium">
                              <CheckCircle2 className="w-4 h-4" /> Present
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-danger text-sm font-medium">
                              <XCircle className="w-4 h-4" /> Absent
                            </div>
                          )}
                        </div>
                      ))}
                      {recs.length > 7 && (
                        <div className="px-4 py-2 text-xs text-muted-foreground text-center">
                          Showing last 7 of {recs.length} records this month
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            });
          })()
        )}
      </div>
    </DashboardLayout>
  );
}
