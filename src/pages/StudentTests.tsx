import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, BookOpen, Medal, CalendarDays, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Batch { id: string; name: string; }
interface TestScore {
  id: string;
  test_name: string;
  test_date: string;
  score: number;
  max_marks: number;
  batch_id: string;
}
interface RankEntry {
  student_id: string;
  studentName: string;
  totalScore: number;
  totalMax: number;
  pct: number;
  tests: number;
  isMe: boolean;
}

const medals = ["🥇", "🥈", "🥉"];
const medalColors = ["bg-yellow-400/20 text-yellow-600 border-yellow-300", "bg-gray-200 text-gray-600 border-gray-300", "bg-amber-100 text-amber-700 border-amber-200"];

export default function StudentTests() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [scores, setScores] = useState<TestScore[]>([]);
  const [rankings, setRankings] = useState<RankEntry[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [myRank, setMyRank] = useState<number | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      // Get enrolled batches
      const { data: enrollments } = await supabase
        .from("students_batches").select("batch_id").eq("student_id", user.id);
      const batchIds = (enrollments || []).map(e => e.batch_id);

      if (batchIds.length === 0) { setLoading(false); return; }

      const { data: batchData } = await supabase.from("batches").select("id, name").in("id", batchIds);
      setBatches((batchData || []) as Batch[]);
      const firstBatch = batchData?.[0]?.id || "";
      setSelectedBatch(firstBatch);

      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedBatch || !userId) return;
    const loadBatch = async () => {
      // My scores in this batch
      const { data: myScores } = await supabase
        .from("test_scores")
        .select("*")
        .eq("batch_id", selectedBatch)
        .eq("student_id", userId)
        .order("test_date", { ascending: false });
      setScores((myScores || []) as TestScore[]);

      // All scores in this batch for ranking
      const { data: allScores } = await supabase
        .from("test_scores")
        .select("*")
        .eq("batch_id", selectedBatch);

      // Get profiles for all unique students
      const studentIds = [...new Set((allScores || []).map(s => s.student_id))];
      let profileMap: Record<string, string> = {};
      if (studentIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds);
        (profiles || []).forEach(p => { profileMap[p.user_id] = p.full_name; });
      }

      const studentTotals: Record<string, { name: string; totalScore: number; totalMax: number; tests: number }> = {};
      (allScores || []).forEach(s => {
        if (!studentTotals[s.student_id]) studentTotals[s.student_id] = { name: profileMap[s.student_id] || "Unknown", totalScore: 0, totalMax: 0, tests: 0 };
        studentTotals[s.student_id].totalScore += Number(s.score);
        studentTotals[s.student_id].totalMax += Number(s.max_marks);
        studentTotals[s.student_id].tests++;
      });

      const rankList: RankEntry[] = Object.entries(studentTotals)
        .map(([id, v]) => ({ student_id: id, studentName: v.name, totalScore: v.totalScore, totalMax: v.totalMax, pct: v.totalMax > 0 ? Math.round((v.totalScore / v.totalMax) * 100) : 0, tests: v.tests, isMe: id === userId }))
        .sort((a, b) => b.pct - a.pct);

      setRankings(rankList);
      const myIdx = rankList.findIndex(r => r.student_id === userId);
      setMyRank(myIdx >= 0 ? myIdx + 1 : null);
    };
    loadBatch();
  }, [selectedBatch, userId]);

  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const totalMax = scores.reduce((sum, s) => sum + s.max_marks, 0);
  const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  if (loading) return (
    <DashboardLayout title="Tests & Scores" role="student">
      <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title="Tests & Scores" role="student">
      <div className="space-y-5 max-w-3xl">
        {batches.length > 1 && (
          <Select value={selectedBatch} onValueChange={setSelectedBatch}>
            <SelectTrigger className="w-full sm:w-56 h-9">
              <SelectValue placeholder="Select batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Tests Taken", value: scores.length, color: "text-foreground" },
            { label: "Overall Score", value: totalMax > 0 ? `${totalScore}/${totalMax}` : "—", color: "text-primary" },
            { label: "My Rank", value: myRank ? `#${myRank}` : "—", color: "text-accent" },
          ].map(s => (
            <Card key={s.label} className="p-4 text-center shadow-card border-border/50">
              <div className={`text-xl font-display font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Overall progress */}
        {scores.length > 0 && (
          <Card className="p-4 shadow-card border-border/50">
            <div className="flex justify-between text-sm mb-2">
              <span className="flex items-center gap-1.5 font-medium">
                <TrendingUp className="w-4 h-4 text-primary" /> Overall Performance
              </span>
              <span className={`font-bold ${overallPct >= 75 ? "text-success" : overallPct >= 50 ? "text-warning" : "text-danger"}`}>{overallPct}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${overallPct}%` }}
                transition={{ duration: 0.8 }}
                className={`h-full rounded-full ${overallPct >= 75 ? "bg-success" : overallPct >= 50 ? "bg-warning" : "bg-danger"}`}
              />
            </div>
          </Card>
        )}

        <Tabs defaultValue="scores">
          <TabsList className="h-9">
            <TabsTrigger value="scores" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" />My Scores</TabsTrigger>
            <TabsTrigger value="rankings" className="gap-1.5"><Trophy className="w-3.5 h-3.5" />Rankings</TabsTrigger>
          </TabsList>

          <TabsContent value="scores" className="mt-4 space-y-3">
            {scores.length === 0 ? (
              <Card className="p-10 text-center shadow-card border-border/50">
                <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">No test scores yet</p>
                <p className="text-muted-foreground text-sm mt-1">Your teacher hasn't entered any scores yet.</p>
              </Card>
            ) : (
              scores.map((s, i) => {
                const pct = Math.round((s.score / s.max_marks) * 100);
                return (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Card className="p-4 shadow-card border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="font-semibold text-sm truncate">{s.test_name}</p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-display font-bold text-sm">{s.score}<span className="text-muted-foreground text-xs">/{s.max_marks}</span></span>
                              <Badge className={`text-xs ${pct >= 75 ? "bg-success-light text-success border-success/20" : pct >= 50 ? "bg-primary-light text-primary border-primary/20" : "bg-danger-light text-danger border-danger/20"}`}>
                                {pct}%
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="w-3 h-3" />
                              {new Date(s.test_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </div>
                          <div className="w-full h-1 bg-muted rounded-full mt-2">
                            <div className={`h-full rounded-full ${pct >= 75 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger"}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="rankings" className="mt-4">
            <Card className="shadow-card border-border/50">
              <div className="p-4 border-b border-border/50 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-accent" />
                <span className="font-display font-semibold text-sm">Batch Rankings</span>
                {myRank && (
                  <Badge className="ml-auto text-xs bg-primary-light text-primary border-primary/20">
                    You are #{myRank}
                  </Badge>
                )}
              </div>
              {rankings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Medal className="w-7 h-7 mb-2" />
                  <p className="text-sm">No data yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {rankings.map((r, i) => (
                    <div key={r.student_id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${r.isMe ? "bg-primary-light/30 border-l-2 border-primary" : ""}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border ${i < 3 ? medalColors[i] : "bg-muted text-muted-foreground border-border/40"}`}>
                        {i < 3 ? medals[i] : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${r.isMe ? "text-primary font-bold" : ""}`}>
                          {r.studentName} {r.isMe && <span className="text-xs">(You)</span>}
                        </p>
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
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
