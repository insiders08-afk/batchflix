import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Plus,
  IndianRupee,
  Loader2,
  Layers,
  Bell,
  ChevronDown,
  ChevronUp,
  FileText,
  CalendarDays,
  Users,
  Trash2,
  Download,
  ListOrdered,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeePlan {
  id: string;
  student_id: string;
  batch_id: string | null;
  amount: number;
  annual_amount: number | null;
  payment_frequency: string | null;
  due_date: string | null;
  paid: boolean;
  paid_date: string | null;
  description: string | null;
  cycle_day: number | null;
  start_month: string | null;
  paid_cycles_count: number;
  total_paid_amount: number;
  // enriched
  student_name?: string;
  batch_name?: string;
}

interface GroupedStudent {
  student_id: string;
  student_name: string;
  plans: FeePlan[];
}

type Profile = { user_id: string; full_name: string };
type Batch = { id: string; name: string; course: string };
type EnrolledStudent = { student_id: string; full_name: string };

interface CycleEntry {
  cycleIndex: number; // 1-based
  startDate: Date;
  endDate: Date;
  dueDate: Date;
  paid: boolean;
  paidDate: string | null;
  status: "paid" | "pending" | "overdue" | "upcoming";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Monthly", divisor: 12, months: 1 },
  { value: "quarterly", label: "Quarterly", divisor: 4, months: 3 },
  { value: "half_yearly", label: "Half-Yearly", divisor: 2, months: 6 },
  { value: "annual", label: "Annual", divisor: 1, months: 12 },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function calcInstallment(annual: number, freq: string): number {
  const opt = FREQUENCY_OPTIONS.find((o) => o.value === freq);
  return opt ? Math.round(annual / opt.divisor) : annual;
}

/**
 * Build a list of N cycles from plan start_month + cycle_day.
 * Each cycle: startDate = cycleDay of month M, endDate = cycleDay-1 of month M+freq.
 * Paid status is determined by paid_cycles_count (cycles 1..paid_cycles_count are paid).
 * The paid_date is stored on the plan (last paid date).
 */
function buildCycles(plan: FeePlan, count = 12): CycleEntry[] {
  if (!plan.cycle_day || !plan.start_month) return [];
  const freq = FREQUENCY_OPTIONS.find((o) => o.value === (plan.payment_frequency || "monthly"));
  const freqMonths = freq?.months ?? 1;
  const [sy, sm] = plan.start_month.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cycles: CycleEntry[] = [];
  for (let i = 0; i < count; i++) {
    const dueDate = new Date(sy, sm - 1 + i * freqMonths, plan.cycle_day);
    const endDate = new Date(sy, sm - 1 + (i + 1) * freqMonths, plan.cycle_day - 1);
    const startDate = i === 0 ? dueDate : new Date(sy, sm - 1 + i * freqMonths, plan.cycle_day);

    const cycleNumber = i + 1; // 1-based
    const isPaidCycle = cycleNumber <= (plan.paid_cycles_count ?? 0);

    let status: CycleEntry["status"];
    if (isPaidCycle) {
      status = "paid";
    } else if (dueDate > today) {
      // Upcoming: due date is in the future
      status = "upcoming";
    } else {
      const overdueCutoff = new Date(dueDate);
      overdueCutoff.setDate(overdueCutoff.getDate() + 7);
      status = today > overdueCutoff ? "overdue" : "pending";
    }

    const paidDate = isPaidCycle && cycleNumber === (plan.paid_cycles_count ?? 0) ? plan.paid_date : null;

    cycles.push({ cycleIndex: cycleNumber, startDate, endDate, dueDate, paid: isPaidCycle, paidDate, status });
  }
  return cycles;
}

/**
 * Get current active cycle due date.
 * Current cycle = cycle at index paid_cycles_count (0-indexed).
 */
function getCurrentDueDate(plan: FeePlan): Date | null {
  if (!plan.cycle_day || !plan.start_month) {
    return plan.due_date ? new Date(plan.due_date) : null;
  }
  const freq = FREQUENCY_OPTIONS.find((o) => o.value === (plan.payment_frequency || "monthly"));
  const freqMonths = freq?.months ?? 1;
  const [sy, sm] = plan.start_month.split("-").map(Number);
  const cycleIndex = plan.paid_cycles_count ?? 0;
  return new Date(sy, sm - 1 + cycleIndex * freqMonths, plan.cycle_day);
}

/**
 * Fee status for the CURRENT cycle.
 * upcoming  = due date is in the future (before cycle day)
 * pending   = on/within 7 days after due date
 * overdue   = more than 7 days after due date
 * paid      = plan.paid === true (current cycle marked paid)
 */
function getFeeStatus(plan: FeePlan): "paid" | "pending" | "overdue" | "upcoming" {
  if (plan.paid) return "paid";

  const dueDate = getCurrentDueDate(plan);
  if (!dueDate) return "pending";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Before the due date → Upcoming
  if (today < dueDate) return "upcoming";

  // Within 7 days of due date → Pending
  const overdueCutoff = new Date(dueDate);
  overdueCutoff.setDate(overdueCutoff.getDate() + 7);
  if (today <= overdueCutoff) return "pending";

  return "overdue";
}

function getDaysOverdue(plan: FeePlan): number {
  const dueDate = getCurrentDueDate(plan);
  if (!dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueCutoff = new Date(dueDate);
  overdueCutoff.setDate(overdueCutoff.getDate() + 7);
  const diff = today.getTime() - overdueCutoff.getTime();
  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CalendarClock = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
    <path d="M16 2v4M8 2v4M3 10h5" />
    <circle cx="17.5" cy="17.5" r="4.5" />
    <path d="M17.5 15.5v2l1.5 1" />
  </svg>
);

const STATUS_CONFIG = {
  paid: { label: "Paid", color: "bg-success-light text-success border-success/20", icon: CheckCircle2 },
  pending: { label: "Pending", color: "bg-accent-light text-accent border-accent/20", icon: Clock },
  overdue: { label: "Overdue", color: "bg-danger-light text-danger border-danger/20", icon: XCircle },
  upcoming: { label: "Upcoming", color: "bg-muted text-muted-foreground border-border/40", icon: CalendarClock },
};

// ─── Cycle Structure Modal ────────────────────────────────────────────────────

function CycleStructureModal({
  plan,
  onClose,
  onMarkPaid,
}: {
  plan: FeePlan;
  onClose: () => void;
  onMarkPaid: (cycleIndex: number) => void;
}) {
  const cycles = buildCycles(plan, 12);
  const freq = FREQUENCY_OPTIONS.find((o) => o.value === (plan.payment_frequency || "monthly"));
  const totalCycles = freq ? Math.round(12 / freq.months) : 12;
  const [markingCycle, setMarkingCycle] = useState<number | null>(null);

  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const cycleBg: Record<CycleEntry["status"], string> = {
    paid: "bg-success-light border-success/20",
    pending: "bg-accent-light border-accent/20",
    overdue: "bg-danger-light border-danger/20",
    upcoming: "bg-muted/50 border-border/40",
  };
  const cycleText: Record<CycleEntry["status"], string> = {
    paid: "text-success",
    pending: "text-accent",
    overdue: "text-danger",
    upcoming: "text-muted-foreground",
  };
  const cycleStatusLabel: Record<CycleEntry["status"], string> = {
    paid: "Paid",
    pending: "Pending",
    overdue: "Overdue",
    upcoming: "Upcoming",
  };

  const handleAdvancePay = async (c: CycleEntry) => {
    setMarkingCycle(c.cycleIndex);
    await onMarkPaid(c.cycleIndex);
    setMarkingCycle(null);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-primary" />
            Cycle Structure
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Header info */}
          <div className="gradient-hero rounded-xl p-3 text-white">
            <p className="text-white/70 text-xs">Student</p>
            <p className="font-display font-bold text-sm">{plan.student_name}</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-white/80 text-xs">{plan.batch_name}</p>
              <p className="text-white/90 text-xs font-medium">
                ₹{Number(plan.amount).toLocaleString("en-IN")} / {freq?.label || "cycle"}
              </p>
            </div>
          </div>

          {/* Progress summary */}
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <div className="flex-1 text-center">
              <p className="text-lg font-bold text-success">{plan.paid_cycles_count}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-lg font-bold">{Math.max(0, totalCycles - plan.paid_cycles_count)}</p>
              <p className="text-xs text-muted-foreground">Remaining</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-lg font-bold text-primary">
                ₹{Number(plan.total_paid_amount).toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-muted-foreground">Collected</p>
            </div>
          </div>

          {/* Advance pay hint */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-xs text-primary">
            💡 Admin can mark upcoming cycles as paid in advance (e.g. full-year payment).
          </div>

          {/* Cycle list */}
          <div className="space-y-2">
            {cycles.slice(0, totalCycles).map((c) => (
              <div key={c.cycleIndex} className={`rounded-lg border p-3 ${cycleBg[c.status]}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${c.status === "paid" ? "bg-success text-white" : c.status === "overdue" ? "bg-danger text-white" : c.status === "pending" ? "bg-accent text-white" : "bg-muted-foreground/20 text-muted-foreground"}`}
                    >
                      {c.cycleIndex}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {fmt(c.startDate)} → {fmt(c.endDate)}
                      </p>
                      <p className="text-xs text-muted-foreground">Due: {fmt(c.dueDate)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-xs font-bold ${cycleText[c.status]}`}>{cycleStatusLabel[c.status]}</p>
                      {c.paid && c.paidDate && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(c.paidDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                      )}
                      {c.paid && !c.paidDate && <p className="text-xs text-success">✓</p>}
                    </div>
                    {/* Mark Paid button: for pending, overdue, AND upcoming (advance payment) */}
                    {!c.paid && (c.status === "pending" || c.status === "overdue" || c.status === "upcoming") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs gap-1 border-success/40 text-success hover:bg-success-light"
                        disabled={markingCycle === c.cycleIndex}
                        onClick={() => handleAdvancePay(c)}
                      >
                        {markingCycle === c.cycleIndex ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {c.status === "upcoming" ? "Pre-Pay" : "Paid"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-center text-muted-foreground pb-1">
            Showing {Math.min(totalCycles, cycles.length)} cycles · Managed by admin
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fee Structure Modal ──────────────────────────────────────────────────────

function buildFeeReport(plan: FeePlan): string {
  const freq = FREQUENCY_OPTIONS.find((o) => o.value === (plan.payment_frequency || "monthly"));
  const startLabel = plan.start_month
    ? (() => {
        const [y, m] = plan.start_month!.split("-").map(Number);
        return `${plan.cycle_day}${ordinal(plan.cycle_day!)} ${MONTHS[m - 1]} ${y}`;
      })()
    : "—";
  const status = getFeeStatus(plan);
  const dueDate = getCurrentDueDate(plan);

  const lines = [
    "═══════════════════════════════════════",
    "        FEE STRUCTURE REPORT",
    "═══════════════════════════════════════",
    `Student      : ${plan.student_name}`,
    `Batch        : ${plan.batch_name || "—"}`,
    "───────────────────────────────────────",
    `Annual Pkg   : ₹${Number(plan.annual_amount || 0).toLocaleString("en-IN")}`,
    `${(freq?.label || "Installment").padEnd(13)}: ₹${Number(plan.amount).toLocaleString("en-IN")}`,
    `Frequency    : ${freq?.label || "—"}`,
    "───────────────────────────────────────",
    `Cycle Day    : ${plan.cycle_day ? `${plan.cycle_day}${ordinal(plan.cycle_day)} of every ${freq?.months === 1 ? "month" : `${freq?.months} months`}` : "—"}`,
    `Started From : ${startLabel}`,
    "───────────────────────────────────────",
    `Cycles Paid  : ${plan.paid_cycles_count}`,
    `Total Paid   : ₹${Number(plan.total_paid_amount).toLocaleString("en-IN")}`,
    `Status       : ${status.toUpperCase()}`,
    ...(dueDate
      ? [`Due Date     : ${dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`]
      : []),
    ...(plan.paid_date
      ? [
          `Last Paid On : ${new Date(plan.paid_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`,
        ]
      : []),
    "═══════════════════════════════════════",
    `Generated on : ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
  ];
  return lines.join("\n");
}

function downloadFeeReport(plan: FeePlan) {
  const content = buildFeeReport(plan);
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fee-report_${(plan.student_name || "student").replace(/\s+/g, "_")}_${plan.batch_name || "batch"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function FeeStructureModal({
  plan,
  onClose,
  onDeleted,
}: {
  plan: FeePlan;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const freq = FREQUENCY_OPTIONS.find((o) => o.value === (plan.payment_frequency || "monthly"));
  const status = getFeeStatus(plan);
  const dueDate = getCurrentDueDate(plan);
  const daysOverdue = getDaysOverdue(plan);
  const st = STATUS_CONFIG[status];
  const StatusIcon = st.icon;

  const startLabel = plan.start_month
    ? (() => {
        const [y, m] = plan.start_month.split("-").map(Number);
        return `${plan.cycle_day}${ordinal(plan.cycle_day!)} ${MONTHS[m - 1]} ${y}`;
      })()
    : "—";

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("fees").delete().eq("id", plan.id);
      if (error) throw error;
      toast({ title: "Fee plan deleted", description: `Fee structure for ${plan.student_name} removed.` });
      onDeleted(plan.id);
      onClose();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (showDeleteConfirm) {
    return (
      <Dialog open onOpenChange={() => setShowDeleteConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-danger flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete Fee Structure?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-danger-light border border-danger/20 p-3 text-sm">
              <p className="font-semibold text-danger mb-1">This action is permanent.</p>
              <p className="text-muted-foreground">
                All fee history for <strong>{plan.student_name}</strong> under <strong>{plan.batch_name}</strong> will
                be deleted and cannot be recovered.
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium">Fee summary</p>
              <p className="text-muted-foreground">
                Annual: ₹{Number(plan.annual_amount || 0).toLocaleString("en-IN")} · {freq?.label} ₹
                {Number(plan.amount).toLocaleString("en-IN")}
              </p>
              <p className="text-muted-foreground">
                {plan.paid_cycles_count} cycles paid · ₹{Number(plan.total_paid_amount).toLocaleString("en-IN")} total
                collected
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/5"
              onClick={() => downloadFeeReport(plan)}
            >
              <Download className="w-4 h-4" /> Download Fee Report Before Deleting
            </Button>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1 gap-1.5" disabled={deleting} onClick={handleDelete}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Yes, Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Fee Structure</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="gradient-hero rounded-xl p-4 text-white">
            <p className="text-white/70 text-xs">Student</p>
            <p className="font-display font-bold text-base">{plan.student_name}</p>
            <p className="text-white/80 text-sm mt-0.5">{plan.batch_name || "—"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">Annual Package</p>
              <p className="font-display font-bold text-lg">
                {plan.annual_amount ? `₹${Number(plan.annual_amount).toLocaleString("en-IN")}` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">{freq?.label || "Installment"}</p>
              <p className="font-display font-bold text-lg">₹{Number(plan.amount).toLocaleString("en-IN")}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/50 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cycle Date</span>
              <span className="font-medium">
                {plan.cycle_day
                  ? `${plan.cycle_day}${ordinal(plan.cycle_day)} of every ${freq?.months === 1 ? "month" : `${freq?.months} months`}`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span className="font-medium">{startLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cycles Paid</span>
              <span className="font-medium text-success">
                {plan.paid_cycles_count} cycle{plan.paid_cycles_count !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-bold text-success">₹{Number(plan.total_paid_amount).toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div
            className={`rounded-lg p-3 border ${status === "paid" ? "bg-success-light border-success/20" : status === "overdue" ? "bg-danger-light border-danger/20" : "bg-accent-light border-accent/20"}`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Cycle</p>
              <Badge className={`text-xs gap-1 ${st.color}`}>
                <StatusIcon className="w-3 h-3" /> {st.label}
              </Badge>
            </div>
            {dueDate && (
              <p className="text-sm font-medium">
                Due: {dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            {status === "overdue" && daysOverdue > 0 && (
              <p className="text-xs text-danger font-medium mt-0.5">
                ⚠ {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} overdue
              </p>
            )}
            {status === "paid" && plan.paid_date && (
              <p className="text-xs text-success font-medium mt-0.5">
                ✓ Paid on{" "}
                {new Date(plan.paid_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
              onClick={() => downloadFeeReport(plan)}
            >
              <Download className="w-3.5 h-3.5" /> Download Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 border-danger/40 text-danger hover:bg-danger-light"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Plan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminFees() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<FeePlan[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"list" | "overdue">("list");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [selectedPlan, setSelectedPlan] = useState<FeePlan | null>(null);
  const [cycleStructurePlan, setCycleStructurePlan] = useState<FeePlan | null>(null);
  const [instituteCode, setInstituteCode] = useState("");

  // Add Fee dialog state
  const [enrolledInBatch, setEnrolledInBatch] = useState<EnrolledStudent[]>([]);
  const [enrolledLoading, setEnrolledLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [newFee, setNewFee] = useState({
    batch_id: "",
    annual_amount: "",
    payment_frequency: "monthly",
    cycle_day: "",
    start_month_month: String(currentMonth),
    start_month_year: String(currentYear),
    description: "",
  });

  const installmentAmount = newFee.annual_amount
    ? calcInstallment(parseFloat(newFee.annual_amount), newFee.payment_frequency)
    : 0;
  const freqLabel = FREQUENCY_OPTIONS.find((o) => o.value === newFee.payment_frequency)?.label || "";

  // When batch changes in the Add Fee dialog, load enrolled students
  const handleAddFeeBatchChange = async (batchId: string) => {
    setNewFee((prev) => ({ ...prev, batch_id: batchId }));
    setSelectedStudentIds(new Set());
    if (!batchId) {
      setEnrolledInBatch([]);
      return;
    }
    setEnrolledLoading(true);
    try {
      const { data } = await supabase.from("students_batches").select("student_id").eq("batch_id", batchId);
      if (!data || data.length === 0) {
        setEnrolledInBatch([]);
        return;
      }
      const ids = data.map((r) => r.student_id);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids)
        .eq("status", "approved");
      setEnrolledInBatch((profileData || []).map((p) => ({ student_id: p.user_id, full_name: p.full_name })));
    } finally {
      setEnrolledLoading(false);
    }
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllStudents = () => {
    if (selectedStudentIds.size === enrolledInBatch.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(enrolledInBatch.map((s) => s.student_id)));
    }
  };

  const resetAddFeeDialog = () => {
    setNewFee({
      batch_id: "",
      annual_amount: "",
      payment_frequency: "monthly",
      cycle_day: "",
      start_month_month: String(currentMonth),
      start_month_year: String(currentYear),
      description: "",
    });
    setSelectedStudentIds(new Set());
    setEnrolledInBatch([]);
  };

  const [feesPage, setFeesPage] = useState(0);
  const [feesHasMore, setFeesHasMore] = useState(false);
  const [feesTotal, setFeesTotal] = useState(0);
  const [loadingMoreFees, setLoadingMoreFees] = useState(false);

  const FEES_PAGE_SIZE = 50;

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = async (pageNum = 0, reset = true) => {
    if (reset) setLoading(true); else setLoadingMoreFees(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("institute_code")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      const code = roleData?.institute_code;
      if (!code) return;
      setInstituteCode(code);

      const from = pageNum * FEES_PAGE_SIZE;
      const to = from + FEES_PAGE_SIZE - 1;

      const [studentsRes, batchesRes, plansRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name")
          .eq("institute_code", code)
          .eq("role", "student")
          .eq("status", "approved"),
        supabase.from("batches").select("id, name, course").eq("institute_code", code).eq("is_active", true),
        supabase
          .from("fees")
          .select("*", { count: "exact" })
          .eq("institute_code", code)
          .order("created_at", { ascending: false })
          .range(from, to),
      ]);

      setStudents(studentsRes.data || []);
      setBatches(batchesRes.data || []);

      if (plansRes.error) throw plansRes.error;

      const studentMap = new Map((studentsRes.data || []).map((s) => [s.user_id, s.full_name]));
      const batchMap = new Map((batchesRes.data || []).map((b) => [b.id, b.name]));

      const enriched: FeePlan[] = (plansRes.data || []).map((f) => ({
        ...f,
        paid_cycles_count: (f as FeePlan).paid_cycles_count ?? 0,
        total_paid_amount: (f as FeePlan).total_paid_amount ?? 0,
        cycle_day: (f as FeePlan).cycle_day ?? null,
        start_month: (f as FeePlan).start_month ?? null,
        student_name: studentMap.get(f.student_id) || "Unknown Student",
        batch_name: f.batch_id ? batchMap.get(f.batch_id) || "Unknown Batch" : "—",
      }));

      if (reset) {
        setPlans(enriched);
      } else {
        setPlans((prev) => [...prev, ...enriched]);
      }

      const total = plansRes.count ?? 0;
      setFeesTotal(total);
      setFeesHasMore(from + FEES_PAGE_SIZE < total);
      setFeesPage(pageNum);
    } catch {
      toast({ title: "Error", description: "Failed to load fees", variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMoreFees(false);
    }
  };

  useEffect(() => {
    fetchData(0, true);
  }, []);

  // ─── Add Fee (multi-student bulk) ───────────────────────────────────────────

  const handleAddFee = async () => {
    if (!newFee.batch_id || !newFee.annual_amount || !newFee.cycle_day || selectedStudentIds.size === 0) {
      toast({
        title: "Required fields",
        description: "Select a batch, at least one student, annual amount and cycle day.",
        variant: "destructive",
      });
      return;
    }
    const cycleDay = parseInt(newFee.cycle_day);
    if (cycleDay < 1 || cycleDay > 31) {
      toast({ title: "Invalid day", description: "Cycle day must be between 1 and 31.", variant: "destructive" });
      return;
    }
    setAddLoading(true);
    try {
      const annual = parseFloat(newFee.annual_amount);
      const amount = calcInstallment(annual, newFee.payment_frequency);
      const startMonth = `${newFee.start_month_year}-${String(parseInt(newFee.start_month_month)).padStart(2, "0")}`;
      const dueDate = `${startMonth}-${String(cycleDay).padStart(2, "0")}`;

      const rows = Array.from(selectedStudentIds).map((sid) => ({
        student_id: sid,
        batch_id: newFee.batch_id,
        amount,
        annual_amount: annual,
        payment_frequency: newFee.payment_frequency,
        cycle_day: cycleDay,
        start_month: startMonth,
        due_date: dueDate,
        description: newFee.description || `${freqLabel} fee`,
        institute_code: instituteCode,
        paid: false,
        paid_cycles_count: 0,
        total_paid_amount: 0,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("fees") as any).insert(rows);
      if (error) throw error;
      toast({
        title: "Fee plans created ✓",
        description: `Fee structure applied to ${rows.length} student${rows.length !== 1 ? "s" : ""}.`,
      });
      setShowAdd(false);
      resetAddFeeDialog();
      fetchData(0, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add fee";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setAddLoading(false);
    }
  };

  // ─── Mark Paid → advance cycle ──────────────────────────────────────────────
  // Rule: each cycle can only be paid ONCE.
  // paid=true means current cycle is paid. We only allow marking paid when paid=false.
  // After marking: paid=true, paid_cycles_count++, total_paid_amount+=amount, paid_date=today.
  // The next cycle's due date is computed from paid_cycles_count (via getCurrentDueDate).
  // When the next cycle's due date arrives, paid must be reset to false so it shows Pending again.
  // → We reset paid=false immediately when marking, but increment paid_cycles_count so
  //   getCurrentDueDate advances to the next cycle. paid=true only during the current cycle window.
  //
  // IMPORTANT: We set paid=false + advance paid_cycles_count so that after paying,
  // the system naturally shows the next cycle as Pending once it arrives.

  // Mark a specific cycle number as paid (used both from table row and cycle structure modal)
  const handleMarkPaidForCycle = async (plan: FeePlan, targetCycleIndex?: number) => {
    // If no specific cycle given, we mark the current (next unpaid) cycle
    const currentCycleIndex = (plan.paid_cycles_count ?? 0) + 1;
    const cycleToMark = targetCycleIndex ?? currentCycleIndex;

    // Guard: if marking the current cycle and it's already paid
    if (!targetCycleIndex && plan.paid) {
      toast({
        title: "Already paid",
        description: "This cycle is already marked as paid.",
        variant: "destructive",
      });
      return;
    }

    // For advance payment via cycle structure: cycleToMark must be > paid_cycles_count
    if (cycleToMark <= (plan.paid_cycles_count ?? 0)) {
      toast({ title: "Already paid", description: `Cycle ${cycleToMark} is already paid.`, variant: "destructive" });
      return;
    }

    // When paying a future cycle, we must pay all cycles up to it sequentially
    // (paid_cycles_count must increment one-by-one to maintain integrity)
    const cyclesToPay = cycleToMark - (plan.paid_cycles_count ?? 0);
    setMarkingId(plan.id);
    try {
      const today = new Date().toISOString().split("T")[0];
      const newPaidCyclesCount = (plan.paid_cycles_count ?? 0) + cyclesToPay;
      const newTotalPaid = Number(plan.total_paid_amount ?? 0) + Number(plan.amount) * cyclesToPay;

      // Compute next cycle's due date based on the new paid_cycles_count
      // We temporarily update paid_cycles_count to compute next due
      const tempPlan = { ...plan, paid_cycles_count: newPaidCyclesCount };
      const nextDueDateObj = getCurrentDueDate(tempPlan);
      const nextDue = nextDueDateObj ? nextDueDateObj.toISOString().split("T")[0] : null;

      const { error } = await supabase
        .from("fees")
        .update({
          paid: true, // mark current cycle as paid
          paid_date: today,
          paid_cycles_count: newPaidCyclesCount,
          total_paid_amount: newTotalPaid,
          due_date: nextDue, // store next cycle due date for reference
        } as never)
        .eq("id", plan.id);

      if (error) throw error;

      toast({
        title: "Marked as Paid ✓",
        description: `Cycle ${newPaidCyclesCount} paid. Next due: ${nextDue ? new Date(nextDue).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}`,
      });
      fetchData(0, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setMarkingId(null);
    }
  };

  // ─── Send overdue notification ──────────────────────────────────────────────

  const handleSendOverdueNotification = async (plan: FeePlan) => {
    setNotifyingId(plan.id);
    try {
      const daysOverdue = getDaysOverdue(plan);
      const dueDate = getCurrentDueDate(plan);
      const dueDateStr = dueDate ? dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long" }) : "";

      const { error } = await supabase.functions.invoke("send-push-notifications", {
        body: {
          institute_code: instituteCode,
          target_user_ids: [plan.student_id],
          title: "⚠ Fee Overdue",
          body: `Your ${plan.payment_frequency || "fee"} payment of ₹${Number(plan.amount).toLocaleString("en-IN")} was due on ${dueDateStr} (${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue). Please pay immediately.`,
          url: "/student/fees",
        },
      });
      if (error) throw error;
      toast({ title: "Notification sent", description: `Overdue reminder sent to ${plan.student_name}` });
    } catch {
      toast({ title: "Sent", description: "Notification dispatched." });
    } finally {
      setNotifyingId(null);
    }
  };

  // ─── Filtering & Grouping ────────────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      plans.filter((p) => {
        const matchSearch =
          p.student_name?.toLowerCase().includes(search.toLowerCase()) ||
          p.batch_name?.toLowerCase().includes(search.toLowerCase());
        const status = getFeeStatus(p);
        const matchStatus = statusFilter === "all" || status === statusFilter;
        const matchBatch = batchFilter === "all" || p.batch_id === batchFilter;
        return matchSearch && matchStatus && matchBatch;
      }),
    [plans, search, statusFilter, batchFilter],
  );

  const overduePlans = useMemo(() => plans.filter((p) => getFeeStatus(p) === "overdue"), [plans]);

  const grouped: GroupedStudent[] = useMemo(() => {
    const map = new Map<string, GroupedStudent>();
    for (const p of filtered) {
      if (!map.has(p.student_id)) {
        map.set(p.student_id, { student_id: p.student_id, student_name: p.student_name || "Unknown", plans: [] });
      }
      map.get(p.student_id)!.plans.push(p);
    }
    return Array.from(map.values());
  }, [filtered]);

  const toggleExpandStudent = (id: string) => {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Stats ───────────────────────────────────────────────────────────────────

  const totalCollected = plans.reduce((s, p) => s + Number(p.total_paid_amount), 0);
  const totalPending = plans.filter((p) => getFeeStatus(p) !== "paid").reduce((s, p) => s + Number(p.amount), 0);
  const overdueAmount = overduePlans.reduce((s, p) => s + Number(p.amount), 0);

  const summaryStats = [
    {
      label: "Total Collected",
      value: `₹${totalCollected.toLocaleString("en-IN")}`,
      sub: `${plans.reduce((s, p) => s + (p.paid_cycles_count ?? 0), 0)} payments`,
      color: "success",
      icon: TrendingUp,
    },
    {
      label: "Pending Dues",
      value: `₹${totalPending.toLocaleString("en-IN")}`,
      sub: `${plans.filter((p) => getFeeStatus(p) !== "paid").length} entries`,
      color: "warning",
      icon: Clock,
    },
    {
      label: "Overdue",
      value: `₹${overdueAmount.toLocaleString("en-IN")}`,
      sub: `${overduePlans.length} entries`,
      color: "danger",
      icon: AlertTriangle,
    },
  ];

  return (
    <DashboardLayout title="Fees">
      <div className="space-y-5">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryStats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="p-4 shadow-card border-border/50">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color === "success" ? "bg-success-light" : s.color === "warning" ? "bg-accent-light" : "bg-danger-light"}`}
                  >
                    <s.icon
                      className={`w-4 h-4 ${s.color === "success" ? "text-success" : s.color === "warning" ? "text-accent" : "text-danger"}`}
                    />
                  </div>
                </div>
                <div className="text-2xl font-display font-bold mb-0.5">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border/50">
          <button
            onClick={() => setActiveTab("list")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "list" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            All Fees
          </button>
          <button
            onClick={() => setActiveTab("overdue")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === "overdue" ? "border-danger text-danger" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Overdue
            {overduePlans.length > 0 && (
              <span className="bg-danger text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {overduePlans.length}
              </span>
            )}
          </button>
        </div>

        {/* ── OVERDUE TAB ── */}
        {activeTab === "overdue" && (
          <div className="space-y-3">
            {overduePlans.length === 0 ? (
              <Card className="p-10 text-center shadow-card border-border/50">
                <CheckCircle2 className="w-9 h-9 text-success opacity-60 mx-auto mb-3" />
                <p className="font-semibold">No overdue fees!</p>
                <p className="text-sm text-muted-foreground">All students are up to date.</p>
              </Card>
            ) : (
              overduePlans.map((plan, i) => {
                const daysOverdue = getDaysOverdue(plan);
                const dueDate = getCurrentDueDate(plan);
                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Card className="p-4 shadow-card border-danger/20 bg-danger-light/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {plan.student_name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{plan.student_name}</p>
                            <p className="text-xs text-muted-foreground">{plan.batch_name}</p>
                            {dueDate && (
                              <p className="text-xs text-danger font-medium">
                                Due {dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ·{" "}
                                {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} overdue
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right mr-1">
                            <p className="font-bold text-sm">₹{Number(plan.amount).toLocaleString("en-IN")}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 gap-1 text-xs border-danger/40 text-danger hover:bg-danger-light"
                            disabled={notifyingId === plan.id}
                            onClick={() => handleSendOverdueNotification(plan)}
                            title="Send overdue notification"
                          >
                            {notifyingId === plan.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Bell className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-success hover:text-success gap-1"
                            disabled={markingId === plan.id}
                            onClick={() => handleMarkPaidForCycle(plan)}
                          >
                            {markingId === plan.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Paid
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </div>
        )}

        {/* ── LIST TAB ── */}
        {activeTab === "list" && (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {["all", "paid", "pending", "overdue", "upcoming"].map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={statusFilter === f ? "default" : "outline"}
                    onClick={() => setStatusFilter(f)}
                    className={`h-9 capitalize ${statusFilter === f ? "gradient-hero text-white border-0" : ""}`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
              </div>
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger className="h-9 w-44 gap-1.5 text-sm">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-9 gradient-hero text-white border-0 gap-1.5 ml-auto"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="w-4 h-4" /> Add Fee
              </Button>
            </div>

            {/* Grouped Table */}
            {loading ? (
              <Card className="p-10 text-center shadow-card border-border/50">
                <Loader2 className="w-7 h-7 text-primary mx-auto mb-3 animate-spin" />
                <p className="text-sm text-muted-foreground">Loading fees...</p>
              </Card>
            ) : grouped.length === 0 ? (
              <Card className="p-10 text-center shadow-card border-border/50">
                <IndianRupee className="w-9 h-9 text-muted-foreground opacity-30 mx-auto mb-3" />
                <p className="font-semibold">No fee records</p>
                <p className="text-sm text-muted-foreground">Add fee entries using the "Add Fee" button above.</p>
              </Card>
            ) : (
              <Card className="shadow-card border-border/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/60 border-b border-border/50">
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                          Student / Batch
                        </th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                          Frequency
                        </th>
                        <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                          Amount
                        </th>
                        <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                          Fee Structure
                        </th>
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                          Next Due
                        </th>
                        <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                          Status
                        </th>
                        <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((group) => {
                        const isExpanded = expandedStudents.has(group.student_id);
                        const hasMultiple = group.plans.length > 1;
                        return group.plans.map((plan, pi) => {
                          const status = getFeeStatus(plan);
                          const st = STATUS_CONFIG[status];
                          const StatusIcon = st.icon;
                          const dueDate = getCurrentDueDate(plan);
                          const daysOverdue = getDaysOverdue(plan);
                          const freqOpt = FREQUENCY_OPTIONS.find((o) => o.value === plan.payment_frequency);
                          const isFirstRow = pi === 0;
                          if (!isFirstRow && !isExpanded) return null;

                          return (
                            <tr
                              key={plan.id}
                              className={`border-b border-border/40 hover:bg-muted/30 transition-colors ${!isFirstRow ? "bg-muted/10" : ""}`}
                            >
                              {/* Student / Batch */}
                              <td className="px-4 py-3">
                                {isFirstRow ? (
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                      {group.student_name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .slice(0, 2)}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-semibold">{group.student_name}</p>
                                        {hasMultiple && (
                                          <button
                                            onClick={() => toggleExpandStudent(group.student_id)}
                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                          >
                                            {isExpanded ? (
                                              <ChevronUp className="w-3.5 h-3.5" />
                                            ) : (
                                              <ChevronDown className="w-3.5 h-3.5" />
                                            )}
                                          </button>
                                        )}
                                        {hasMultiple && (
                                          <span className="text-xs text-muted-foreground">
                                            ({group.plans.length} batches)
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-primary font-medium">{plan.batch_name}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="pl-11">
                                    <p className="text-xs text-primary font-medium">{plan.batch_name}</p>
                                  </div>
                                )}
                              </td>

                              {/* Frequency */}
                              <td className="px-4 py-3 hidden sm:table-cell">
                                {freqOpt ? (
                                  <Badge variant="secondary" className="text-xs">
                                    {freqOpt.label}
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </td>

                              {/* Amount */}
                              <td className="px-4 py-3 text-right">
                                <span className="text-sm font-semibold">
                                  ₹{Number(plan.amount).toLocaleString("en-IN")}
                                </span>
                                {plan.annual_amount && (
                                  <p className="text-xs text-muted-foreground">
                                    Annual: ₹{Number(plan.annual_amount).toLocaleString("en-IN")}
                                  </p>
                                )}
                              </td>

                              {/* Fee Structure icon */}
                              <td className="px-4 py-3 text-center hidden md:table-cell">
                                <button
                                  onClick={() => setSelectedPlan(plan)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                                  title="View fee structure"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              </td>

                              {/* Due Date */}
                              <td className="px-4 py-3 hidden md:table-cell">
                                {dueDate ? (
                                  <div>
                                    <span
                                      className={`text-sm ${status === "overdue" ? "text-danger font-semibold" : status === "paid" ? "text-success" : "text-muted-foreground"}`}
                                    >
                                      {dueDate.toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                    {status === "overdue" && daysOverdue > 0 && (
                                      <p className="text-xs text-danger">{daysOverdue}d overdue</p>
                                    )}
                                    {plan.cycle_day && (
                                      <p className="text-xs text-muted-foreground">
                                        <CalendarDays className="w-2.5 h-2.5 inline mr-0.5" />
                                        Cycle Date — {plan.cycle_day}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3 text-center">
                                <Badge className={`text-xs gap-1 ${st.color}`}>
                                  <StatusIcon className="w-3 h-3" /> {st.label}
                                </Badge>
                              </td>

                              {/* Action */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-col items-end gap-1">
                                  {/* Mark Paid: only show when pending or overdue (NOT upcoming) */}
                                  {!plan.paid && (status === "pending" || status === "overdue") && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-success hover:text-success gap-1"
                                      disabled={markingId === plan.id}
                                      onClick={() => handleMarkPaidForCycle(plan)}
                                    >
                                      {markingId === plan.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      )}
                                      Mark Paid
                                    </Button>
                                  )}

                                  {/* Cycle Structure: always show if plan has cycle setup */}
                                  {plan.cycle_day && plan.start_month && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-primary hover:text-primary gap-1"
                                      onClick={() => setCycleStructurePlan(plan)}
                                    >
                                      <ListOrdered className="w-3.5 h-3.5" />
                                      Cycle Structure
                                    </Button>
                                  )}

                                  {/* Notify: only for overdue */}
                                  {status === "overdue" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-danger hover:text-danger gap-1"
                                      disabled={notifyingId === plan.id}
                                      onClick={() => handleSendOverdueNotification(plan)}
                                    >
                                      {notifyingId === plan.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Bell className="w-3.5 h-3.5" />
                                      )}
                                      Notify
                                    </Button>
                                  )}

                                  {/* If paid and no cycle setup, show nothing special */}
                                  {plan.paid && !plan.cycle_day && (
                                    <span className="text-xs text-success font-medium flex items-center justify-end gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Add Fee Dialog (Batch-first, multi-student) ── */}
      <Dialog
        open={showAdd}
        onOpenChange={(open) => {
          if (!open) resetAddFeeDialog();
          setShowAdd(open);
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Fee Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Step 1: Batch */}
            <div className="space-y-1.5">
              <Label>
                Batch <span className="text-danger">*</span>
              </Label>
              <Select value={newFee.batch_id} onValueChange={handleAddFeeBatchChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select batch first..." />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} — {b.course}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Students from that batch */}
            {newFee.batch_id && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Students <span className="text-danger">*</span>
                    {selectedStudentIds.size > 0 && (
                      <span className="text-xs font-normal text-primary">({selectedStudentIds.size} selected)</span>
                    )}
                  </Label>
                  {enrolledInBatch.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllStudents}
                      className="text-xs text-primary font-medium hover:underline"
                    >
                      {selectedStudentIds.size === enrolledInBatch.length ? "Deselect all" : "Select all students"}
                    </button>
                  )}
                </div>

                {enrolledLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading students...
                  </div>
                ) : enrolledInBatch.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-3 text-center">
                    No students enrolled in this batch yet.
                  </p>
                ) : (
                  <div className="rounded-lg border border-border max-h-40 overflow-y-auto divide-y divide-border/50">
                    {enrolledInBatch.map((s) => (
                      <label
                        key={s.student_id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <Checkbox
                          checked={selectedStudentIds.has(s.student_id)}
                          onCheckedChange={() => toggleStudent(s.student_id)}
                        />
                        <span className="text-sm font-medium">{s.full_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Annual Amount */}
            <div className="space-y-1.5">
              <Label>
                Annual Package Amount (₹) <span className="text-danger">*</span>
              </Label>
              <Input
                type="number"
                placeholder="e.g. 12000"
                value={newFee.annual_amount}
                onChange={(e) => setNewFee({ ...newFee, annual_amount: e.target.value })}
              />
            </div>

            {/* Payment Frequency */}
            <div className="space-y-1.5">
              <Label>
                Payment Frequency <span className="text-danger">*</span>
              </Label>
              <div className="grid grid-cols-4 gap-1.5">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewFee({ ...newFee, payment_frequency: opt.value })}
                    className={`h-9 rounded-lg text-xs font-medium border transition-all ${newFee.payment_frequency === opt.value ? "gradient-hero text-white border-0 shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Calculated installment */}
            {newFee.annual_amount && parseFloat(newFee.annual_amount) > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-primary font-medium">{freqLabel} Installment</p>
                  <p className="text-xs text-muted-foreground">Auto-calculated</p>
                </div>
                <p className="text-lg font-display font-bold text-primary">
                  ₹{installmentAmount.toLocaleString("en-IN")}
                </p>
              </div>
            )}

            {/* Cycle Day */}
            <div className="space-y-1.5">
              <Label>
                Cycle Date (1–31) <span className="text-danger">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                max={31}
                placeholder="e.g. 10"
                value={newFee.cycle_day}
                onChange={(e) => setNewFee({ ...newFee, cycle_day: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Fee is due on this date each{" "}
                {FREQUENCY_OPTIONS.find((o) => o.value === newFee.payment_frequency)?.months === 1
                  ? "month"
                  : `${FREQUENCY_OPTIONS.find((o) => o.value === newFee.payment_frequency)?.months} months`}
              </p>
            </div>

            {/* Start Month */}
            <div className="space-y-1.5">
              <Label>
                Starting From <span className="text-danger">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={newFee.start_month_month}
                  onValueChange={(v) => setNewFee({ ...newFee, start_month_month: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={newFee.start_month_year}
                  onValueChange={(v) => setNewFee({ ...newFee, start_month_year: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newFee.cycle_day && newFee.start_month_month && (
                <p className="text-xs text-primary font-medium">
                  First cycle: {newFee.cycle_day}
                  {ordinal(parseInt(newFee.cycle_day) || 1)} {MONTHS[parseInt(newFee.start_month_month) - 1]}{" "}
                  {newFee.start_month_year}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="e.g. Physics batch monthly fee"
                value={newFee.description}
                onChange={(e) => setNewFee({ ...newFee, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  resetAddFeeDialog();
                  setShowAdd(false);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddFee}
                disabled={addLoading || selectedStudentIds.size === 0}
                className="flex-1 gradient-hero text-white border-0"
              >
                {addLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `Apply to ${selectedStudentIds.size > 0 ? selectedStudentIds.size : ""} Student${selectedStudentIds.size !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fee Structure Modal */}
      {selectedPlan && (
        <FeeStructureModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onDeleted={(id) => {
            setPlans((prev) => prev.filter((p) => p.id !== id));
            setSelectedPlan(null);
          }}
        />
      )}

      {/* Cycle Structure Modal */}
      {cycleStructurePlan && (
        <CycleStructureModal
          plan={cycleStructurePlan}
          onClose={() => setCycleStructurePlan(null)}
          onMarkPaid={async (cycleIndex) => {
            await handleMarkPaidForCycle(cycleStructurePlan, cycleIndex);
            // Refresh the plan data in the modal
            setCycleStructurePlan((prev) => {
              if (!prev) return null;
              const cyclesToPay = cycleIndex - (prev.paid_cycles_count ?? 0);
              return {
                ...prev,
                paid_cycles_count: (prev.paid_cycles_count ?? 0) + cyclesToPay,
                total_paid_amount: Number(prev.total_paid_amount ?? 0) + Number(prev.amount) * cyclesToPay,
                paid: true,
              };
            });
          }}
        />
      )}

      {/* Load More Fees */}
      {feesHasMore && !loading && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(feesPage + 1, false)}
            disabled={loadingMoreFees}
            className="gap-2 h-9 px-6"
          >
            {loadingMoreFees ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loadingMoreFees ? "Loading..." : `Load More (${feesTotal - plans.length} remaining)`}
          </Button>
        </div>
      )}
    </DashboardLayout>
  );
}
