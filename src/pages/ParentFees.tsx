import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IndianRupee, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2, TrendingUp, CalendarDays
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
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return s[(v-20)%10] || s[v] || s[0];
}

function getCurrentDueDate(plan: FeePlan): Date | null {
  if (!plan.cycle_day || !plan.start_month) {
    return plan.due_date ? new Date(plan.due_date) : null;
  }
  const months = FREQ_MONTHS[plan.payment_frequency || "monthly"] ?? 1;
  const [sy, sm] = plan.start_month.split("-").map(Number);
  const today = new Date(); today.setHours(0,0,0,0);
  let cycleDate = new Date(sy, sm - 1, plan.cycle_day);
  while (cycleDate < today) {
    const next = new Date(cycleDate);
    next.setMonth(next.getMonth() + months);
    if (next <= today) cycleDate = next; else break;
  }
  return cycleDate;
}

function getFeeStatus(plan: FeePlan): "paid" | "pending" | "overdue" {
  if (plan.paid) return "paid";
  const dueDate = getCurrentDueDate(plan);
  if (!dueDate) return "pending";
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(dueDate); cutoff.setDate(cutoff.getDate() + 7);
  return today > cutoff ? "overdue" : "pending";
}

function getDaysOverdue(plan: FeePlan): number {
  const dueDate = getCurrentDueDate(plan);
  if (!dueDate) return 0;
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(dueDate); cutoff.setDate(cutoff.getDate() + 7);
  const diff = today.getTime() - cutoff.getTime();
  return diff > 0 ? Math.ceil(diff / 86400000) : 0;
}

const STATUS_CONFIG = {
  paid: { label: "Paid", color: "bg-success-light text-success border-success/20", icon: CheckCircle2 },
  pending: { label: "Pending", color: "bg-accent-light text-accent border-accent/20", icon: Clock },
  overdue: { label: "Overdue", color: "bg-danger-light text-danger border-danger/20", icon: XCircle },
};

export default function ParentFees() {
  const [plans, setPlans] = useState<FeePlan[]>([]);
  const [childName, setChildName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: childId } = await supabase.rpc("get_my_child_user_id");
      if (!childId) { setLoading(false); return; }

      const [profileRes, feesRes, batchesRes] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("user_id", childId).maybeSingle(),
        supabase.from("fees").select("*").eq("student_id", childId).order("created_at", { ascending: false }),
        supabase.from("batches").select("id, name"),
      ]);

      setChildName(profileRes.data?.full_name || "");
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
  const totalDue = useMemo(() => plans.filter(p => !p.paid).reduce((s, p) => s + Number(p.amount), 0), [plans]);
  const overdueCount = useMemo(() => plans.filter(p => getFeeStatus(p) === "overdue").length, [plans]);

  return (
    <DashboardLayout title="Fee Status" role="parent">
      <div className="space-y-5 max-w-2xl">
        {childName && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="gradient-hero rounded-xl p-4 text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-base flex-shrink-0">
                {childName.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <p className="text-white/70 text-xs">Fee structure for</p>
                <p className="font-display font-bold text-lg">{childName}</p>
              </div>
            </div>
          </motion.div>
        )}

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
            <p className="text-sm text-muted-foreground">Loading fee records...</p>
          </Card>
        ) : plans.length === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <IndianRupee className="w-9 h-9 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="font-semibold">No fee records</p>
            <p className="text-sm text-muted-foreground">No fee plans found for your child yet.</p>
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
                  <Card className={`p-4 shadow-card border-border/50 ${status === "overdue" ? "border-danger/30 bg-danger-light/20" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-sm">{plan.batch_name}</p>
                          {plan.payment_frequency && (
                            <Badge variant="secondary" className="text-xs">{FREQ_LABELS[plan.payment_frequency] || plan.payment_frequency}</Badge>
                          )}
                        </div>
                        {plan.description && <p className="text-xs text-muted-foreground mb-1">{plan.description}</p>}

                        {plan.cycle_day && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <CalendarDays className="w-3 h-3" />
                            {plan.cycle_day}{ordinal(plan.cycle_day)} of every {FREQ_MONTHS[plan.payment_frequency || "monthly"] === 1 ? "month" : `${FREQ_MONTHS[plan.payment_frequency || "monthly"]} months`}
                          </p>
                        )}

                        {status !== "paid" && dueDate && (
                          <p className={`text-xs font-medium ${status === "overdue" ? "text-danger" : "text-muted-foreground"}`}>
                            {status === "overdue"
                              ? `⚠ Overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} — was due ${dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                              : `Due: ${dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`}
                          </p>
                        )}

                        {plan.paid_cycles_count > 0 && (
                          <p className="text-xs text-success font-medium mt-1">
                            ✓ {plan.paid_cycles_count} cycle{plan.paid_cycles_count !== 1 ? "s" : ""} paid · ₹{Number(plan.total_paid_amount).toLocaleString("en-IN")} total
          </p>
                        )}
                      </div>

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
            Read-only view. Contact the institute admin for payment queries.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
