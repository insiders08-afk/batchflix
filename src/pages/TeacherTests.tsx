import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trophy, CalendarDays, BookOpen, Loader2, Users, Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Batch { id: string; name: string; course: string; }
interface StudentEntry { studentId: string; studentName: string; score: string; }
interface TestGroup {
  test_name: string; batch_id: string; batchName: string;
  test_date: string; max_marks: number; avgScore: number;
  scores: { id: string; student_id: string; studentName: string; score: number; max_marks: number }[];
}

const medalColors = ["bg-yellow-400/20 text-yellow-600 border-yellow-300", "bg-gray-200 text-gray-600 border-gray-300", "bg-amber-100 text-amber-700 border-amber-200"];
const medals = ["🥇", "🥈", "🥉"];

export default function TeacherTests() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [testGroups, setTestGroups] = useState<TestGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTest, setSelectedTest] = useState<TestGroup | null>(null);
  const [selectedRankBatch, setSelectedRankBatch] = useState<string>("all");
  const [form, setForm] = useState({ testName: "", batchId: "", maxMarks: "100", testDate: new Date().toISOString().split("T")[0] });
  const [scoreEntries, setScoreEntries] = useState<StudentEntry[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [userId, setUserId] = useState<string>("");

  const fetchData = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const [scoreRes, batchRes] = await Promise.all([
        supabase.from("test_scores").select("*").order("test_date", { ascending: false }),
        supabase.from("batches").select("id, name, course").eq("teacher_id", uid).eq("is_active", true).order("name"),
      ]);
      const allBatches = (batchRes.data || []) as Batch[];
      setBatches(allBatches);

      const scores = scoreRes.data || [];
      const studentIds = [...new Set(scores.map(s => s.student_id))];
      let profileMap: Record<string, string> = {};
      if (studentIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds);
        (profiles || []).forEach(p => { profileMap[p.user_id] = p.full_name; });
      }

      const groups: Record<string, TestGroup> = {};
      scores.forEach(s => {
        const key = `${s.test_name}__${s.batch_id}`;
        if (!groups[key]) {
          const batch = allBatches.find(b => b.id === s.batch_id);
          if (!batch) return; // only show tests for teacher's batches
          groups[key] = { test_name: s.test_name, batch_id: s.batch_id, batchName: batch.name, test_date: s.test_date, max_marks: s.max_marks, scores: [], avgScore: 0 };
        }
        groups[key].scores.push({ id: s.id, student_id: s.student_id, studentName: profileMap[s.student_id] || "Unknown", score: Number(s.score), max_marks: Number(s.max_marks) });
      });

      const groupList = Object.values(groups).map(g => ({
        ...g,
        avgScore: g.scores.length > 0 ? Math.round(g.scores.reduce((sum, s) => sum + s.score, 0) / g.scores.length) : 0,
      })).sort((a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime());

      setTestGroups(groupList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      fetchData(user.id);
    };
    init();
  }, [fetchData]);

  useEffect(() => {
    if (!form.batchId) { setScoreEntries([]); return; }
    const load = async () => {
      setLoadingStudents(true);
      const { data: enrollments } = await supabase.from("students_batches").select("student_id").eq("batch_id", form.batchId);
      const ids = (enrollments || []).map(e => e.student_id);
      let entries: StudentEntry[] = [];
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
        entries = (profiles || []).map(p => ({ studentId: p.user_id, studentName: p.full_name, score: "" }));
      }
      setScoreEntries(entries);
      setLoadingStudents(false);
    };
    load();
  }, [form.batchId]);

  const handleCreate = async () => {
    if (!form.testName.trim() || !form.batchId) {
      toast({ title: "Missing fields", description: "Test name and batch are required.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data: code } = await supabase.rpc("get_my_institute_code");
      const records = scoreEntries.filter(e => e.score !== "").map(e => ({
        test_name: form.testName.trim(),
        batch_id: form.batchId,
        student_id: e.studentId,
        score: Number(e.score) || 0,
        max_marks: Number(form.maxMarks) || 100,
        test_date: form.testDate,
        institute_code: code!,
      }));
      if (records.length === 0) {
        toast({ title: "No scores", description: "Enter at least one score.", variant: "destructive" });
        setCreating(false); return;
      }
      const { error } = await supabase.from("test_scores").insert(records);
      if (error) throw error;
      toast({ title: "✅ Test scores saved!", description: `${records.length} scores recorded.` });
      setDialogOpen(false);
      setForm({ testName: "", batchId: "", maxMarks: "100", testDate: new Date().toISOString().split("T")[0] });
      setScoreEntries([]);
      fetchData(userId);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // Rankings computed per batch
  const rankingBatches = batches;
  const getRankings = () => {
    const relevantGroups = selectedRankBatch === "all" ? testGroups : testGroups.filter(g => g.batch_id === selectedRankBatch);
    const studentTotals: Record<string, { name: string; totalScore: number; totalMax: number; tests: number }> = {};
    relevantGroups.forEach(g => {
      g.scores.forEach(s => {
        if (!studentTotals[s.student_id]) studentTotals[s.student_id] = { name: s.studentName, totalScore: 0, totalMax: 0, tests: 0 };
        studentTotals[s.student_id].totalScore += s.score;
        studentTotals[s.student_id].totalMax += s.max_marks;
        studentTotals[s.student_id].tests++;
      });
    });
    return Object.entries(studentTotals)
      .map(([id, v]) => ({ id, ...v, pct: v.totalMax > 0 ? Math.round((v.totalScore / v.totalMax) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);
  };
  const rankings = getRankings();

  return (
    <DashboardLayout title="Tests & Scores" role="teacher">
      <div className="space-y-5">
        <div className="flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2">
                <Plus className="w-4 h-4" /> Add Test Scores
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Enter Test Scores</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Test Name</Label>
                  <Input placeholder="e.g. Unit Test 4 — Thermodynamics" value={form.testName} onChange={e => setForm({ ...form, testName: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Batch</Label>
                    <Select value={form.batchId} onValueChange={v => setForm({ ...form, batchId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                      <SelectContent>
                        {batches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Marks</Label>
                    <Input type="number" placeholder="100" value={form.maxMarks} onChange={e => setForm({ ...form, maxMarks: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Test Date</Label>
                  <Input type="date" value={form.testDate} onChange={e => setForm({ ...form, testDate: e.target.value })} />
                </div>
                {form.batchId && (
                  <div className="space-y-2">
                    <Label>Student Scores</Label>
                    {loadingStudents ? (
                      <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                    ) : scoreEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-3 text-center">No students enrolled yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {scoreEntries.map(e => (
                          <div key={e.studentId} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {e.studentName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </div>
                            <span className="text-sm flex-1">{e.studentName}</span>
                            <Input type="number" placeholder="Score" className="w-20 h-8 text-sm" value={e.score} min={0} max={Number(form.maxMarks)}
                              onChange={ev => setScoreEntries(prev => prev.map(s => s.studentId === e.studentId ? { ...s, score: ev.target.value } : s))} />
                            <span className="text-xs text-muted-foreground">/ {form.maxMarks}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <Button className="w-full gradient-hero text-white border-0 shadow-primary hover:opacity-90" onClick={handleCreate} disabled={creating}>
                  {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Test Scores"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Tests List */}
            <div className="lg:col-span-2 space-y-3">
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">All Tests</h3>
              {testGroups.length === 0 ? (
                <Card className="p-10 text-center shadow-card border-border/50">
                  <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No tests recorded yet</p>
                  <p className="text-muted-foreground text-sm mt-1">Click "Add Test Scores" to record your first test.</p>
                </Card>
              ) : (
                testGroups.map((test, i) => (
                  <motion.div key={`${test.test_name}-${test.batch_id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="p-4 shadow-card border-border/50 hover:shadow-lg transition-shadow">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">{test.test_name}</span>
                              <Badge className="text-xs bg-success-light text-success border-success/20">Done</Badge>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />
                                {new Date(test.test_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                              <span>{test.batchName}</span>
                              <span>Max: {test.max_marks}</span>
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{test.scores.length}</span>
                              <span className="text-success font-medium">Avg: {test.avgScore}/{test.max_marks}</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-8 text-xs flex-shrink-0"
                          onClick={() => setSelectedTest(selectedTest?.test_name === test.test_name && selectedTest?.batch_id === test.batch_id ? null : test)}>
                          {selectedTest?.test_name === test.test_name && selectedTest?.batch_id === test.batch_id ? "Hide" : "Results"}
                        </Button>
                      </div>

                      {selectedTest?.test_name === test.test_name && selectedTest?.batch_id === test.batch_id && (
                        <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                          {[...test.scores].sort((a, b) => b.score - a.score).map((s, idx) => (
                            <div key={s.id} className="flex items-center gap-3 text-sm">
                              <span className="text-xs text-muted-foreground w-5 text-center font-bold">{idx + 1}</span>
                              <span className="flex-1">{s.studentName}</span>
                              <span className="font-semibold">{s.score}/{s.max_marks}</span>
                              <span className="text-xs text-muted-foreground">({Math.round((s.score / s.max_marks) * 100)}%)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </motion.div>
                ))
              )}
            </div>

            {/* Rankings */}
            <div className="space-y-3">
              <Card className="shadow-card border-border/50">
                <div className="p-4 border-b border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-4 h-4 text-accent" />
                    <span className="font-display font-semibold text-sm">Rankings</span>
                  </div>
                  <Select value={selectedRankBatch} onValueChange={setSelectedRankBatch}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Batches</SelectItem>
                      {rankingBatches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {rankings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Medal className="w-7 h-7 mb-2" />
                    <p className="text-sm">No data yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40 max-h-80 overflow-y-auto">
                    {rankings.map((r, i) => (
                      <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${i === 0 ? "bg-primary-light/30" : ""}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border ${i < 3 ? medalColors[i] : "bg-muted text-muted-foreground border-border/40"}`}>
                          {i < 3 ? medals[i] : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{r.totalScore}/{r.totalMax} · {r.tests} tests</p>
                        </div>
                        <Badge className={`text-xs flex-shrink-0 ${r.pct >= 85 ? "bg-success-light text-success border-success/20" : r.pct >= 60 ? "bg-primary-light text-primary border-primary/20" : "bg-danger-light text-danger border-danger/20"}`}>
                          {r.pct}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
