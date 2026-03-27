import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Mail, BookOpen, Search, GraduationCap, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

interface StudentWithBatch extends Profile {
  batchNames: string[];
  attendancePct: number | null;
  perBatchAttendance: Record<string, { total: number; present: number }>;
}

const PAGE_SIZE = 20;

export default function AdminStudents() {
  const { toast } = useToast();
  const [students, setStudents] = useState<StudentWithBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentWithBatch | null>(null);
  const [instituteCodeState, setInstituteCodeState] = useState("");

  useEffect(() => {
    fetchStudents(0, true);
  }, []);

  const enrichProfiles = async (profiles: Profile[], instituteCode: string): Promise<StudentWithBatch[]> => {
    const studentIds = profiles.map(p => p.user_id);
    let enrollments: { student_id: string; batch_id: string; batches: { name: string } | null }[] = [];
    let attendanceData: { student_id: string; batch_id: string; present: boolean }[] = [];
    if (studentIds.length > 0) {
      const [eRes, aRes] = await Promise.all([
        supabase.from("students_batches").select("student_id, batch_id, batches(name)").in("student_id", studentIds),
        supabase.from("attendance").select("student_id, batch_id, present").in("student_id", studentIds),
      ]);
      enrollments = eRes.data || [];
      attendanceData = aRes.data || [];
    }

    const batchMap: Record<string, string[]> = {};
    enrollments.forEach(e => {
      if (!batchMap[e.student_id]) batchMap[e.student_id] = [];
      const batchName = (e.batches as { name: string } | null)?.name;
      if (batchName) batchMap[e.student_id].push(batchName);
    });

    const attendanceMap: Record<string, Record<string, { total: number; present: number }>> = {};
    attendanceData.forEach(a => {
      if (!attendanceMap[a.student_id]) attendanceMap[a.student_id] = {};
      if (!attendanceMap[a.student_id][a.batch_id]) attendanceMap[a.student_id][a.batch_id] = { total: 0, present: 0 };
      attendanceMap[a.student_id][a.batch_id].total++;
      if (a.present) attendanceMap[a.student_id][a.batch_id].present++;
    });

    const overallAttendance: Record<string, number> = {};
    Object.entries(attendanceMap).forEach(([sid, batches]) => {
      let totalAll = 0, presentAll = 0;
      Object.values(batches).forEach(b => { totalAll += b.total; presentAll += b.present; });
      overallAttendance[sid] = totalAll > 0 ? Math.round((presentAll / totalAll) * 100) : -1;
    });

    return profiles.map(s => {
      const attendancePct = overallAttendance[s.user_id] ?? -1;
      return {
        ...s,
        batchNames: batchMap[s.user_id] || [],
        attendancePct: attendancePct !== -1 ? attendancePct : null,
        perBatchAttendance: attendanceMap[s.user_id] || {},
      };
    });
  };

  const fetchStudents = async (pageNum: number, reset = false) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const { data: codeData } = await supabase.rpc("get_my_institute_code");
      const code = codeData || "";
      if (!code) return;
      if (reset) setInstituteCodeState(code);

      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: profiles, error, count } = await supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .eq("institute_code", code)
        .eq("role", "student")
        .order("full_name")
        .range(from, to);

      if (error) throw error;

      const enriched = await enrichProfiles(profiles || [], code);

      if (reset) {
        setStudents(enriched);
      } else {
        setStudents(prev => [...prev, ...enriched]);
      }

      const total = count ?? 0;
      setTotalCount(total);
      setHasMore(from + PAGE_SIZE < total);
      setPage(pageNum);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load students", variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => fetchStudents(page + 1);

  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email || "").toLowerCase().includes(search.toLowerCase()) ||
    s.batchNames.join(" ").toLowerCase().includes(search.toLowerCase()) ||
    ((s as unknown as Record<string, unknown>).role_based_code as string || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (status: string) => {
    if (status === "approved" || status === "active") return "bg-success-light text-success border-success/20";
    if (status === "pending") return "bg-accent-light text-accent border-accent/20";
    return "bg-danger-light text-danger border-danger/20";
  };

  return (
    <DashboardLayout title="Students">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{students.length}{totalCount > students.length ? ` of ${totalCount}` : ""} students</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">No students yet</p>
            <p className="text-muted-foreground text-sm mt-1">Students will appear here once they register and are approved.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filtered.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card
                  className="p-4 shadow-card border-border/50 hover:shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer"
                  onClick={() => setSelectedStudent(s)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {s.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{s.full_name}</p>
                      {(s as unknown as Record<string, unknown>).role_based_code ? (
                        <p className="text-xs font-mono text-primary font-medium truncate">
                          {(s as unknown as Record<string, unknown>).role_based_code as string}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                      )}
                    </div>
                    <Badge className={`text-xs flex-shrink-0 ${statusColor(s.status)}`}>
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <BookOpen className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{s.batchNames.length > 0 ? s.batchNames.join(", ") : "No batch assigned"}</span>
                    </div>
                    {s.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        <span>{s.phone}</span>
                      </div>
                    )}
                  </div>

                  {s.attendancePct !== null && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Attendance</span>
                        <span className={`text-xs font-semibold ${s.attendancePct >= 75 ? "text-success" : "text-danger"}`}>
                          {s.attendancePct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${s.attendancePct >= 75 ? "bg-success" : "bg-danger"}`}
                          style={{ width: `${s.attendancePct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="gap-2 h-9 px-6"
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loadingMore ? "Loading..." : `Load More (${totalCount - students.length} remaining)`}
            </Button>
          </div>
        )}
      </div>

      {/* Student detail dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={() => setSelectedStudent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Student Profile</DialogTitle>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-4">
                 <div className="w-14 h-14 rounded-full gradient-hero flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                   {selectedStudent.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                 </div>
                 <div>
                   <p className="font-semibold text-base">{selectedStudent.full_name}</p>
                   {(selectedStudent as unknown as Record<string, unknown>).role_based_code && (
                     <p className="text-xs font-mono text-primary font-semibold mt-0.5">
                       ID: {(selectedStudent as unknown as Record<string, unknown>).role_based_code as string}
                     </p>
                   )}
                   <Badge className={`text-xs mt-1 ${statusColor(selectedStudent.status)}`}>
                     {selectedStudent.status}
                   </Badge>
                 </div>
               </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 rounded-lg bg-muted/40 space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" /> {selectedStudent.email}
                  </p>
                </div>
                {selectedStudent.phone && (
                  <div className="p-3 rounded-lg bg-muted/40 space-y-1">
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" /> {selectedStudent.phone}
                    </p>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-muted/40 space-y-1">
                  <Label className="text-xs text-muted-foreground">Enrolled Batches</Label>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                    {selectedStudent.batchNames.length > 0 ? selectedStudent.batchNames.join(", ") : "None"}
                  </p>
                </div>
                {selectedStudent.attendancePct !== null && (
                  <div className="p-3 rounded-lg bg-muted/40 space-y-2">
                    <Label className="text-xs text-muted-foreground">Overall Attendance</Label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${selectedStudent.attendancePct >= 75 ? "bg-success" : "bg-danger"}`}
                          style={{ width: `${selectedStudent.attendancePct}%` }}
                        />
                      </div>
                      <span className={`text-sm font-bold ${selectedStudent.attendancePct >= 75 ? "text-success" : "text-danger"}`}>
                        {selectedStudent.attendancePct}%
                      </span>
                    </div>
                    {/* Fix #26: Per-batch attendance breakdown */}
                    {Object.keys(selectedStudent.perBatchAttendance).length > 0 && (
                      <div className="mt-2 space-y-1.5 pt-2 border-t border-border/30">
                        <p className="text-xs text-muted-foreground font-medium">Per-Batch Breakdown</p>
                        {selectedStudent.batchNames.map((batchName, idx) => {
                          const batchEntries = Object.entries(selectedStudent.perBatchAttendance) as [string, { total: number; present: number }][];
                          const entry = batchEntries[idx];
                          if (!entry) return null;
                          const [, stats] = entry;
                          const pct = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
                          return (
                            <div key={batchName} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate max-w-[60%]">{batchName}</span>
                              <span className={`font-semibold ${pct >= 75 ? "text-success" : "text-danger"}`}>
                                {pct}% ({stats.present}/{stats.total})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
