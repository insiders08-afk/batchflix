import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Megaphone, Clock, Users, Loader2, Trash2, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string | null;
  batch_id: string | null;
  posted_by: string;
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

export default function TeacherAnnouncements() {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [form, setForm] = useState({ title: "", content: "", batchId: "all", type: "general", notifyPush: false });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const [annRes, batchRes] = await Promise.all([
        supabase.from("announcements").select("*").order("created_at", { ascending: false }),
        supabase.from("batches").select("id, name").eq("teacher_id", user.id).eq("is_active", true).order("name"),
      ]);

      setAnnouncements((annRes.data || []) as Announcement[]);
      setBatches(batchRes.data || []);
      setLoading(false);
    };
    init();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("teacher-announcements-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          setAnnouncements(prev => {
            if (prev.some(a => a.id === (payload.new as Announcement).id)) return prev;
            return [payload.new as Announcement, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "announcements" },
        (payload) => {
          setAnnouncements(prev => prev.filter(a => a.id !== (payload.old as { id: string }).id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handlePost = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast({ title: "Missing fields", description: "Title and content are required.", variant: "destructive" });
      return;
    }
    setPosting(true);
    try {
      const { data: code } = await supabase.rpc("get_my_institute_code");
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("announcements").insert({
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
        batch_id: form.batchId !== "all" ? form.batchId : null,
        institute_code: code!,
        posted_by: userId,
        posted_by_name: profile?.full_name || "Teacher",
        notify_push: form.notifyPush,
      } as any);
      if (error) throw error;

      // Push notifications now handled server-side via DB trigger (trigger_announcement_push)
      // No client-side fetch needed — reliable regardless of network/tab state

      toast({ title: form.notifyPush ? "✅ Announcement posted with phone alert!" : "✅ Announcement posted!" });
      setForm({ title: "", content: "", batchId: "all", type: "general", notifyPush: false });
      setDialogOpen(false);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (!error) {
      toast({ title: "Announcement deleted" });
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    }
  };

  const getBatchName = (batchId: string | null) => {
    if (!batchId) return "All Batches";
    return batches.find(b => b.id === batchId)?.name || "Unknown";
  };

  const filtered = announcements.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    (a.posted_by_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout title="Announcements" role="teacher">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search announcements..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2">
                <Plus className="w-4 h-4" /> New Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">Post Announcement</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input placeholder="Announcement title..." value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Batch</Label>
                    <Select value={form.batchId} onValueChange={v => setForm({ ...form, batchId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All My Batches</SelectItem>
                        {batches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="homework">Homework</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Content</Label>
                  <Textarea placeholder="Write your announcement..." rows={4} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
                </div>
                {/* Notify Push toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="flex items-center gap-2.5">
                    <Bell className="w-4 h-4 text-accent" />
                    <div>
                      <p className="text-sm font-medium">Alert students on phone</p>
                      <p className="text-xs text-muted-foreground">Send a mobile notification for this announcement</p>
                    </div>
                  </div>
                  <Switch
                    checked={form.notifyPush}
                    onCheckedChange={v => setForm({ ...form, notifyPush: v })}
                  />
                </div>
                <Button className="w-full gradient-hero text-white border-0 shadow-primary hover:opacity-90" onClick={handlePost} disabled={posting}>
                  {posting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Posting...</> : "Post Announcement"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">No announcements yet</p>
            <p className="text-muted-foreground text-sm mt-1">Post your first announcement to your batches.</p>
          </Card>
        ) : (
          <div className="space-y-4 max-w-3xl">
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
                            <Bell className="w-2.5 h-2.5" /> Alerted
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-3">{ann.content}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{getBatchName(ann.batch_id)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(ann.created_at)}</span>
                        <span className="font-medium text-foreground/70">{ann.posted_by_name || "Teacher"}</span>
                      </div>
                    </div>
                    {ann.posted_by === userId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-danger flex-shrink-0"
                        onClick={() => handleDelete(ann.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
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
