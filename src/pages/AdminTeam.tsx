import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, GraduationCap, Phone, Mail, BookOpen, Users, Loader2, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

export default function AdminTeam() {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [coAdmins, setCoAdmins] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const instituteCode = await supabase.rpc("get_my_institute_code");
      if (!instituteCode.data) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("institute_code", instituteCode.data)
        .in("role", ["teacher", "admin"])
        .order("full_name");

      if (error) throw error;

      // Get owner user_id to exclude them from co-admin list
      const { data: { user } } = await supabase.auth.getUser();

      const teacherList = (data || []).filter(p => p.role === "teacher");
      // Co-admins: admins who are NOT the current owner
      const coAdminList = (data || []).filter(p => p.role === "admin" && p.user_id !== user?.id);

      setTeachers(teacherList);
      setCoAdmins(coAdminList);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load team", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status: string) => {
    if (status === "approved" || status === "active") return "bg-success-light text-success border-success/20";
    if (status === "pending") return "bg-accent-light text-accent border-accent/20";
    return "bg-danger-light text-danger border-danger/20";
  };

  const MemberCard = ({ member, i }: { member: Profile; i: number }) => {
    const roleCode = (member as unknown as Record<string, unknown>).role_based_code as string | undefined;
    return (
      <motion.div key={member.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
        <Card className="p-4 shadow-card border-border/50 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {member.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{member.full_name}</p>
              {roleCode ? (
                <p className="text-xs font-mono text-primary font-medium truncate">{roleCode}</p>
              ) : (
                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
              )}
            </div>
            <Badge className={`text-xs flex-shrink-0 ${statusColor(member.status)}`}>
              {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {member.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="w-3 h-3 flex-shrink-0" /><span>{member.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{member.email}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BookOpen className="w-3 h-3 flex-shrink-0" />
              <span className="capitalize">{member.role === "teacher" ? "Teacher" : "Co-Admin"}</span>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  };

  const filteredTeachers = teachers.filter(t =>
    t.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (t.email || "").toLowerCase().includes(search.toLowerCase()) ||
    ((t as unknown as Record<string, unknown>).role_based_code as string || "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredCoAdmins = coAdmins.filter(t =>
    t.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (t.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout title="Team">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search team members..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><GraduationCap className="w-4 h-4" />{teachers.length} teachers</span>
            <span className="flex items-center gap-1.5"><UserCog className="w-4 h-4" />{coAdmins.length} co-admins</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="teachers">
            <TabsList className="mb-5">
              <TabsTrigger value="teachers">
                <GraduationCap className="w-4 h-4 mr-1.5" />
                Teachers ({teachers.length})
              </TabsTrigger>
              <TabsTrigger value="coadmins">
                <UserCog className="w-4 h-4 mr-1.5" />
                Co-Admins ({coAdmins.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="teachers">
              {filteredTeachers.length === 0 ? (
                <Card className="p-10 text-center shadow-card border-border/50">
                  <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No teachers yet</p>
                  <p className="text-muted-foreground text-sm mt-1">Teachers who register with your institute code will appear here after approval.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {filteredTeachers.map((t, i) => <MemberCard key={t.id} member={t} i={i} />)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="coadmins">
              {filteredCoAdmins.length === 0 ? (
                <Card className="p-10 text-center shadow-card border-border/50">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No co-admins yet</p>
                  <p className="text-muted-foreground text-sm mt-1">Co-admins (receptionists, helpers) who register as admin with your institute code will appear here.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {filteredCoAdmins.map((t, i) => <MemberCard key={t.id} member={t} i={i} />)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
