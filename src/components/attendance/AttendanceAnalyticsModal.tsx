import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, BarChart3, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { parseBatchTiming, JS_DAY_ABBREVS } from "@/lib/batchTiming";

interface StudentRecord {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

interface StudentStats {
  student: StudentRecord;
  total: number;
  present: number;
  pct: number;
  history: { date: string; present: boolean }[];
}

interface AttendanceAnalyticsModalProps {
  open: boolean;
  onClose: () => void;
  stats: StudentStats | null;
  loading: boolean;
  batchId: string;
  schedule?: string | null;
}

type ViewMode = "summary" | "monthly";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function buildMonthlyMap(history: { date: string; present: boolean }[], year: number, month: number) {
  const map: Record<number, boolean | null> = {};
  history.forEach(h => {
    const d = new Date(h.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      map[d.getDate()] = h.present;
    }
  });
  return map;
}

export default function AttendanceAnalyticsModal({
  open, onClose, stats, loading, batchId, schedule,
}: AttendanceAnalyticsModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("summary");

  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());

  // Date-specific lookup
  const [lookupDay, setLookupDay] = useState("any");
  const [lookupMonth, setLookupMonth] = useState(String(today.getMonth()));
  const [lookupYear, setLookupYear] = useState(String(today.getFullYear()));
  const [lookupResult, setLookupResult] = useState<{ date: string; present: boolean } | null | "not-found">(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Day-off announcement dates for this batch+month
  const [dayOffDates, setDayOffDates] = useState<Set<string>>(new Set());

  // Parse batch schedule
  const batchTiming = parseBatchTiming(schedule ?? null);
  const scheduledDays: string[] = batchTiming?.days ?? [];
  const hasSchedule = scheduledDays.length > 0;

  const isBatchScheduledDay = (date: Date): boolean => {
    if (!hasSchedule) return true;
    return scheduledDays.includes(JS_DAY_ABBREVS[date.getDay()]);
  };

  // Load day-off announcements — uses machine-readable tag day_off_date:YYYY-MM-DD
  useEffect(() => {
    if (!batchId || !open) return;
    supabase
      .from("announcements")
      .select("content, title")
      .eq("batch_id", batchId)
      .eq("type", "day_off")
      .then(({ data }) => {
        const dates = new Set<string>();
        (data || []).forEach(ann => {
          // Primary: machine-readable tag
          const tagMatch = (ann.content || "").match(/day_off_date:(\d{4}-\d{2}-\d{2})/);
          if (tagMatch) { dates.add(tagMatch[1]); return; }
          // Fallback: parse from title "No Class — BatchName — Day, D Month YYYY"
          const titleMatch = ann.title.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
          if (titleMatch) {
            const day = parseInt(titleMatch[1]);
            const monthName = titleMatch[2];
            const year = parseInt(titleMatch[3]);
            const monthIdx = MONTHS.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
            if (monthIdx !== -1) {
              dates.add(`${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
            }
          }
        });
        setDayOffDates(dates);
      });
  }, [batchId, calMonth, calYear, open]);

  const last7 = stats?.history.slice(0, 7) ?? [];

  const monthlyMap = stats ? buildMonthlyMap(stats.history, calYear, calMonth) : {};
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();

  const isFutureMonth = calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth());

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const handleLookup = async () => {
    if (!stats || !lookupMonth || !lookupYear) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const m = String(parseInt(lookupMonth) + 1).padStart(2, "0");
      const y = lookupYear;
      let dateStr: string;
      if (lookupDay && lookupDay !== "any") {
        const d = String(parseInt(lookupDay)).padStart(2, "0");
        dateStr = `${y}-${m}-${d}`;
        const { data } = await supabase
          .from("attendance")
          .select("date, present")
          .eq("batch_id", batchId)
          .eq("student_id", stats.student.user_id)
          .eq("date", dateStr)
          .maybeSingle();
        setLookupResult(data ? { date: data.date, present: data.present } : "not-found");
      } else {
        // Show monthly calendar view
        setCalYear(parseInt(y));
        setCalMonth(parseInt(lookupMonth));
        setViewMode("monthly");
      }
    } finally {
      setLookupLoading(false);
    }
  };

  const initials = stats?.student.full_name.split(" ").map(n => n[0]).join("").slice(0, 2) ?? "?";

  // Header columns for monthly view
  const HEADER_COLS = [
    { label: "Su", abbrev: "Sun" },
    { label: "Mo", abbrev: "Mon" },
    { label: "Tu", abbrev: "Tue" },
    { label: "We", abbrev: "Wed" },
    { label: "Th", abbrev: "Thu" },
    { label: "Fr", abbrev: "Fri" },
    { label: "Sa", abbrev: "Sat" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setViewMode("summary"); setLookupResult(null); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {stats?.student.full_name || "Loading..."}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : stats ? (
          <div className="space-y-4">
            {/* Tab Switcher */}
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
              {(["summary", "monthly"] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => { setViewMode(mode); setLookupResult(null); }}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all capitalize",
                    viewMode === mode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode === "summary" ? "Summary & Records" : "Monthly Calendar"}
                </button>
              ))}
            </div>

            {viewMode === "summary" && (
              <>
                {/* Avatar + info */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-white font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <div>
                    <p className="font-semibold">{stats.student.full_name}</p>
                    <p className="text-xs text-muted-foreground">{stats.student.phone || stats.student.email}</p>
                  </div>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Classes", value: stats.total },
                    { label: "Present", value: stats.present, color: "text-success" },
                    { label: "Attendance", value: `${stats.pct}%`, color: stats.pct >= 75 ? "text-success" : "text-danger" },
                  ].map(s => (
                    <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center border border-border/30">
                      <div className={cn("text-xl font-display font-bold", s.color)}>{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Attendance Rate</span>
                    <span className={cn("font-semibold", stats.pct >= 75 ? "text-success" : "text-danger")}>
                      {stats.pct >= 75 ? "✓ Good Standing" : "⚠ Below 75%"}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", stats.pct >= 85 ? "bg-success" : stats.pct >= 75 ? "bg-warning" : "bg-danger")}
                      style={{ width: `${stats.pct}%` }}
                    />
                  </div>
                </div>

                {/* Last 7 days */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Last 7 Days</h4>
                  {last7.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">No recent records.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {last7.map((h, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-muted/30 border border-border/20">
                          <span className="text-sm">
                            {new Date(h.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                          </span>
                          <Badge className={h.present
                            ? "bg-success-light text-success border-success/20 text-xs"
                            : "bg-danger-light text-danger border-danger/20 text-xs"
                          }>
                            {h.present ? <><CheckCircle2 className="w-3 h-3 mr-1" />Present</> : <><XCircle className="w-3 h-3 mr-1" />Absent</>}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date Lookup */}
                <div className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/20">
                  <h4 className="text-sm font-semibold">Look Up Specific Date</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={lookupDay} onValueChange={setLookupDay}>
                      <SelectTrigger className="h-8 text-xs">
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
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={lookupYear} onValueChange={setLookupYear}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" className="w-full h-8 gradient-hero text-white border-0 text-xs" onClick={handleLookup} disabled={lookupLoading || !lookupMonth || !lookupYear}>
                    {lookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Access"}
                  </Button>
                  {lookupResult === "not-found" && (
                    <p className="text-xs text-muted-foreground text-center">No attendance record found for this date.</p>
                  )}
                  {lookupResult && lookupResult !== "not-found" && (
                    <div className={cn("flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium border", lookupResult.present ? "bg-success-light border-success/20 text-success" : "bg-danger-light border-danger/20 text-danger")}>
                      <span>{new Date(lookupResult.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
                      <span>{lookupResult.present ? "✓ Present" : "✗ Absent"}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {viewMode === "monthly" && (
              <>
                {/* Month/Year selectors */}
                <div className="flex gap-2">
                  <Select value={String(calMonth)} onValueChange={v => setCalMonth(parseInt(v))}>
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => {
                        const isFuture = calYear > today.getFullYear() || (calYear === today.getFullYear() && i > today.getMonth());
                        return (
                          <SelectItem key={i} value={String(i)} disabled={isFuture}>{m}</SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Select value={String(calYear)} onValueChange={v => setCalYear(parseInt(v))}>
                    <SelectTrigger className="h-9 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {isFutureMonth ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Cannot view future months.</p>
                ) : (
                  <div>
                    {/* Column headers — dim non-scheduled day columns */}
                    <div className="grid grid-cols-7 gap-1 mb-1.5">
                      {HEADER_COLS.map(({ label, abbrev }) => {
                        const isScheduled = !hasSchedule || scheduledDays.includes(abbrev);
                        return (
                          <div key={label} className={cn(
                            "text-center text-xs font-medium py-1",
                            isScheduled ? "text-foreground font-semibold" : "text-muted-foreground/35"
                          )}>
                            {label}
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const cellDate = new Date(calYear, calMonth, day);
                        const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const isToday = dateKey === todayKey;
                        const isFutureDay = new Date(calYear, calMonth, day) > today;
                        const status = monthlyMap[day];
                        const isOffDay = !isBatchScheduledDay(cellDate);
                        const isDayOff = dayOffDates.has(dateKey);

                        // Non-batch day: visible but de-emphasised
                        if (isOffDay) {
                          return (
                            <div key={day} className={cn(
                              "aspect-square flex flex-col items-center justify-center text-xs font-medium rounded-md border border-transparent",
                            )}>
                              <span className="text-muted-foreground/30">{day}</span>
                            </div>
                          );
                        }

                        // Day off (announced holiday on a normally scheduled day)
                        if (isDayOff) {
                          return (
                            <div key={day} className={cn(
                              "aspect-square flex flex-col items-center justify-center text-[10px] font-semibold rounded-md border",
                              "bg-warning/10 border-warning/30 text-warning",
                              isToday && "ring-2 ring-primary ring-offset-1"
                            )}>
                              <span>{day}</span>
                              <span className="text-[8px] font-bold leading-none mt-0.5">Off</span>
                            </div>
                          );
                        }

                        return (
                          <div key={day} className={cn(
                            "aspect-square flex flex-col items-center justify-center text-xs font-medium rounded-md border",
                            isFutureDay ? "text-muted-foreground/40 border-border/20 bg-muted/10" :
                            status === true ? "bg-success-light text-success border-success/20" :
                            status === false ? "bg-danger-light text-danger border-danger/20" :
                            "bg-muted/30 border-border/20 text-muted-foreground",
                            isToday && "ring-2 ring-primary ring-offset-1"
                          )}>
                            <span>{day}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-3 mt-3 text-xs text-muted-foreground justify-center flex-wrap">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success-light border border-success/20 inline-block" /> Present</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-danger-light border border-danger/20 inline-block" /> Absent</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted/30 border border-border/20 inline-block" /> Not Marked</span>
                      <span className="flex items-center gap-1"><span className="text-warning/70 text-[9px] font-bold">Off</span> Day Off</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
