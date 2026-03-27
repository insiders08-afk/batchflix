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
import { Plus, Search, Trophy, CalendarDays, BookOpen, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Batch = Tables<"batches">;
type TestScore = Tables<"test_scores">;
type Profile = Tables<"profiles">;

interface TestGroup {
  test_name: string;
  batch_id: string;
  batchName: string;
  test_date: string;
  max_marks: number;
  scores: (TestScore & { studentName: string })[];
  avgScore: number;
}

export default function AdminTests() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [testGroups, setTestGroups] = useState<TestGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<TestGroup | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({ testName: "", batchId: "", maxMarks: "100", testDate: new Date().toISOString().split("T")[0] });
  const [scoreEntries, setScoreEntries] = useState<{ studentId: string; studentName: string; score: string }[]>([]);
  const [loadingScoreStudents, setLoadingScoreStudents] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [scoreRes, batchRes] = await Promise.all([
        supabase.from("test_scores").select("*").order("test_date", { ascending: false }),
        supabase.from("batches").select("*").eq("is_active", true).order("name"),
      ]);
      if (scoreRes.error) throw scoreRes.error;
      if (batchRes.error) throw batchRes.error;

      const allBatches = batchRes.data || [];
      setBatches(allBatches);

      const scores = scoreRes.data || [];

      // Fetch profiles for all unique student_ids
      const studentIds = [...new Set(scores.map(s => s.student_id))];
      let profileMap: Record<string, string> = {};
      if (studentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", studentIds);
        (profiles || []).forEach((p: Pick<Profile, "user_id" | "full_name">) => { profileMap[p.user_id] = p.full_name; });
      }

      // Group by test_name + batch_id
      const groups: Record<string, TestGroup> = {};
      scores.forEach(s => {
        const key = `${s.test_name}__${s.batch_id}`;
        if (!groups[key]) {
          const batch = allBatches.find(b => b.id === s.batch_id);
          groups[key] = {
            test_name: s.test_name,
            batch_id: s.batch_id,
            batchName: batch?.name || "Unknown",
            test_date: s.test_date,
            max_marks: s.max_marks,
            scores: [],
            avgScore: 0,
          };
        }
        groups[key].scores.push({ ...s, studentName: profileMap[s.student_id] || "Unknown" });
      });

      // Compute averages
      const groupList = Object.values(groups).map(g => ({
        ...g,
        avgScore: g.scores.length > 0
          ? Math.round(g.scores.reduce((sum, s) => sum + Number(s.score), 0) / g.scores.length)
          : 0,
      }));

      setTestGroups(groupList.sort((a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime()));
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load tests", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load students for score entry when batch selected in dialog
  useEffect(() => {
    if (!form.batchId) { setScoreEntries([]); return; }
    const load = async () => {
      setLoadingScoreStudents(true);
      const { data: enrollments } = await supabase
        .from("students_batches")
        .select("student_id")
        .eq("batch_id", form.batchId);
      const ids = (enrollments || []).map(e => e.student_id);
      let entries: { studentId: string; studentName: string; score: string }[] = [];
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", ids);
        entries = (profiles || []).map(p => ({ studentId: p.user_id, studentName: p.full_name, score: "" }));
      }
      setScoreEntries(entries);
      setLoadingScoreStudents(false);
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
      const instituteCode = await supabase.rpc("get_my_institute_code");
      const records = scoreEntries
        .filter(e => e.score !== "")
        .map(e => ({
          test_name: form.testName.trim(),
          batch_id: form.batchId,
          student_id: e.studentId,
          score: Number(e.score) || 0,
          max_marks: Number(form.maxMarks) || 100,
          test_date: form.testDate,
          institute_code: instituteCode.data!,
        }));

      if (records.length === 0) {
        toast({ title: "No scores entered", description: "Enter at least one score to save.", variant: "destructive" });
        setCreating(false);
        return;
      }

      const { error } = await supabase.from("test_scores").insert(records);
      if (error) throw error;

      toast({ title: "✅ Test scores saved!", description: `${records.length} scores recorded.` });
      setDialogOpen(false);
      setForm({ testName: "", batchId: "", maxMarks: "100", testDate: new Date().toISOString().split("T")[0] });
      setScoreEntries([]);
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const filtered = testGroups.filter(t =>
    t.test_name.toLowerCase().includes(search.toLowerCase()) ||
    t.batchName.toLowerCase().includes(search.toLowerCase())
  );

  const topPerformers = selectedTest
    ? [...(selectedTest.scores)].sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 5)
    : testGroups.flatMap(g => g.scores)
        .sort((a, b) => (Number(b.score) / Number(b.max_marks)) - (Number(a.score) / Number(a.max_marks)))
        .slice(0, 5);

  const rankColors = ["gradient-hero text-white", "bg-secondary text-foreground", "bg-accent-light text-accent"];

  return (
    <DashboardLayout title="Tests">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search tests..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
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
                    {loadingScoreStudents ? (
                      <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                    ) : scoreEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-3 text-center">No students enrolled in this batch yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {scoreEntries.map(e => (
                          <div key={e.studentId} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {e.studentName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </div>
                            <span className="text-sm flex-1">{e.studentName}</span>
                            <Input
                              type="number"
                              placeholder="Score"
                              className="w-20 h-8 text-sm"
                              value={e.score}
                              min={0}
                              max={Number(form.maxMarks)}
                              onChange={ev => setScoreEntries(prev => prev.map(s =>
                                s.studentId === e.studentId ? { ...s, score: ev.target.value } : s
                              ))}
                            />
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
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-3">
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">All Tests</h3>
              {filtered.length === 0 ? (
                <Card className="p-10 text-center shadow-card border-border/50">
                  <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No tests recorded yet</p>
                  <p className="text-muted-foreground text-sm mt-1">Click "Add Test Scores" to record your first test.</p>
                </Card>
              ) : (
                filtered.map((test, i) => (
                  <motion.div key={`${test.test_name}-${test.batch_id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="p-4 shadow-card border-border/50 hover:shadow-lg transition-shadow">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-semibold text-sm truncate">{test.test_name}</span>
                              <Badge className="text-xs bg-success-light text-success border-success/20">Completed</Badge>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />
                                {new Date(test.test_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                              <span>{test.batchName}</span>
                              <span>Max: {test.max_marks}</span>
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{test.scores.length} students</span>
                              <span className="text-success font-medium">Avg: {test.avgScore}/{test.max_marks}</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs flex-shrink-0"
                          onClick={() => setSelectedTest(selectedTest?.test_name === test.test_name && selectedTest?.batch_id === test.batch_id ? null : test)}
                        >
                          {selectedTest?.test_name === test.test_name && selectedTest?.batch_id === test.batch_id ? "Hide" : "View Results"}
                        </Button>
                      </div>

                      {selectedTest?.test_name === test.test_name && selectedTest?.batch_id === test.batch_id && (
                        <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                          {[...test.scores].sort((a, b) => Number(b.score) - Number(a.score)).map((s, idx) => (
                            <div key={s.id} className="flex items-center gap-3 text-sm">
                              <span className="text-xs text-muted-foreground w-5 text-center font-bold">{idx + 1}</span>
                              <span className="flex-1">{s.studentName}</span>
                              <span className="font-semibold">{s.score}/{s.max_marks}</span>
                              <span className="text-xs text-muted-foreground">({Math.round((Number(s.score) / Number(s.max_marks)) * 100)}%)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </motion.div>
                ))
              )}
            </div>

            {/* Leaderboard */}
            <div>
              <Card className="shadow-card border-border/50">
                <div className="p-4 border-b border-border/50 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-accent" />
                  <span className="font-display font-semibold text-sm">Top Performers</span>
                  <Badge variant="secondary" className="ml-auto text-xs">All Tests</Badge>
                </div>
                {topPerformers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Trophy className="w-7 h-7 mb-2" />
                    <p className="text-sm">No data yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {topPerformers.map((r, i) => (
                      <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${i === 0 ? "bg-primary-light/40" : ""}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < 3 ? rankColors[i] : "bg-muted text-muted-foreground"}`}>
                          {i < 3 ? (i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉") : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.studentName}</p>
                          <p className="text-xs text-muted-foreground">{Math.round((Number(r.score) / Number(r.max_marks)) * 100)}%</p>
                        </div>
                        <span className="text-sm font-bold tabular-nums">{r.score}</span>
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
