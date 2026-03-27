import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Megaphone, Clock, Search, MessageCircle, Send, Loader2, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string | null;
  batch_id: string | null;
  posted_by_name: string | null;
  created_at: string;
  notify_push: boolean;
}

const typeColors: Record<string, string> = {
  test: "bg-primary-light text-primary border-primary/20",
  general: "bg-secondary text-secondary-foreground border-border/40",
  homework: "bg-accent-light text-accent border-accent/20",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h >= 48) return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (h >= 24) return "Yesterday";
  if (h >= 1) return `${h}h ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

export default function StudentAnnouncements() {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [doubtDialog, setDoubtDialog] = useState(false);
  const [doubtAnn, setDoubtAnn] = useState<Announcement | null>(null);
  const [doubtText, setDoubtText] = useState("");
  const [sendingDoubt, setSendingDoubt] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [batchId, setBatchId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      setUserName(profile?.full_name || "Student");

      const { data: enrollment } = await supabase
        .from("students_batches").select("batch_id").eq("student_id", user.id).limit(1).maybeSingle();
      if (enrollment) setBatchId(enrollment.batch_id);

      const { data: annData } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });

      setAnnouncements((annData || []) as Announcement[]);
      setLoading(false);
    };
    init();
  }, []);

  // Realtime subscription for new announcements
  useEffect(() => {
    const channel = supabase
      .channel("student-announcements-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          const newAnn = payload.new as Announcement;
          setAnnouncements(prev => {
            if (prev.some(a => a.id === newAnn.id)) return prev;
            // Show toast if it's a phone-alert announcement
            if (newAnn.notify_push) {
              toast({ title: "🔔 New Announcement", description: newAnn.title });
            }
            return [newAnn, ...prev];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [toast]);

  const handleAskDoubt = async () => {
    if (!doubtText.trim() || !doubtAnn || !batchId) return;
    setSendingDoubt(true);
    try {
      const { data: code } = await supabase.rpc("get_my_institute_code");
      const { error } = await supabase.from("batch_messages").insert({
        batch_id: batchId,
        institute_code: code!,
        sender_id: userId,
        sender_name: userName,
        sender_role: "student",
        message: `❓ Doubt about "${doubtAnn.title}":\n${doubtText.trim()}`,
      });
      if (error) throw error;
      toast({ title: "✅ Doubt sent!", description: "Your teacher will see it in the batch chat." });
      setDoubtText("");
      setDoubtDialog(false);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setSendingDoubt(false);
    }
  };

  const filtered = announcements.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    (a.posted_by_name || "").toLowerCase().includes(search.toLowerCase()) ||
    a.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout title="Announcements" role="student">
      <div className="space-y-5 max-w-2xl">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search announcements..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">No announcements yet</p>
            <p className="text-muted-foreground text-sm mt-1">Your teacher will post announcements here.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((ann, i) => (
              <motion.div key={ann.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-5 shadow-card border-border/50 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0">
                      <Megaphone className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <h3 className="font-display font-semibold text-sm">{ann.title}</h3>
                        {ann.type && (
                          <Badge className={`text-xs ${typeColors[ann.type] || typeColors.general}`}>
                            {ann.type.charAt(0).toUpperCase() + ann.type.slice(1)}
                          </Badge>
                        )}
                        {ann.notify_push && (
                          <Badge className="text-xs bg-accent-light text-accent border-accent/20 gap-1">
                            <Bell className="w-2.5 h-2.5" /> Important
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-3">{ann.content}</p>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(ann.created_at)}</span>
                          <span className="font-medium text-foreground/70">{ann.posted_by_name || "Teacher"}</span>
                        </div>
                        {batchId && (
                          <Dialog open={doubtDialog && doubtAnn?.id === ann.id}
                            onOpenChange={(open) => { if (!open) { setDoubtDialog(false); setDoubtAnn(null); setDoubtText(""); } }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary-light"
                                onClick={() => { setDoubtAnn(ann); setDoubtDialog(true); }}>
                                <MessageCircle className="w-3 h-3" /> Ask Doubt
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                              <DialogHeader>
                                <DialogTitle className="font-display">Ask a Doubt</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3 pt-1">
                                <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
                                  <p className="text-xs text-muted-foreground">About:</p>
                                  <p className="text-sm font-semibold">{ann.title}</p>
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Your Doubt</Label>
                                  <Textarea
                                    placeholder="Type your doubt here..."
                                    rows={4}
                                    value={doubtText}
                                    onChange={e => setDoubtText(e.target.value)}
                                  />
                                </div>
                                <Button className="w-full gradient-hero text-white border-0 hover:opacity-90 gap-2"
                                  onClick={handleAskDoubt} disabled={sendingDoubt || !doubtText.trim()}>
                                  {sendingDoubt ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</> : <><Send className="w-4 h-4" />Send to Batch Chat</>}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
