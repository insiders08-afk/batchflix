import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IndianRupee, CheckCircle2, XCircle, Clock, AlertTriangle,
  Loader2, TrendingUp, CalendarDays
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FeePlan {
  id: string;
  description: string | null;
  amount: number;
  annual_amount: number | null;
  payment_frequency: string | null;
  paid: boolean;
  due_date: string | null;
  paid_date: string | null;
  cycle_day: number | null;
  start_month: string | null;
  paid_cycles_count: number;
  total_paid_amount: number;
  batch_id: string | null;
  batch_name?: string;
}

const FREQ_LABELS: Record<string, string> = {
  monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-Yearly", annual: "Annual",
};
const FREQ_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, half_yearly: 6, annual: 12,
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function getCurrentDueDate(plan: FeePlan): Date | null {
  if (!plan.cycle_day || !plan.start_month) {
    return plan.due_date ? new Date(plan.due_date) : null;
  }
  const months = FREQ_MONTHS[plan.payment_frequency || "monthly"] ?? 1;
  const [sy, sm] = plan.start_month.split("-").map(Number);
  const cycleIndex = plan.paid_cycles_count ?? 0;
  return new Date(sy, sm - 1 + cycleIndex * months, plan.cycle_day);
}

/**
 * upcoming  = before the cycle due date
 * pending   = on the due date up to 7 days after
 * overdue   = more than 7 days after due date
 * paid      = current cycle marked paid
 */
function getFeeStatus(plan: FeePlan): "paid" | "pending" | "overdue" | "upcoming" {
  if (plan.paid) return "paid";

  const dueDate = getCurrentDueDate(plan);
  if (!dueDate) return "pending";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today < dueDate) return "upcoming";

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
  const cutoff = new Date(dueDate);
  cutoff.setDate(cutoff.getDate() + 7);
  const diff = today.getTime() - cutoff.getTime();
  return diff > 0 ? Math.ceil(diff / 86400000) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CalendarClock = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/>
    <path d="M16 2v4M8 2v4M3 10h5"/>
    <circle cx="17.5" cy="17.5" r="4.5"/>
    <path d="M17.5 15.5v2l1.5 1"/>
  </svg>
);

const STATUS_CONFIG = {
  paid:     { label: "Paid",     color: "bg-success-light text-success border-success/20",    icon: CheckCircle2 },
  pending:  { label: "Pending",  color: "bg-accent-light text-accent border-accent/20",       icon: Clock },
  overdue:  { label: "Overdue",  color: "bg-danger-light text-danger border-danger/20",       icon: XCircle },
  upcoming: { label: "Upcoming", color: "bg-muted text-muted-foreground border-border/40",   icon: CalendarClock },
};

export default function StudentFees() {
  const [plans, setPlans] = useState<FeePlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [feesRes, batchesRes] = await Promise.all([
        supabase.from("fees").select("*").eq("student_id", user.id).order("created_at", { ascending: false }),
        supabase.from("batches").select("id, name"),
      ]);

      const batchMap = new Map((batchesRes.data || []).map(b => [b.id, b.name]));
      const enriched = (feesRes.data || []).map((f: FeePlan) => ({
        ...f,
        paid_cycles_count: f.paid_cycles_count ?? 0,
        total_paid_amount: f.total_paid_amount ?? 0,
        batch_name: f.batch_id ? (batchMap.get(f.batch_id) || "—") : "—",
      }));
      setPlans(enriched);
      setLoading(false);
    };
    load();
  }, []);

  const totalPaidAmount = useMemo(() => plans.reduce((s, p) => s + Number(p.total_paid_amount), 0), [plans]);
  const totalDue = useMemo(() => plans.filter(p => {
    const s = getFeeStatus(p);
    return s === "pending" || s === "overdue";
  }).reduce((s, p) => s + Number(p.amount), 0), [plans]);
  const overdueCount = useMemo(() => plans.filter(p => getFeeStatus(p) === "overdue").length, [plans]);

  return (
    <DashboardLayout title="My Fees" role="student">
      <div className="space-y-5 max-w-2xl">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Paid", value: `₹${totalPaidAmount.toLocaleString("en-IN")}`, color: "text-success", bg: "bg-success-light", icon: TrendingUp },
            { label: "Current Due", value: `₹${totalDue.toLocaleString("en-IN")}`, color: "text-accent", bg: "bg-accent-light", icon: Clock },
            { label: "Overdue", value: `${overdueCount}`, color: "text-danger", bg: "bg-danger-light", icon: AlertTriangle },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card className="p-4 text-center shadow-card border-border/50">
                <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mx-auto mb-2`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className={`text-lg font-display font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {loading ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading fees...</p>
          </Card>
        ) : plans.length === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <IndianRupee className="w-9 h-9 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="font-semibold">No fee records</p>
            <p className="text-sm text-muted-foreground">No fee plans have been set up for you yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {plans.map((plan, i) => {
              const status = getFeeStatus(plan);
              const st = STATUS_CONFIG[status];
              const StatusIcon = st.icon;
              const dueDate = getCurrentDueDate(plan);
              const daysOverdue = getDaysOverdue(plan);

              return (
                <motion.div key={plan.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className={`p-4 shadow-card border-border/50 ${status === "overdue" ? "border-danger/30" : status === "upcoming" ? "border-border/30 opacity-80" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Batch + Freq */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-sm">{plan.batch_name}</p>
                          {plan.payment_frequency && (
                            <Badge variant="secondary" className="text-xs">{FREQ_LABELS[plan.payment_frequency] || plan.payment_frequency}</Badge>
                          )}
                        </div>
                        {plan.description && <p className="text-xs text-muted-foreground mb-1">{plan.description}</p>}

                        {/* Cycle info */}
                        {plan.cycle_day && plan.start_month && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <CalendarDays className="w-3 h-3" />
                            {plan.cycle_day}{ordinal(plan.cycle_day)} of every {FREQ_MONTHS[plan.payment_frequency || "monthly"] === 1 ? "month" : `${FREQ_MONTHS[plan.payment_frequency || "monthly"]} months`}
                          </p>
                        )}

                        {/* Status-specific date info */}
                        {status === "upcoming" && dueDate && (
                          <p className="text-xs text-muted-foreground font-medium">
                            Next due: {dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        )}
                        {status === "pending" && dueDate && (
                          <p className="text-xs text-accent font-medium">
                            Due: {dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        )}
                        {status === "overdue" && dueDate && (
                          <p className="text-xs text-danger font-medium">
                            ⚠ Overdue by {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} — was due {dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </p>
                        )}
                        {status === "paid" && plan.paid_date && (
                          <p className="text-xs text-success font-medium">
                            ✓ Paid on {new Date(plan.paid_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        )}

                        {/* Payment history summary */}
                        {plan.paid_cycles_count > 0 && (
                          <p className="text-xs text-success font-medium mt-1">
                            ✓ {plan.paid_cycles_count} cycle{plan.paid_cycles_count !== 1 ? "s" : ""} paid · ₹{Number(plan.total_paid_amount).toLocaleString("en-IN")} total
                          </p>
                        )}
                      </div>

                      {/* Right side */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-base font-display font-bold">₹{Number(plan.amount).toLocaleString("en-IN")}</p>
                          {plan.annual_amount && (
                            <p className="text-xs text-muted-foreground">₹{Number(plan.annual_amount).toLocaleString("en-IN")}/yr</p>
                          )}
                        </div>
                        <Badge className={`text-xs gap-1 ${st.color}`}>
                          <StatusIcon className="w-3 h-3" /> {st.label}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {plans.length > 0 && (
          <p className="text-xs text-muted-foreground text-center pb-2">
            Read-only view. Contact your institute admin for payment queries.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
