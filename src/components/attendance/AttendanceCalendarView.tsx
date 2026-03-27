import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, Loader2, XCircle, CheckCircle2, CalendarOff, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { parseBatchTiming, isAttendanceEditable, JS_DAY_ABBREVS } from "@/lib/batchTiming";

interface AttendanceCalendarViewProps {
  batchId: string;
  batchName?: string;
  instituteCode?: string;
  role?: "admin" | "teacher";
  schedule?: string | null;
  onDayOffChange?: () => void;
}

interface DayAttendance {
  present: number;
  absent: number;
  absentStudents: { name: string; email: string }[];
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const JS_DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const HEADER_COLS: { label: string; jsDay: number; abbrev: string }[] = [
  { label: "Su", jsDay: 0, abbrev: "Sun" },
  { label: "Mo", jsDay: 1, abbrev: "Mon" },
  { label: "Tu", jsDay: 2, abbrev: "Tue" },
  { label: "We", jsDay: 3, abbrev: "Wed" },
  { label: "Th", jsDay: 4, abbrev: "Thu" },
  { label: "Fr", jsDay: 5, abbrev: "Fri" },
  { label: "Sa", jsDay: 6, abbrev: "Sat" },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

function dateKeyToLocalDate(key: string): Date {
  const { year, month, day } = parseDateKey(key);
  return new Date(year, month, day);
}

function localDateToKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---- Cancel / Undo Day Off Dialog ----
function CancelDayOffDialog({
  open, onClose, date, batchId, batchName, onDone
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  batchId: string;
  batchName?: string;
  onDone: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const dateDisplay = date
    ? dateKeyToLocalDate(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const handleCancel = async () => {
    setDeleting(true);
    try {
      const { data } = await supabase
        .from("announcements")
        .select("id")
        .eq("batch_id", batchId)
        .eq("type", "day_off")
        .ilike("content", `%day_off_date:${date}%`);
      if (data && data.length > 0) {
        await supabase.from("announcements").delete().in("id", data.map(a => a.id));
      }
      onDone();
      onClose();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <CalendarOff className="w-5 h-5 text-danger" /> Cancel Day Off
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Remove the day-off for <span className="font-semibold text-foreground">{dateDisplay}</span> on{" "}
            <span className="font-semibold text-foreground">{batchName || "this batch"}</span>?
            <br /><span className="text-xs">This will delete the associated announcement.</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Keep Off</Button>
            <Button
              className="flex-1 bg-danger text-white hover:bg-danger/90 border-0"
              onClick={handleCancel}
              disabled={deleting}
            >
              {deleting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Removing...</> : "Cancel Day Off"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Day Off Dialog for future dates ----
function FutureDayOffDialog({
  open, onClose, date, batchId, batchName, instituteCode, onDone
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  batchId: string;
  batchName?: string;
  instituteCode?: string;
  onDone: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [notify, setNotify] = useState(true);
  const [title, setTitle] = useState("");
  // Only the human-readable body; the day_off_date tag is always appended separately on save
  const [messageBody, setMessageBody] = useState("");
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const [checking, setChecking] = useState(false);

  const lockedTag = `day_off_date:${date}`;

  const dateDisplay = date
    ? dateKeyToLocalDate(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  useEffect(() => {
    if (open && date) {
      setAlreadyMarked(false);
      setChecking(true);
      supabase
        .from("announcements")
        .select("id")
        .eq("batch_id", batchId)
        .eq("type", "day_off")
        .ilike("content", `%day_off_date:${date}%`)
        .then(({ data }) => {
          const marked = (data?.length ?? 0) > 0;
          setAlreadyMarked(marked);
          setChecking(false);
          if (!marked) {
            setTitle(`No Class — ${batchName || "Batch"} — ${dateDisplay}`);
            setMessageBody(`Dear students, there will be no class for ${batchName || "this batch"} on ${dateDisplay}. Please plan accordingly.`);
          }
        });
    }
  }, [open, date]);

  const handleConfirm = async () => {
    if (!instituteCode) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user!.id).single();

      // Always reconstruct content with the locked tag — user cannot remove it
      const fullContent = `${messageBody.trim()}\n\n${lockedTag}`;

      if (notify) {
        await supabase.from("announcements").insert({
          title,
          content: fullContent,
          batch_id: batchId,
          institute_code: instituteCode,
          posted_by: user!.id,
          posted_by_name: profile?.full_name || "Admin",
          type: "day_off",
          notify_push: true,
        });
      }
      onDone();
      onClose();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <CalendarOff className="w-5 h-5 text-warning" /> Mark Day Off
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {checking ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : alreadyMarked ? (
            <>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-warning/30 bg-warning/8">
                <CalendarOff className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-warning">Already marked as Day Off</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-foreground">{dateDisplay}</span> is already a day off for{" "}
                    <span className="font-medium text-foreground">{batchName}</span>.
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Mark <span className="font-semibold text-foreground">{dateDisplay}</span> as a day off for{" "}
                <span className="font-semibold text-foreground">{batchName || "this batch"}</span>?
              </p>

              <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                <input type="checkbox" id="notify-cal" checked={notify} onChange={e => setNotify(e.target.checked)} className="mt-0.5 accent-primary" />
                <label htmlFor="notify-cal" className="text-sm cursor-pointer">
                  <span className="font-medium">Send push notification & announcement</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Notify students in this batch</p>
                </label>
              </div>

              {notify && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Announcement Title</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Message</Label>
                    <textarea
                      value={messageBody}
                      onChange={e => setMessageBody(e.target.value)}
                      rows={3}
                      className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {/* Locked system tag — cannot be edited or deleted */}
                    <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1.5 rounded-md border border-dashed border-warning/50 bg-warning/5 select-none">
                      <Lock className="w-3 h-3 text-warning flex-shrink-0" />
                      <span className="text-xs font-mono text-warning font-medium">{lockedTag}</span>
                      <span className="text-xs text-muted-foreground ml-1">— system tag (read-only)</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                <Button
                  className="flex-1 bg-warning text-white hover:bg-warning/90 border-0"
                  onClick={handleConfirm}
                  disabled={sending}
                >
                  {sending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Sending...</> : "Confirm Day Off"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendanceCalendarView({
  batchId, batchName, instituteCode, role, schedule, onDayOffChange
}: AttendanceCalendarViewProps) {
  const today = new Date();
  const todayKey = localDateToKey(today);

  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [monthData, setMonthData] = useState<Record<string, DayAttendance>>({});
  const [dayOffDates, setDayOffDates] = useState<Set<string>>(new Set());
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayOffDate, setDayOffDate] = useState<string | null>(null);

  const isFutureMonth = calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth());

  const batchTiming = parseBatchTiming(schedule ?? null);
  const scheduledDays: string[] = batchTiming?.days ?? [];
  const hasSchedule = scheduledDays.length > 0;

  const { editable: attendanceWindowOpen } = isAttendanceEditable(schedule ?? null);

  const isBatchScheduledDay = (date: Date): boolean => {
    if (!hasSchedule) return true;
    return scheduledDays.includes(JS_DAY_ABBREVS[date.getDay()]);
  };

  // Only admins can mark/cancel day-offs. Teachers get read-only calendar.
  const canMarkDayOff = !!(role === "admin" && instituteCode);

  // Load day-off announcements for the viewed month — uses machine-readable tag day_off_date:YYYY-MM-DD
  const loadDayOffDates = useCallback(async () => {
    if (!batchId) return;

    const { data } = await supabase
      .from("announcements")
      .select("content, title")
      .eq("batch_id", batchId)
      .eq("type", "day_off");

    if (!data) return;
    const dates = new Set<string>();
    data.forEach(ann => {
      // Primary: machine-readable tag embedded in content
      const tagMatch = (ann.content || "").match(/day_off_date:(\d{4}-\d{2}-\d{2})/);
      if (tagMatch) {
        dates.add(tagMatch[1]);
        return;
      }
      // Fallback: parse from title "No Class — BatchName — Day, D Month YYYY" or "Day, D Month"
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
  }, [batchId, calMonth, calYear]);

  const loadMonthData = useCallback(async () => {
    if (!batchId || isFutureMonth) return;
    setLoadingMonth(true);
    setSelectedDate(null);

    const m = String(calMonth + 1).padStart(2, "0");
    const startDate = `${calYear}-${m}-01`;
    const endDate = `${calYear}-${m}-${String(getDaysInMonth(calYear, calMonth)).padStart(2, "0")}`;

    const { data: attRecords } = await supabase
      .from("attendance")
      .select("date, present, student_id")
      .eq("batch_id", batchId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (!attRecords) { setLoadingMonth(false); return; }

    const studentIds = [...new Set(attRecords.map(a => a.student_id))];
    let nameMap: Record<string, { name: string; email: string }> = {};
    if (studentIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", studentIds);
      (profiles || []).forEach(p => { nameMap[p.user_id] = { name: p.full_name, email: p.email }; });
    }

    const dayMap: Record<string, DayAttendance> = {};
    attRecords.forEach(a => {
      if (!dayMap[a.date]) dayMap[a.date] = { present: 0, absent: 0, absentStudents: [] };
      if (a.present) {
        dayMap[a.date].present++;
      } else {
        dayMap[a.date].absent++;
        const info = nameMap[a.student_id];
        if (info) dayMap[a.date].absentStudents.push(info);
      }
    });

    setMonthData(dayMap);
    setLoadingMonth(false);
  }, [batchId, calMonth, calYear, isFutureMonth]);

  useEffect(() => {
    loadMonthData();
    loadDayOffDates();
  }, [loadMonthData, loadDayOffDates]);

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();

  const formatDateKey = (day: number) => {
    const m = String(calMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${calYear}-${m}-${d}`;
  };

  const selectedDayData = selectedDate ? monthData[selectedDate] : null;

  const [cancelDayOffDate, setCancelDayOffDate] = useState<string | null>(null);

  const handleDayClick = (day: number) => {
    const dateKey = formatDateKey(day);
    const d = new Date(calYear, calMonth, day);

    const isDayOff = dayOffDates.has(dateKey);
    const isFuture = dateKey > todayKey;
    const isPastOrToday = dateKey <= todayKey;
    const isToday = dateKey === todayKey;
    const isScheduledDay = isBatchScheduledDay(d);
    const hasData = !!monthData[dateKey];

    // For past/today: always allow viewing if attendance data exists, regardless of schedule.
    // For future: only allow day-off marking on scheduled days.
    // Non-scheduled days with no data and no day-off → block.
    if (!isScheduledDay && !hasData && !isDayOff) return;

    // Clicking a day-off cell (past, today, or future) → offer to cancel if admin
    if (isDayOff && canMarkDayOff) {
      setCancelDayOffDate(dateKey);
      return;
    }

    if (isDayOff && !isFuture) return; // non-admin, off days in past are non-interactive

    if (isToday) {
      if (hasData) setSelectedDate(selectedDate === dateKey ? null : dateKey);
    } else if (isPastOrToday) {
      if (hasData) setSelectedDate(selectedDate === dateKey ? null : dateKey);
    } else if (isFuture && canMarkDayOff && !isDayOff && isScheduledDay) {
      setDayOffDate(dateKey);
    }
  };

  return (
    <Card className="shadow-card border-border/50">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-primary" />
        <span className="font-display font-semibold text-sm">Calendar</span>
        {canMarkDayOff && (
          <span className="ml-auto text-xs text-muted-foreground">Tap future class day for day off</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Month/Year selectors */}
        <div className="flex gap-2">
          <Select value={String(calMonth)} onValueChange={v => { setCalMonth(parseInt(v)); setSelectedDate(null); }}>
            <SelectTrigger className="h-9 flex-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(calYear)} onValueChange={v => { setCalYear(parseInt(v)); setSelectedDate(null); }}>
            <SelectTrigger className="h-9 w-24 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loadingMonth ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <>
            <div>
              {/* Column headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {HEADER_COLS.map(({ label, abbrev }) => {
                  const isScheduled = !hasSchedule || scheduledDays.includes(abbrev);
                  return (
                    <div
                      key={label}
                      className={cn(
                        "text-center text-xs font-medium",
                        isScheduled ? "text-foreground font-semibold" : "text-muted-foreground/40"
                      )}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}

                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const dateKey = formatDateKey(day);
                  const d = new Date(calYear, calMonth, day);
                  const isOffDay = !isBatchScheduledDay(d);
                  const isFutureDay = dateKey > todayKey;
                  const isTodayDay = dateKey === todayKey;
                  const data = monthData[dateKey];
                  const isSelected = selectedDate === dateKey;
                  const hasData = !!data;
                  const pct = hasData ? Math.round((data.present / (data.present + data.absent)) * 100) : null;
                  const isDayOff = dayOffDates.has(dateKey);
                  const isFutureBatchDay = isFutureDay && !isOffDay && canMarkDayOff && !isDayOff;

                  // ── OFF-DAY (non-scheduled weekday) — visible but clearly de-emphasised ──
                  if (isOffDay) {
                    return (
                      <div
                        key={day}
                        className={cn(
                          "aspect-square flex flex-col items-center justify-center text-xs rounded-md border border-transparent",
                          isTodayDay && "ring-2 ring-primary ring-offset-1"
                        )}
                        aria-hidden="true"
                      >
                        <span className="text-muted-foreground/40">{day}</span>
                      </div>
                    );
                  }

                  // ── DAY OFF (announced holiday on scheduled day) ──
                  if (isDayOff) {
                    return canMarkDayOff ? (
                      <button
                        key={day}
                        onClick={() => setCancelDayOffDate(formatDateKey(day))}
                        title="Click to cancel day off"
                        className={cn(
                          "aspect-square flex flex-col items-center justify-center text-[10px] font-medium rounded-md border cursor-pointer transition-all",
                          "bg-warning/8 border-warning/25 text-warning hover:bg-danger/10 hover:border-danger/40 hover:text-danger",
                          isTodayDay && "ring-2 ring-primary ring-offset-1"
                        )}
                      >
                        <span className="font-semibold">{day}</span>
                        <span className="text-[8px] font-bold leading-none mt-0.5">Off</span>
                      </button>
                    ) : (
                      <div
                        key={day}
                        className={cn(
                          "aspect-square flex flex-col items-center justify-center text-[10px] font-medium rounded-md border",
                          "bg-warning/8 border-warning/25 text-warning",
                          isTodayDay && "ring-2 ring-primary ring-offset-1"
                        )}
                      >
                        <span className="font-semibold">{day}</span>
                        <span className="text-[8px] font-bold leading-none mt-0.5 text-warning">Off</span>
                      </div>
                    );
                  }

                  // ── Build style for scheduled active days ──
                  let cellClass = "";
                  let interactive = false;

                  if (isTodayDay) {
                    if (attendanceWindowOpen) {
                      cellClass = "border-primary/50 bg-primary/10 text-primary font-bold cursor-default ring-2 ring-primary ring-offset-1";
                    } else if (hasData) {
                      interactive = true;
                      if (isSelected) {
                        cellClass = "bg-primary text-primary-foreground border-primary shadow-sm cursor-pointer ring-2 ring-primary ring-offset-1";
                      } else if (pct !== null && pct >= 75) {
                        cellClass = "bg-success-light text-success border-success/20 hover:border-success/50 cursor-pointer font-bold ring-2 ring-primary ring-offset-1";
                      } else {
                        cellClass = "bg-danger-light text-danger border-danger/20 hover:border-danger/50 cursor-pointer font-bold ring-2 ring-primary ring-offset-1";
                      }
                    } else {
                      cellClass = "bg-muted/20 border-border/20 text-muted-foreground/60 cursor-default font-semibold ring-2 ring-primary ring-offset-1";
                    }

                  } else if (isFutureDay) {
                    if (isFutureBatchDay) {
                      interactive = true;
                      // Future scheduled days: clearly visible, orange hover for day-off
                      cellClass = "bg-transparent border-border/30 text-foreground/70 hover:bg-warning/10 hover:border-warning/40 hover:text-warning cursor-pointer";
                    } else {
                      cellClass = "bg-transparent border-border/20 text-foreground/70 cursor-default";
                    }
                  } else {
                    // Past day
                    if (!hasData) {
                      cellClass = "bg-muted/20 border-border/10 text-muted-foreground/50 cursor-default";
                    } else if (isSelected) {
                      cellClass = "bg-primary text-primary-foreground border-primary shadow-sm cursor-pointer";
                    } else if (pct !== null && pct >= 75) {
                      interactive = true;
                      cellClass = "bg-success-light text-success border-success/20 hover:border-success/50 cursor-pointer";
                    } else {
                      interactive = true;
                      cellClass = "bg-danger-light text-danger border-danger/20 hover:border-danger/50 cursor-pointer";
                    }
                  }

                  return (
                    <button
                      key={day}
                      onClick={() => handleDayClick(day)}
                      disabled={!interactive && !isSelected}
                      className={cn(
                        "aspect-square flex flex-col items-center justify-center text-xs font-medium rounded-md border transition-all",
                        cellClass
                      )}
                    >
                      <span>{day}</span>
                      {hasData && !isFutureDay && !(isTodayDay && attendanceWindowOpen) && (
                        <span className="text-[9px] opacity-75">{pct}%</span>
                      )}
                      {isFutureBatchDay && (
                        <span className="text-[8px] opacity-50 leading-none">off?</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-3 mt-2 text-xs text-muted-foreground justify-center flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-success-light border border-success/20 inline-block" /> ≥75%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-danger-light border border-danger/20 inline-block" /> &lt;75%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-primary/10 border border-primary/30 inline-block" /> Today</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-warning/10 border border-warning/30 inline-block" /><span className="text-warning/80">Off</span></span>
                {canMarkDayOff && <span className="flex items-center gap-1"><span className="text-muted-foreground/60">off?</span> = tap to mark</span>}
              </div>
            </div>

            {/* Selected date detail panel */}
            {selectedDate && (
              <div className="border border-border/50 rounded-lg overflow-hidden">
                <div className="px-3 py-2.5 bg-muted/30 border-b border-border/40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5 text-primary" />
                    <span className="text-sm font-semibold">
                      {dateKeyToLocalDate(selectedDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {selectedDayData && (
                      <>
                        <Badge className="bg-success-light text-success border-success/20 text-xs">{selectedDayData.present} present</Badge>
                        <Badge className="bg-danger-light text-danger border-danger/20 text-xs">{selectedDayData.absent} absent</Badge>
                      </>
                    )}
                  </div>
                </div>
                {!selectedDayData || selectedDayData.absentStudents.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-success text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="font-medium">Full attendance — no absentees!</span>
                  </div>
                ) : (
                  <div>
                    <div className="px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-danger border-b border-border/30">
                      <XCircle className="w-3.5 h-3.5" />
                      Absentees ({selectedDayData.absentStudents.length})
                    </div>
                    <div className="divide-y divide-border/30 max-h-48 overflow-y-auto">
                      {selectedDayData.absentStudents.map((s, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                          <div className="w-6 h-6 rounded-full bg-danger-light flex items-center justify-center text-danger text-[10px] font-bold flex-shrink-0">
                            {s.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-xs font-medium">{s.name}</p>
                            <p className="text-[10px] text-muted-foreground">{s.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Future Day Off Dialog */}
      {dayOffDate && (
        <FutureDayOffDialog
          open={!!dayOffDate}
          onClose={() => setDayOffDate(null)}
          date={dayOffDate}
          batchId={batchId}
          batchName={batchName}
          instituteCode={instituteCode}
          onDone={() => { setDayOffDate(null); loadMonthData(); loadDayOffDates(); onDayOffChange?.(); }}
        />
      )}

      {/* Cancel / Undo Day Off Dialog */}
      {cancelDayOffDate && (
        <CancelDayOffDialog
          open={!!cancelDayOffDate}
          onClose={() => setCancelDayOffDate(null)}
          date={cancelDayOffDate}
          batchId={batchId}
          batchName={batchName}
          onDone={() => { setCancelDayOffDate(null); loadMonthData(); loadDayOffDates(); onDayOffChange?.(); }}
        />
      )}
    </Card>
  );
}
