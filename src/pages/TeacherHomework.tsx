import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, BookOpen, FileText, Paperclip, Loader2, Trash2, ExternalLink, CalendarDays, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Homework {
  id: string;
  title: string;
  description: string | null;
  type: string;
  batch_id: string;
  teacher_id: string;
  teacher_name: string | null;
  file_url: string | null;
  file_name: string | null;
  due_date: string | null;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h >= 48) return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (h >= 24) return "Yesterday";
  if (h >= 1) return `${h}h ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

export default function TeacherHomework() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"homework" | "dpp">("homework");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ title: "", description: "", batchId: "", type: "homework", dueDate: "" });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      setUserName(profile?.full_name || "Teacher");

      const [hwRes, batchRes, subRes] = await Promise.all([
        supabase.from("homeworks").select("*").order("created_at", { ascending: false }),
        supabase.from("batches").select("id, name").eq("teacher_id", user.id).eq("is_active", true).order("name"),
        supabase.from("homework_submissions").select("homework_id"),
      ]);

      setHomeworks((hwRes.data || []) as Homework[]);
      setBatches(batchRes.data || []);
      // Count submissions per homework
      const counts: Record<string, number> = {};
      (subRes.data || []).forEach(s => { counts[s.homework_id] = (counts[s.homework_id] || 0) + 1; });
      setSubmissionCounts(counts);
      setLoading(false);
    };
    init();
  }, []);

  const refetch = async () => {
    const { data } = await supabase.from("homeworks").select("*").order("created_at", { ascending: false });
    setHomeworks((data || []) as Homework[]);
  };

  const handlePost = async () => {
    if (!form.title.trim() || !form.batchId) {
      toast({ title: "Missing fields", description: "Title and batch are required.", variant: "destructive" });
      return;
    }
    setPosting(true);
    try {
      const { data: code } = await supabase.rpc("get_my_institute_code");

      let fileUrl: string | null = null;
      let fileName: string | null = null;

      if (selectedFile) {
        setUploading(true);
        const ext = selectedFile.name.split(".").pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("homework-files")
          .upload(path, selectedFile, { contentType: selectedFile.type });
        setUploading(false);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("homework-files").getPublicUrl(uploadData.path);
        fileUrl = urlData.publicUrl;
        fileName = selectedFile.name;
      }

      const { error } = await supabase.from("homeworks").insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        batch_id: form.batchId,
        institute_code: code!,
        teacher_id: userId,
        teacher_name: userName,
        due_date: form.dueDate || null,
        file_url: fileUrl,
        file_name: fileName,
      });
      if (error) throw error;

      toast({ title: `✅ ${form.type === "dpp" ? "DPP" : "Homework"} posted!` });
      setForm({ title: "", description: "", batchId: "", type: activeTab, dueDate: "" });
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setDialogOpen(false);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (hw: Homework) => {
    if (hw.file_url) {
      const path = hw.file_url.split("/homework-files/")[1];
      if (path) await supabase.storage.from("homework-files").remove([path]);
    }
    await supabase.from("homeworks").delete().eq("id", hw.id);
    toast({ title: "Deleted" });
    setHomeworks(prev => prev.filter(h => h.id !== hw.id));
  };

  const getBatchName = (batchId: string) => batches.find(b => b.id === batchId)?.name || "Unknown";

  const filtered = homeworks.filter(h => h.type === activeTab);

  return (
    <DashboardLayout title="Homework / DPP" role="teacher">
      <div className="space-y-5 max-w-3xl">
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "homework" | "dpp")}>
            <TabsList className="h-9">
              <TabsTrigger value="homework" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" />Homework</TabsTrigger>
              <TabsTrigger value="dpp" className="gap-1.5"><FileText className="w-3.5 h-3.5" />DPP</TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (open) setForm(f => ({ ...f, type: activeTab }));
          }}>
            <DialogTrigger asChild>
              <Button className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2">
                <Plus className="w-4 h-4" /> Post {activeTab === "dpp" ? "DPP" : "Homework"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">
                  Post {form.type === "dpp" ? "DPP" : "Homework"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="homework">Homework</SelectItem>
                        <SelectItem value="dpp">DPP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Batch</Label>
                    <Select value={form.batchId} onValueChange={v => setForm({ ...form, batchId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                      <SelectContent>
                        {batches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input placeholder="e.g. Chapter 5 – Laws of Motion" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
                  <Textarea placeholder="Instructions or notes..." rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date <span className="text-muted-foreground">(optional)</span></Label>
                  <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" />Attach File <span className="text-muted-foreground">(PDF or image)</span></Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-xs file:font-medium file:bg-secondary file:text-foreground hover:file:bg-muted cursor-pointer"
                    onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  {selectedFile && <p className="text-xs text-muted-foreground mt-1">Selected: {selectedFile.name}</p>}
                </div>
                <Button className="w-full gradient-hero text-white border-0 shadow-primary hover:opacity-90" onClick={handlePost} disabled={posting || uploading}>
                  {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
                    : posting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Posting...</>
                    : `Post ${form.type === "dpp" ? "DPP" : "Homework"}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center shadow-card border-border/50">
            {activeTab === "dpp" ? <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" /> : <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />}
            <p className="font-semibold">No {activeTab === "dpp" ? "DPPs" : "homework"} posted yet</p>
            <p className="text-muted-foreground text-sm mt-1">Click the button above to post the first one.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((hw, i) => (
              <motion.div key={hw.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-5 shadow-card border-border/50 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0">
                      {hw.type === "dpp" ? <FileText className="w-4 h-4 text-white" /> : <BookOpen className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">{hw.title}</h3>
                        <Badge className="text-xs bg-primary-light text-primary border-primary/20">
                          {getBatchName(hw.batch_id)}
                        </Badge>
                        {submissionCounts[hw.id] > 0 && (
                          <Badge className="text-xs bg-success-light text-success border-success/20 gap-1">
                            ✅ {submissionCounts[hw.id]} submitted
                          </Badge>
                        )}
                      </div>
                      {hw.description && <p className="text-sm text-muted-foreground mb-2">{hw.description}</p>}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(hw.created_at)}</span>
                        {hw.due_date && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Due: {new Date(hw.due_date).toLocaleDateString("en-IN")}</span>}
                        {hw.file_name && (
                          <a href={hw.file_url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                            <Paperclip className="w-3 h-3" />{hw.file_name} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                    {hw.teacher_id === userId && (
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-danger flex-shrink-0"
                        onClick={() => handleDelete(hw)}>
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
