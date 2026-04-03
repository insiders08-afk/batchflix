import { useState, useEffect, useCallback } from "react";
import { JS_DAY_ABBREVS } from "@/lib/batchTiming";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Search,
  Users,
  BookOpen,
  Clock,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  UserPlus,
  X,
  CheckCircle2,
  CalendarOff,
  Lock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const courses = ["JEE", "NEET", "Foundation", "CUET", "Other"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12

interface BatchTiming {
  days: string[];
  startHour: number;
  startMinute: number;
  startAmPm: "AM" | "PM";
  endHour: number;
  endMinute: number;
  endAmPm: "AM" | "PM";
}

interface Batch {
  id: string;
  name: string;
  course: string;
  teacher_name: string | null;
  teacher_id: string | null;
  pending_teacher_name: string | null;
  schedule: string | null;
  is_active: boolean;
  institute_code: string;
  studentCount: number;
}

interface Teacher {
  user_id: string;
  full_name: string;
}

interface Student {
  user_id: string;
  full_name: string;
  email: string;
  enrolled?: boolean;
}

function defaultTiming(): BatchTiming {
  return { days: [], startHour: 4, startMinute: 0, startAmPm: "PM", endHour: 5, endMinute: 0, endAmPm: "PM" };
}

function timingToScheduleStr(t: BatchTiming): string {
  return JSON.stringify(t);
}

function parseTiming(schedule: string | null): BatchTiming | null {
  if (!schedule) return null;
  try {
    const p = JSON.parse(schedule);
    if (p.days && p.startHour) return p as BatchTiming;
  } catch {
    /* legacy plain text */
  }
  return null;
}

function formatTimingDisplay(schedule: string | null): string {
  const t = parseTiming(schedule);
  if (!t) return schedule || "";
  const days = t.days.join(", ");
  const fmt = (h: number, m: number, ap: string) => `${h}:${String(m).padStart(2, "0")} ${ap}`;
  return `${days} · ${fmt(t.startHour, t.startMinute, t.startAmPm)} – ${fmt(t.endHour, t.endMinute, t.endAmPm)}`;
}

function calcDuration(t: BatchTiming): string {
  const to24 = (h: number, ap: "AM" | "PM") => (ap === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12);
  const startMins = to24(t.startHour, t.startAmPm) * 60 + t.startMinute;
  const endMins = to24(t.endHour, t.endAmPm) * 60 + t.endMinute;
  const diff = endMins - startMins;
  if (diff <= 0) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h} hr`;
  return `${m} min`;
}

// ---- Time Picker sub-component ----
function TimePicker({
  label,
  hour,
  minute,
  amPm,
  onHour,
  onMinute,
  onAmPm,
}: {
  label: string;
  hour: number;
  minute: number;
  amPm: "AM" | "PM";
  onHour: (v: number) => void;
  onMinute: (v: number) => void;
  onAmPm: (v: "AM" | "PM") => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {/* Hour */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => onHour(hour === 12 ? 1 : hour + 1)}
            className="text-muted-foreground hover:text-foreground text-xs px-1"
          >
            ▲
          </button>
          <span className="font-mono text-base w-7 text-center font-semibold">{String(hour).padStart(2, "0")}</span>
          <button
            type="button"
            onClick={() => onHour(hour === 1 ? 12 : hour - 1)}
            className="text-muted-foreground hover:text-foreground text-xs px-1"
          >
            ▼
          </button>
        </div>
        <span className="text-muted-foreground font-bold">:</span>
        {/* Minute */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => onMinute(minute === 55 ? 0 : minute + 5)}
            className="text-muted-foreground hover:text-foreground text-xs px-1"
          >
            ▲
          </button>
          <span className="font-mono text-base w-7 text-center font-semibold">{String(minute).padStart(2, "0")}</span>
          <button
            type="button"
            onClick={() => onMinute(minute === 0 ? 55 : minute - 5)}
            className="text-muted-foreground hover:text-foreground text-xs px-1"
          >
            ▼
          </button>
        </div>
        {/* AM/PM */}
        <div className="flex flex-col gap-0.5 ml-1">
          {(["AM", "PM"] as const).map((ap) => (
            <button
              key={ap}
              type="button"
              onClick={() => onAmPm(ap)}
              className={cn(
                "text-[11px] font-bold px-1.5 py-0.5 rounded",
                amPm === ap ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {ap}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Batch Form (Create or Edit) ----
function BatchFormDialog({
  open,
  onOpenChange,
  teachers,
  instituteCode,
  editBatch,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teachers: Teacher[];
  instituteCode: string;
  editBatch: Batch | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [timing, setTiming] = useState<BatchTiming>(defaultTiming());

  // Populate form when editing
  useEffect(() => {
    if (editBatch) {
      setName(editBatch.name);
      setCourse(editBatch.course);
      setTeacherId(editBatch.teacher_id || "");
      setTeacherName(editBatch.teacher_name || "");
      const parsed = parseTiming(editBatch.schedule);
      setTiming(parsed || defaultTiming());
    } else {
      setName("");
      setCourse("");
      setTeacherId("");
      setTeacherName("");
      setTiming(defaultTiming());
    }
  }, [editBatch, open]);

  const toggleDay = (d: string) => {
    setTiming((prev) => ({
      ...prev,
      days: prev.days.includes(d) ? prev.days.filter((x) => x !== d) : [...prev.days, d],
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Batch name is required", variant: "destructive" });
      return;
    }
    if (!course) {
      toast({ title: "Course is required", variant: "destructive" });
      return;
    }
    if (timing.days.length === 0) {
      toast({ title: "Select at least one class day", variant: "destructive" });
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const scheduleStr = timingToScheduleStr(timing);

    if (editBatch) {
      // Edit existing batch
      const updates: Record<string, unknown> = { name, course, schedule: scheduleStr };

      const { error } = await supabase.from("batches").update(updates).eq("id", editBatch.id);
      if (error) {
        toast({ title: "Error updating batch", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      // If teacher changed, send new request
      if (teacherId && teacherId !== editBatch.teacher_id) {
        // UX-03 fix: Confirm teacher replacement before proceeding
        const currentTeacher = editBatch.teacher_name || "the current teacher";
        const confirmed = window.confirm(
          `This will replace ${currentTeacher} with ${teacherName} as the batch teacher.\n\nThe new teacher will need to accept the assignment request. Continue?`,
        );
        if (!confirmed) {
          setSaving(false);
          return;
        }

        await supabase.from("batch_teacher_requests").insert({
          batch_id: editBatch.id,
          teacher_id: teacherId,
          institute_code: instituteCode,
          requested_by: user!.id,
          batch_name: name,
          course,
          status: "pending",
        });
        // Fix #15: Store pending teacher name so admin can see "awaiting acceptance" badge
        await supabase.from("batches").update({ pending_teacher_name: teacherName }).eq("id", editBatch.id);
        toast({ title: "Batch updated!", description: `New assignment request sent to ${teacherName}.` });
      } else {
        toast({ title: "Batch updated successfully!" });
      }
    } else {
      // Create new batch
      const { data: batchData, error } = await supabase
        .from("batches")
        .insert({
          name,
          course,
          schedule: scheduleStr,
          teacher_id: null,
          teacher_name: null,
          institute_code: instituteCode,
          is_active: true,
        })
        .select("id")
        .single();

      if (error) {
        toast({ title: "Error creating batch", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      // Fix #16: Only send teacher request if a teacher was selected
      if (batchData && user && teacherId) {
        await supabase.from("batch_teacher_requests").insert({
          batch_id: batchData.id,
          teacher_id: teacherId,
          institute_code: instituteCode,
          requested_by: user.id,
          batch_name: name,
          course,
          status: "pending",
        });
        // Fix #15: Store pending teacher name for badge visibility
        await supabase.from("batches").update({ pending_teacher_name: teacherName }).eq("id", batchData.id);
        toast({
          title: "Batch created!",
          description: `Assignment request sent to ${teacherName}. They must accept to be linked.`,
        });
      } else {
        toast({
          title: "Batch created!",
          description: teacherId ? "Assignment request sent." : "No teacher assigned yet. You can assign one later.",
        });
      }
    }

    onOpenChange(false);
    onSaved();
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{editBatch ? "Edit Batch" : "Create New Batch"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>
              Batch Name <span className="text-danger">*</span>
            </Label>
            <Input placeholder="e.g. JEE Advanced 2025 – A" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Course */}
          <div className="space-y-1.5">
            <Label>
              Course <span className="text-danger">*</span>
            </Label>
            <Select value={course} onValueChange={setCourse}>
              <SelectTrigger>
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Teacher (required) */}
          <div className="space-y-1.5">
            <Label>
              Assigned Teacher <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Select
              value={teacherId}
              onValueChange={(v) => {
                const t = teachers.find((t) => t.user_id === v);
                setTeacherId(v);
                setTeacherName(t?.full_name || "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={teachers.length === 0 ? "No approved teachers yet" : "Select teacher"} />
              </SelectTrigger>
              <SelectContent>
                {teachers.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No approved teachers yet
                  </SelectItem>
                ) : (
                  teachers.map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {t.full_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Weekly Days */}
          <div className="space-y-2">
            <Label>
              Class Days <span className="text-danger">*</span>
            </Label>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    timing.days.includes(d)
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/50 text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Timing */}
          <div className="space-y-2">
            <Label>
              Class Timing <span className="text-danger">*</span>
            </Label>
            <div className="flex items-start gap-6 p-3 bg-muted/30 rounded-lg border border-border/40">
              <TimePicker
                label="Start"
                hour={timing.startHour}
                minute={timing.startMinute}
                amPm={timing.startAmPm}
                onHour={(v) => setTiming((p) => ({ ...p, startHour: v }))}
                onMinute={(v) => setTiming((p) => ({ ...p, startMinute: v }))}
                onAmPm={(v) => setTiming((p) => ({ ...p, startAmPm: v }))}
              />
              <div className="text-muted-foreground text-sm font-bold mt-5">to</div>
              <TimePicker
                label="End"
                hour={timing.endHour}
                minute={timing.endMinute}
                amPm={timing.endAmPm}
                onHour={(v) => setTiming((p) => ({ ...p, endHour: v }))}
                onMinute={(v) => setTiming((p) => ({ ...p, endMinute: v }))}
                onAmPm={(v) => setTiming((p) => ({ ...p, endAmPm: v }))}
              />
            </div>
          </div>

          <Button
            className="w-full gradient-hero text-white border-0 shadow-primary hover:opacity-90"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {editBatch ? "Updating..." : "Creating..."}
              </>
            ) : editBatch ? (
              "Update Batch"
            ) : (
              "Create Batch"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Day Off Dialog ----
function DayOffDialog({ batch, instituteCode, onDone }: { batch: Batch; instituteCode: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notify, setNotify] = useState(true);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  // Only the human-readable body — the day_off_date tag is always appended on save, never editable
  const [messageBody, setMessageBody] = useState("");
  const [alreadyMarked, setAlreadyMarked] = useState(false);

  // Convert a local date to ISO key YYYY-MM-DD
  function toISOKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Find the next scheduled class date for this batch.
  // Includes TODAY if: today is a scheduled day AND the class start time hasn't passed yet.
  function getNextClassDate(): Date {
    const t = parseTiming(batch.schedule);
    if (!t || !t.days || t.days.length === 0) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    }

    const now = new Date();
    const todayAbbrev = JS_DAY_ABBREVS[now.getDay()];

    // Check if today is a scheduled day and class hasn't started yet
    if (t.days.includes(todayAbbrev)) {
      const to24 = (h: number, ap: "AM" | "PM") => (ap === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12);
      const startH24 = to24(t.startHour, t.startAmPm);
      const startMins = startH24 * 60 + t.startMinute;
      const nowMins = now.getHours() * 60 + now.getMinutes();
      if (nowMins < startMins) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
    }

    // Otherwise find next scheduled day starting from tomorrow
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + 1);
    for (let i = 0; i < 14; i++) {
      const abbrev = JS_DAY_ABBREVS[candidate.getDay()];
      if (t.days.includes(abbrev)) {
        return new Date(candidate);
      }
      candidate.setDate(candidate.getDate() + 1);
    }
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }

  const nextClassDate = getNextClassDate();
  const nextClassDateKey = toISOKey(nextClassDate);
  const lockedTag = `day_off_date:${nextClassDateKey}`;
  const nextClassStr = nextClassDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const handleOpen = async () => {
    setAlreadyMarked(false);
    setChecking(true);
    const { data } = await supabase
      .from("announcements")
      .select("id")
      .eq("batch_id", batch.id)
      .eq("type", "day_off")
      .ilike("content", `%day_off_date:${nextClassDateKey}%`);

    const isMarked = (data?.length ?? 0) > 0;
    setAlreadyMarked(isMarked);
    setChecking(false);

    if (!isMarked) {
      setAnnouncementTitle(`No Class — ${batch.name} — ${nextClassStr}`);
      // Only set the human-readable body — tag is appended on save
      setMessageBody(
        `Dear students, there will be no class for ${batch.name} on ${nextClassStr}. Please plan accordingly.`,
      );
    }
    setOpen(true);
  };

  const handleConfirm = async () => {
    setSending(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user!.id).single();

      if (notify) {
        // Always reconstruct full content with locked tag — user cannot remove or alter it
        const fullContent = `${messageBody.trim()}\n\n${lockedTag}`;
        await supabase.from("announcements").insert({
          title: announcementTitle,
          content: fullContent,
          batch_id: batch.id,
          institute_code: instituteCode,
          posted_by: user!.id,
          posted_by_name: profile?.full_name || "Admin",
          type: "day_off",
          notify_push: true,
        });
      }

      toast({
        title: "✅ Day Off marked!",
        description: `${batch.name} is off on ${nextClassStr}. ${notify ? "Announcement sent to students." : ""}`,
      });
      setOpen(false);
      onDone();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5 border-border/50 hover:border-warning/50 hover:text-warning text-muted-foreground flex-1"
        onClick={handleOpen}
        disabled={checking}
        title="Mark a future date as day off for this batch"
      >
        {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarOff className="w-3 h-3" />} Day Off
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <CalendarOff className="w-5 h-5 text-warning" /> Mark Day Off
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {alreadyMarked ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg border border-warning/30 bg-warning/8">
                  <CalendarOff className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-warning">Already marked as Day Off</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-foreground">{nextClassStr}</span> is already marked as a day off
                      for <span className="font-medium text-foreground">{batch.name}</span>.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      To mark additional days off, go to the <span className="font-medium">Attendance</span> tab and tap
                      a future class date in the calendar.
                    </p>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  You're marking <span className="font-semibold text-foreground">{batch.name}</span> as off for{" "}
                  <span className="font-semibold text-foreground">{nextClassStr}</span>{" "}
                  <span className="text-xs">(next scheduled class)</span>.
                </p>

                <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                  <input
                    type="checkbox"
                    id="notify-dayoff"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                    className="mt-0.5 accent-primary"
                  />
                  <label htmlFor="notify-dayoff" className="text-sm cursor-pointer">
                    <span className="font-medium">Send push notification & announcement to students</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Students in this batch will be notified immediately
                    </p>
                  </label>
                </div>

                {notify && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Announcement Title</Label>
                      <Input
                        value={announcementTitle}
                        onChange={(e) => setAnnouncementTitle(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Message</Label>
                      <textarea
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        rows={3}
                        className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      {/* Locked system tag — cannot be edited or deleted by the user */}
                      <div
                        className="flex items-center gap-1.5 mt-1.5 px-2 py-1.5 rounded-md border border-dashed border-warning/50 bg-warning/5 select-none"
                        title="System tag — automatically appended. Cannot be edited."
                      >
                        <Lock className="w-3 h-3 text-warning flex-shrink-0" />
                        <span className="text-xs font-mono text-warning font-medium">{lockedTag}</span>
                        <span className="text-xs text-muted-foreground ml-1">— system tag (read-only)</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-warning text-white hover:bg-warning/90 border-0"
                    onClick={handleConfirm}
                    disabled={sending}
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        Confirming...
                      </>
                    ) : (
                      "Confirm Day Off"
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Enroll Students Dialog ----
function EnrollStudentsDialog({
  batch,
  instituteCode,
  onDone,
}: {
  batch: Batch;
  instituteCode: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);

  const loadStudents = async () => {
    setLoading(true);
    const { data: allStudents } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("institute_code", instituteCode)
      .eq("role", "student")
      .in("status", ["approved", "active"]);

    const { data: enrolled } = await supabase.from("students_batches").select("student_id").eq("batch_id", batch.id);

    const enrolledIds = new Set((enrolled || []).map((e) => e.student_id));
    setStudents((allStudents || []).map((s) => ({ ...s, enrolled: enrolledIds.has(s.user_id) })));
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadStudents();
  }, [open]);

  const handleEnroll = async (student: Student) => {
    setEnrolling(student.user_id);
    const { error } = await supabase.from("students_batches").insert({
      batch_id: batch.id,
      student_id: student.user_id,
      institute_code: instituteCode,
    });
    if (error) {
      toast({ title: "Error enrolling student", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${student.full_name} enrolled in ${batch.name}!` });
      setStudents((prev) => prev.map((s) => (s.user_id === student.user_id ? { ...s, enrolled: true } : s)));
      onDone();
    }
    setEnrolling(null);
  };

  const handleUnenroll = async (student: Student) => {
    setEnrolling(student.user_id);
    const { error } = await supabase
      .from("students_batches")
      .delete()
      .eq("batch_id", batch.id)
      .eq("student_id", student.user_id);
    if (error) {
      toast({ title: "Error removing student", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${student.full_name} removed from ${batch.name}` });
      setStudents((prev) => prev.map((s) => (s.user_id === student.user_id ? { ...s, enrolled: false } : s)));
      onDone();
    }
    setEnrolling(null);
  };

  const filtered = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()),
  );
  const enrolled = students.filter((s) => s.enrolled);
  const notEnrolled = filtered.filter((s) => !s.enrolled);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full h-8 text-xs gap-1.5 border-border/50 hover:border-primary/30 hover:text-primary"
        >
          <UserPlus className="w-3 h-3" /> Enroll Students
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">Enroll Students — {batch.name}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 px-1">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{enrolled.length}</span> student
            {enrolled.length !== 1 ? "s" : ""} enrolled
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No approved students yet</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-1 pr-1">
            {enrolled.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-success uppercase tracking-wide mb-1 px-1">Enrolled</p>
                {enrolled
                  .filter(
                    (s) =>
                      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
                      s.email.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((s) => (
                    <div
                      key={s.user_id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-success/5 border border-success/15 mb-1"
                    >
                      <div>
                        <p className="text-sm font-medium">{s.full_name}</p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-danger"
                        disabled={enrolling === s.user_id}
                        onClick={() => handleUnenroll(s)}
                      >
                        {enrolling === s.user_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  ))}
              </div>
            )}
            {notEnrolled.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-1">
                  Not Enrolled
                </p>
                {notEnrolled.map((s) => (
                  <div
                    key={s.user_id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border/50 transition-all mb-1"
                  >
                    <div>
                      <p className="text-sm font-medium">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 gradient-hero text-white border-0 hover:opacity-90"
                      disabled={enrolling === s.user_id}
                      onClick={() => handleEnroll(s)}
                    >
                      {enrolling === s.user_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <UserPlus className="w-3 h-3" />
                      )}
                      Enroll
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {filtered.length === 0 && search && (
              <p className="text-center text-sm text-muted-foreground py-6">No students match "{search}"</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const BATCHES_PAGE_SIZE = 20;

// ---- Main Page ----
export default function AdminBatches() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [batchPage, setBatchPage] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [instituteCode, setInstituteCode] = useState("");
  const [instituteCodeRef, setInstituteCodeRef] = useState("");

  const fetchBatches = async (code: string, pageNum = 0, reset = true) => {
    if (reset) setLoading(true); else setLoadingMore(true);

    const from = pageNum * BATCHES_PAGE_SIZE;
    const to = from + BATCHES_PAGE_SIZE - 1;

    const { data, count } = await supabase
      .from("batches")
      .select("id, name, course, teacher_name, teacher_id, pending_teacher_name, schedule, is_active, institute_code", { count: "exact" })
      .eq("institute_code", code)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!data) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    // Aggregate student counts in one query instead of N+1
    const batchIds = data.map((b) => b.id);
    let countMap: Record<string, number> = {};
    if (batchIds.length > 0) {
      const { data: sb } = await supabase.from("students_batches").select("batch_id").in("batch_id", batchIds);
      (sb || []).forEach((e) => {
        countMap[e.batch_id] = (countMap[e.batch_id] || 0) + 1;
      });
    }
    const enriched = data.map((b) => ({ ...b, studentCount: countMap[b.id] || 0 }));

    if (reset) {
      setBatches(enriched);
    } else {
      setBatches((prev) => [...prev, ...enriched]);
    }

    const total = count ?? 0;
    setBatchTotal(total);
    setHasMore(from + BATCHES_PAGE_SIZE < total);
    setBatchPage(pageNum);
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data: code } = await supabase.rpc("get_my_institute_code");
      if (!code) {
        setLoading(false);
        return;
      }
      setInstituteCode(code);
      setInstituteCodeRef(code);
      const { data: teacherData } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("institute_code", code)
        .eq("role", "teacher")
        .in("status", ["approved", "active"]);
      setTeachers(teacherData || []);
      await fetchBatches(code, 0, true);
    };
    init();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this batch? This cannot be undone.")) return;
    const { error } = await supabase.from("batches").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting batch", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Batch deleted" });
      setBatches((prev) => prev.filter((b) => b.id !== id));
    }
  };

  const filtered = batches.filter(
    (b) => b.name.toLowerCase().includes(search.toLowerCase()) || b.course.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardLayout title="Batches">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search batches..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Button
            className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4" /> Create Batch
          </Button>
        </div>

        {/* Create/Edit Dialog */}
        <BatchFormDialog
          open={createOpen || !!editBatch}
          onOpenChange={(v) => {
            if (!v) {
              setCreateOpen(false);
              setEditBatch(null);
            }
          }}
          teachers={teachers}
          instituteCode={instituteCode}
          editBatch={editBatch}
          onSaved={() => fetchBatches(instituteCodeRef, 0, true)}
        />

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{batches.length === 0 ? "No batches yet" : "No batches match your search"}</p>
            {batches.length === 0 && <p className="text-sm mt-1">Create your first batch to get started</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((batch, i) => (
              <motion.div
                key={batch.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card className="p-5 shadow-card border-border/50 hover:shadow-lg transition-all hover:-translate-y-0.5 h-full flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {batch.name.slice(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-display font-semibold text-sm leading-tight">{batch.name}</h3>
                        <Badge variant="secondary" className="text-xs mt-0.5">
                          {batch.course}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 hover:text-primary"
                        onClick={() => setEditBatch(batch)}
                        title="Edit batch"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(batch.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4 flex-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                      {batch.teacher_name ? (
                        <span className="truncate">{batch.teacher_name}</span>
                      ) : batch.pending_teacher_name ? (
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <Badge className="text-[10px] px-1.5 py-0 bg-accent-light text-accent border-accent/20 font-semibold">
                            Pending
                          </Badge>
                          <span className="truncate text-xs">{batch.pending_teacher_name}</span>
                        </span>
                      ) : (
                        <span className="truncate">No teacher assigned</span>
                      )}
                    </div>
                    {batch.schedule && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate text-xs">{formatTimingDisplay(batch.schedule)}</span>
                        {(() => {
                          const t = parseTiming(batch.schedule);
                          return t ? (
                            <span className="text-xs text-muted-foreground/60 flex-shrink-0">· {calcDuration(t)}</span>
                          ) : null;
                        })()}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        {batch.studentCount} student{batch.studentCount !== 1 ? "s" : ""} enrolled
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <EnrollStudentsDialog
                      batch={batch}
                      instituteCode={instituteCode}
                      onDone={() => fetchBatches(instituteCodeRef, 0, true)}
                    />
                    <div className="flex gap-2">
                      <DayOffDialog
                        batch={batch}
                        instituteCode={instituteCode}
                        onDone={() => fetchBatches(instituteCodeRef, 0, true)}
                      />
                      <Link to={`/batch/${batch.id}`} className="flex-1">
                        <Button
                          variant="outline"
                          className="w-full h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary-light"
                        >
                          Open Workspace <ExternalLink className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Load More Batches */}
        {hasMore && !loading && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchBatches(instituteCodeRef, batchPage + 1, false)}
              disabled={loadingMore}
              className="gap-2 h-9 px-6"
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loadingMore ? "Loading..." : `Load More (${batchTotal - batches.length} remaining)`}
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
