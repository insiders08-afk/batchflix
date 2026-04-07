import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  MessageSquare,
  Megaphone,
  CalendarCheck,
  FlaskConical,
  BookOpen,
  Trophy,
  ArrowLeft,
  Send,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Loader2,
  Star,
  Bell,
  Paperclip,
  FileText,
  Image,
  X,
  Download,
  BookMarked,
  Eye,
  Link as LinkIcon,
  ThumbsUp,
  ThumbsDown,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sendPushNotification, getBatchStudentIds } from "@/lib/pushNotifications";

interface BatchInfo {
  id: string;
  name: string;
  course: string;
  teacher_name: string | null;
  teacher_id: string | null;
  institute_code: string;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  isSelf?: boolean;
  reply_to_id?: string | null;
  reactions?: Record<string, string[]>; // emoji -> user_ids[]
}

interface Student {
  id: string;
  user_id: string;
  full_name: string;
  present?: boolean;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  posted_by_name: string | null;
  created_at: string;
  type: string | null;
  notify_push?: boolean;
}

interface TestScore {
  id: string;
  test_name: string;
  test_date: string;
  score: number;
  max_marks: number;
  student_id: string;
}

const MAX_FILE_SIZE_MB = 10;

export default function BatchWorkspace() {
  const { id: batchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track whether we have done the initial scroll-to-bottom after first load
  const initialScrollDone = useRef(false);
  // Track pending image loads that may shift layout
  const pendingImages = useRef(0);

  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("student");
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  // Default true: until we scroll to bottom for the first time, show the button
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Attendance
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annDialog, setAnnDialog] = useState(false);
  const [newAnn, setNewAnn] = useState({ title: "", content: "", type: "general", notifyPush: false });
  const [savingAnn, setSavingAnn] = useState(false);

  // Tests
  const [tests, setTests] = useState<TestScore[]>([]);

  // DPP / Homework
  const [dppItems, setDppItems] = useState<
    {
      id: string;
      title: string;
      description: string | null;
      file_url: string | null;
      file_name: string | null;
      link_url: string | null;
      posted_by_name: string;
      created_at: string;
    }[]
  >([]);
  const [dppDialog, setDppDialog] = useState(false);
  const [newDpp, setNewDpp] = useState({ title: "", description: "", link_url: "" });
  const [savingDpp, setSavingDpp] = useState(false);
  const [dppFile, setDppFile] = useState<File | null>(null);
  const dppFileRef = useRef<HTMLInputElement>(null);

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  // Load initial data
  useEffect(() => {
    if (!batchId) return;
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setCurrentUserName(profile.full_name);
        setCurrentUserRole(profile.role);
      }

      // Batch info
      const { data: batchData } = await supabase.from("batches").select("*").eq("id", batchId).single();
      if (batchData) setBatch(batchData);

      // Student count
      const { count } = await supabase
        .from("students_batches")
        .select("id", { count: "exact" })
        .eq("batch_id", batchId);
      setStudentCount(count || 0);

      // Chat messages — fetch oldest-first for chronological display
      const { data: msgs } = await supabase
        .from("batch_messages")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (msgs) {
        setMessages(
          msgs.map((m) => ({
            ...m,
            reactions: (m.reactions ?? {}) as Record<string, string[]>,
            isSelf: m.sender_id === user.id,
          })),
        );
      }

      // Enrolled students
      const { data: enrollments } = await supabase
        .from("students_batches")
        .select("student_id")
        .eq("batch_id", batchId);

      if (enrollments && enrollments.length > 0) {
        const ids = enrollments.map((e) => e.student_id);
        const { data: studentProfiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", ids);
        const mapped = (studentProfiles || []).map((s) => ({
          id: s.user_id,
          user_id: s.user_id,
          full_name: s.full_name,
        }));
        setStudents(mapped);

        // LIMIT-07 fix: Load existing attendance for today instead of defaulting to all absent
        const today = new Date().toISOString().split("T")[0];
        const { data: todayAtt } = await supabase
          .from("attendance")
          .select("student_id, present")
          .eq("batch_id", batchId)
          .eq("date", today)
          .in("student_id", ids);

        const attMap: Record<string, boolean> = {};
        // Default all to false, then override with DB records
        mapped.forEach((s) => {
          attMap[s.id] = false;
        });
        (todayAtt || []).forEach((a) => {
          attMap[a.student_id] = a.present;
        });
        setAttendance(attMap);
      }

      // Announcements
      const { data: anns } = await supabase
        .from("announcements")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: false });
      setAnnouncements(anns || []);

      // Tests
      const { data: testData } = await supabase
        .from("test_scores")
        .select("*")
        .eq("batch_id", batchId)
        .order("test_date", { ascending: false });
      setTests(testData || []);

      // DPP / Homework
      const { data: dppData } = await supabase
        .from("homeworks")
        .select("id, title, description, file_url, file_name, link_url, teacher_name, created_at")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: false });
      setDppItems((dppData || []).map((d) => ({ ...d, posted_by_name: d.teacher_name ?? "" })));

      setLoading(false);
    };
    init();
  }, [batchId]);

  // Realtime chat subscription
  useEffect(() => {
    if (!batchId) return;
    const channel = supabase
      .channel(`batch-chat-${batchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "batch_messages", filter: `batch_id=eq.${batchId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [
              ...prev,
              {
                ...msg,
                reactions: (msg.reactions ?? {}) as Record<string, string[]>,
                isSelf: msg.sender_id === currentUserId,
              },
            ];
          });
        },
      )
      // UX-04 fix: subscribe to UPDATE events so reactions sync in real-time
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "batch_messages", filter: `batch_id=eq.${batchId}` },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, reactions: (updated.reactions ?? {}) as Record<string, string[]>, message: updated.message }
                : m,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, currentUserId]);

  // Realtime announcements subscription
  useEffect(() => {
    if (!batchId) return;
    const channel = supabase
      .channel(`batch-announcements-${batchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements", filter: `batch_id=eq.${batchId}` },
        (payload) => {
          const ann = payload.new as Announcement;
          setAnnouncements((prev) => {
            if (prev.some((a) => a.id === ann.id)) return prev;
            return [ann, ...prev];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId]);

  // Core scroll helper
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    // Also check button state after scrolling
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollDown(distFromBottom > 100);
  }, []);

  // After messages load for the first time, do a hard instant scroll to bottom.
  // We also set up a ResizeObserver so that if images load and push the height
  // down, we keep scrolling until stable (only if user hasn't manually scrolled).
  useEffect(() => {
    if (loading) return;
    if (messages.length === 0) return;

    const container = chatContainerRef.current;
    if (!container) return;

    // Instant snap to bottom on initial load
    if (!initialScrollDone.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollDone.current = true;
      // After snap, check button state
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollDown(distFromBottom > 100);
    }

    // ResizeObserver: if content height grows (due to images) AND user is near bottom,
    // keep scrolling so they stay at the bottom.
    const observer = new ResizeObserver(() => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (dist < 300) {
        // User is near bottom — keep them there
        container.scrollTop = container.scrollHeight;
        setShowScrollDown(false);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [loading, messages.length]);

  // When a NEW message arrives (realtime), auto-scroll only if already near bottom
  const prevMsgCount = useRef(0);
  useEffect(() => {
    const newCount = messages.length;
    if (!initialScrollDone.current) return; // Don't interfere with initial load
    if (newCount > prevMsgCount.current) {
      const container = chatContainerRef.current;
      if (container) {
        const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (dist < 300) {
          // User was near bottom — scroll for them smoothly
          scrollToBottom("smooth");
        } else {
          // User is reading older messages — just show the button
          setShowScrollDown(true);
        }
      }
    }
    prevMsgCount.current = newCount;
  }, [messages, scrollToBottom]);

  // ─── File upload helper ─────────────────────────────────────────────────────
  // NOTE: chat-files bucket is now PRIVATE. We store the storage path in DB
  // and generate signed URLs on the fly for display.
  const uploadChatFile = async (file: File): Promise<{ url: string; name: string; type: string } | null> => {
    if (!currentUserId) return null;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${currentUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("chat-files")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      console.error("[upload]", error);
      return null;
    }
    // Generate a signed URL valid for 7 days so the link works even from private bucket
    const { data: signedData, error: signErr } = await supabase.storage
      .from("chat-files")
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
    if (signErr || !signedData) {
      console.error("[signed-url]", signErr);
      return null;
    }
    return { url: signedData.signedUrl, name: file.name, type: file.type };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({ title: `File too large (max ${MAX_FILE_SIZE_MB} MB)`, variant: "destructive" });
      return;
    }
    setAttachedFile(file);
    e.target.value = "";
  };

  const sendMessage = async () => {
    if ((!chatInput.trim() && !attachedFile) || !batch) return;
    setSendingMsg(true);

    let fileData: { url: string; name: string; type: string } | null = null;
    if (attachedFile) {
      setUploadingFile(true);
      fileData = await uploadChatFile(attachedFile);
      setUploadingFile(false);
      if (!fileData) {
        toast({ title: "File upload failed", variant: "destructive" });
        setSendingMsg(false);
        return;
      }
    }

    const { error } = await supabase.from("batch_messages").insert({
      batch_id: batchId!,
      institute_code: batch.institute_code,
      sender_id: currentUserId,
      sender_name: currentUserName,
      sender_role: currentUserRole,
      message: chatInput.trim() || (fileData ? fileData.name : ""),
      file_url: fileData?.url ?? null,
      file_name: fileData?.name ?? null,
      file_type: fileData?.type ?? null,
      reply_to_id: replyingTo?.id ?? null,
    } as any);

    if (!error) {
      setChatInput("");
      setAttachedFile(null);
      setReplyingTo(null);

      const msgText = chatInput.trim() || `📎 ${fileData?.name || "File shared"}`;

      // ─── Push rule: teacher/admin message → notify all students in batch ─
      if ((currentUserRole === "teacher" || currentUserRole === "admin") && batch) {
        const studentIds = await getBatchStudentIds(batchId!);
        if (studentIds.length > 0) {
          sendPushNotification({
            institute_code: batch.institute_code,
            title: `${currentUserName} (${batch.name})`,
            body: msgText,
            url: `/batch/${batchId}`,
            target_user_ids: studentIds,
          });
        }
      }

      // ─── Push rule: student message → notify teacher of batch ────────────
      if (currentUserRole === "student" && batch?.teacher_id) {
        sendPushNotification({
          institute_code: batch.institute_code,
          title: `${currentUserName} in ${batch.name}`,
          body: msgText,
          url: `/batch/${batchId}`,
          target_user_ids: [batch.teacher_id],
        });
      }
    }
    setSendingMsg(false);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    const currentReactions = msg.reactions || {};
    const users = currentReactions[emoji] || [];
    const hasReacted = users.includes(currentUserId);

    let newUsers = hasReacted ? users.filter((id) => id !== currentUserId) : [...users, currentUserId];

    const newReactions = { ...currentReactions, [emoji]: newUsers };

    // Update local state first for instant feedback
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: newReactions } : m)));

    const { error } = await supabase
      .from("batch_messages")
      .update({ reactions: newReactions } as any)
      .eq("id", messageId);

    if (error) {
      toast({ title: "Error updating reaction", variant: "destructive" });
    }
  };

  const saveAttendance = async () => {
    if (!batch) return;
    setSavingAttendance(true);
    const today = new Date().toISOString().split("T")[0];

    const rows = students.map((s) => ({
      batch_id: batchId!,
      institute_code: batch.institute_code,
      student_id: s.user_id,
      present: attendance[s.id] || false,
      date: today,
      marked_by: currentUserId,
    }));

    const { error } = await supabase.from("attendance").upsert(rows, {
      onConflict: "batch_id,student_id,date",
    });

    if (error) {
      toast({ title: "Error saving attendance", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Attendance saved!", description: `Saved for ${today}` });
    }
    setSavingAttendance(false);
  };

  const postAnnouncement = async () => {
    if (!newAnn.title || !newAnn.content || !batch) return;
    setSavingAnn(true);
    const { error } = await supabase.from("announcements").insert({
      batch_id: batchId!,
      institute_code: batch.institute_code,
      posted_by: currentUserId,
      posted_by_name: currentUserName,
      title: newAnn.title,
      content: newAnn.content,
      type: newAnn.type,
      notify_push: newAnn.notifyPush,
    } as any);
    if (error) {
      toast({ title: "Error posting announcement", variant: "destructive" });
    } else {
      // ─── Push rule: announcement with notify toggle → batch students ─────
      if (newAnn.notifyPush) {
        sendPushNotification({
          institute_code: batch.institute_code,
          title: newAnn.title,
          body: newAnn.content,
          url: `/batch/${batchId}`,
          batch_id: batchId!, // scoped to this batch's students
        });
      }
      toast({ title: newAnn.notifyPush ? "Announcement posted with phone alert!" : "Announcement posted!" });
      setAnnDialog(false);
      setNewAnn({ title: "", content: "", type: "general", notifyPush: false });
    }
    setSavingAnn(false);
  };

  const postDpp = async () => {
    if (!newDpp.title || !batch) return;
    setSavingDpp(true);
    try {
      let file_url: string | null = null;
      let file_name: string | null = null;
      if (dppFile) {
        // NICE-05 fix: Enforce file size limit for DPP uploads
        if (dppFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast({ title: `File too large (max ${MAX_FILE_SIZE_MB} MB)`, variant: "destructive" });
          setSavingDpp(false);
          return;
        }
        const ext = dppFile.name.split(".").pop() || "bin";
        const path = `${currentUserId}/${Date.now()}-dpp.${ext}`;
        const { error: upErr } = await supabase.storage.from("homework-files").upload(path, dppFile, { contentType: dppFile.type, upsert: false });
        if (upErr) {
          console.error("[dpp-upload]", upErr);
          toast({ title: "File upload failed", description: upErr.message, variant: "destructive" });
          setSavingDpp(false);
          return;
        }
        // Generate a signed URL since homework-files is private
        const { data: signedData, error: signErr } = await supabase.storage
          .from("homework-files")
          .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
        if (signErr || !signedData) {
          console.error("[dpp-signed-url]", signErr);
          toast({ title: "Failed to generate file URL", variant: "destructive" });
          setSavingDpp(false);
          return;
        }
        file_url = signedData.signedUrl;
        file_name = dppFile.name;
      }
      const { error } = await supabase.from("homeworks").insert({
        batch_id: batchId!,
        institute_code: batch.institute_code,
        teacher_id: currentUserId,
        teacher_name: currentUserName,
        title: newDpp.title,
        description: newDpp.description || null,
        file_url,
        file_name,
        link_url: newDpp.link_url || null,
        type: "dpp",
      });
      if (error) {
        toast({ title: "Error posting DPP", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "DPP/Homework posted!" });
        setDppDialog(false);
        setNewDpp({ title: "", description: "", link_url: "" });
        setDppFile(null);
        const { data } = await supabase
          .from("homeworks")
          .select("id, title, description, file_url, file_name, link_url, teacher_name, created_at")
          .eq("batch_id", batchId!)
          .order("created_at", { ascending: false });
        setDppItems((data || []).map((d) => ({ ...d, posted_by_name: d.teacher_name ?? "" })));
      }
    } finally {
      setSavingDpp(false);
    }
  };

  const presentCount = Object.values(attendance).filter(Boolean).length;

  const formatChatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (isToday) return timeStr;
    if (isYesterday) return `${timeStr} Yesterday`;

    const day = date.getDate();
    const month = date.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    return `${timeStr} ${day} ${month}`;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const isImage = (type: string | null | undefined) => type?.startsWith("image/");
  const isPDF = (type: string | null | undefined) => type === "application/pdf";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-3">Batch not found</p>
          <Button onClick={handleBack}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card flex items-center gap-3 px-4 h-14 flex-shrink-0">
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center text-white text-xs font-bold">
          {batch.name.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-semibold text-sm leading-none">{batch.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {batch.teacher_name || "No teacher"} · {studentCount} students
          </p>
        </div>
        <Badge variant="secondary" className="text-xs hidden sm:flex">
          {batch.course}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-success">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          Live
        </div>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border/50 bg-card px-4 flex-shrink-0">
          <TabsList className="h-10 bg-transparent p-0 gap-1">
            {[
              { value: "chat", icon: MessageSquare, label: "Chat" },
              { value: "announcements", icon: Megaphone, label: "Announcements" },
              { value: "attendance", icon: CalendarCheck, label: "Attendance" },
              { value: "tests", icon: FlaskConical, label: "Tests" },
              { value: "dpp", icon: BookMarked, label: "DPP / HW" },
              { value: "rankings", icon: Trophy, label: "Rankings" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-10 px-3 gap-1.5 text-xs font-medium data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          {/* ── Chat ── */}
          <TabsContent value="chat" className="h-full flex flex-col relative m-0 data-[state=inactive]:hidden">
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-3"
              onScroll={(e) => {
                const target = e.currentTarget;
                const distFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
                // Show button if more than 100px from bottom (not just near-bottom)
                setShowScrollDown(distFromBottom > 100);
              }}
            >
              {messages.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No messages yet. Start the conversation!</p>
                </div>
              )}
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  drag="x"
                  dragConstraints={msg.isSelf ? { left: 0, right: 100 } : { left: -100, right: 0 }}
                  dragElastic={0.4}
                  onDragEnd={(_, info) => {
                    if (msg.isSelf && info.offset.x > 60) {
                      setReplyingTo(msg);
                    } else if (!msg.isSelf && info.offset.x < -60) {
                      setReplyingTo(msg);
                    }
                  }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex gap-2.5 relative group", msg.isSelf ? "flex-row-reverse" : "flex-row")}
                >
                  {!msg.isSelf && (
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5",
                        msg.sender_role === "teacher" || msg.sender_role === "admin"
                          ? "gradient-hero"
                          : "bg-secondary border border-border",
                      )}
                    >
                      <span
                        className={
                          msg.sender_role === "teacher" || msg.sender_role === "admin" ? "" : "text-foreground"
                        }
                      >
                        {msg.sender_name
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-xs lg:max-w-md",
                      msg.isSelf ? "items-end" : "items-start",
                      "flex flex-col gap-0.5",
                    )}
                  >
                    {!msg.isSelf && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold">{msg.sender_name}</span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs px-1.5 py-0",
                            (msg.sender_role === "teacher" || msg.sender_role === "admin") &&
                              "bg-primary-light text-primary border-primary/20",
                          )}
                        >
                          {msg.sender_role}
                        </Badge>
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                        msg.isSelf
                          ? "gradient-hero text-white rounded-tr-sm"
                          : "bg-card border border-border/60 rounded-tl-sm",
                      )}
                    >
                      {/* Reply reference */}
                      {msg.reply_to_id && (
                        <div
                          className={cn(
                            "mb-2 p-2 rounded-lg border-l-4 bg-black/5 text-xs truncate",
                            msg.isSelf ? "border-white/40 text-white/90" : "border-primary/40 text-muted-foreground",
                          )}
                        >
                          {messages.find((m) => m.id === msg.reply_to_id)?.message || "Original message"}
                        </div>
                      )}
                      {/* File attachment */}
                      {msg.file_url && (
                        <div className="mb-1.5">
                          {isImage(msg.file_type) ? (
                            <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={msg.file_url}
                                alt={msg.file_name || "image"}
                                className="max-w-[200px] max-h-[160px] rounded-lg object-cover border border-white/20"
                                // When image loads it shifts layout — scroll to keep at bottom if user was there
                                onLoad={() => {
                                  const container = chatContainerRef.current;
                                  if (!container) return;
                                  const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
                                  if (dist < 300) container.scrollTop = container.scrollHeight;
                                }}
                              />
                            </a>
                          ) : (
                            <a
                              href={msg.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium",
                                msg.isSelf ? "bg-white/20 text-white" : "bg-muted text-foreground",
                              )}
                            >
                              {isPDF(msg.file_type) ? (
                                <FileText className="w-4 h-4 flex-shrink-0" />
                              ) : (
                                <Download className="w-4 h-4 flex-shrink-0" />
                              )}
                              <span className="truncate max-w-[140px]">{msg.file_name || "Download file"}</span>
                            </a>
                          )}
                        </div>
                      )}
                      {/* Text */}
                      {msg.message && msg.message !== msg.file_name && <span>{msg.message}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 px-1">
                      <span className="text-[10px] text-muted-foreground">{formatChatDate(msg.created_at)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReaction(msg.id, "👍")}
                          className={cn(
                            "flex items-center gap-1 p-1 rounded-md transition-colors hover:bg-muted",
                            msg.reactions?.["👍"]?.includes(currentUserId) && "text-primary bg-primary-light/30",
                          )}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          {msg.reactions?.["👍"]?.length > 0 && (
                            <span className="text-[10px] font-bold">{msg.reactions["👍"].length}</span>
                          )}
                        </button>
                        <button
                          onClick={() => handleReaction(msg.id, "👎")}
                          className={cn(
                            "flex items-center gap-1 p-1 rounded-md transition-colors hover:bg-muted",
                            msg.reactions?.["👎"]?.includes(currentUserId) && "text-danger bg-danger-light/30",
                          )}
                        >
                          <ThumbsDown className="w-3 h-3" />
                          {msg.reactions?.["👎"]?.length > 0 && (
                            <span className="text-[10px] font-bold">{msg.reactions["👎"].length}</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Replying to preview */}
            {replyingTo && (
              <div className="px-4 py-2 bg-muted/30 border-t border-border/40 flex items-center justify-between animate-in slide-in-from-bottom-2">
                <div className="flex-1 min-w-0 border-l-2 border-primary pl-3 py-1">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    Replying to {replyingTo.sender_name}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{replyingTo.message}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-full"
                  onClick={() => setReplyingTo(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Attached file preview */}
            {attachedFile && (
              <div className="px-3 py-2 bg-muted/50 border-t border-border/40 flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0 bg-card border border-border/50 rounded-lg px-3 py-1.5">
                  {attachedFile.type.startsWith("image/") ? (
                    <Image className="w-4 h-4 text-primary flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                  <span className="text-xs truncate text-foreground">{attachedFile.name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {(attachedFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted-foreground hover:text-danger flex-shrink-0"
                  onClick={() => setAttachedFile(null)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Scroll-to-bottom button — visible whenever user is not at the bottom.
                 Mimics WhatsApp behaviour: appears as soon as you scroll up even 1px */}
            <AnimatePresence>
              {showScrollDown && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-[80px] right-4 z-20"
                >
                  <Button
                    size="icon"
                    className="rounded-full shadow-xl gradient-hero text-white border-0 w-11 h-11 hover:opacity-90"
                    onClick={() => scrollToBottom("smooth")}
                  >
                    <ArrowDown className="w-5 h-5" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat input */}
            <div className="border-t border-border/50 p-3 bg-card flex gap-2 items-end">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                onChange={handleFileSelect}
              />
              <Button
                variant="ghost"
                size="icon"
                className="w-9 h-9 text-muted-foreground hover:text-primary flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendingMsg}
                title="Attach file"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Input
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                className="flex-1 h-9"
              />
              <Button
                onClick={sendMessage}
                size="icon"
                disabled={sendingMsg || (!chatInput.trim() && !attachedFile)}
                className="w-9 h-9 gradient-hero text-white border-0 hover:opacity-90 flex-shrink-0"
              >
                {sendingMsg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </TabsContent>

          {/* ── Announcements ── */}
          <TabsContent value="announcements" className="h-full overflow-y-auto m-0 p-4 data-[state=inactive]:hidden">
            <div className="max-w-2xl space-y-4">
              {(currentUserRole === "teacher" || currentUserRole === "admin") && (
                <Dialog open={annDialog} onOpenChange={setAnnDialog}>
                  <DialogTrigger asChild>
                    <Button className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2 mb-2">
                      <Plus className="w-4 h-4" /> Post Announcement
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-display">New Announcement</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label>Title</Label>
                        <Input
                          placeholder="e.g. Unit Test 3 Schedule"
                          value={newAnn.title}
                          onChange={(e) => setNewAnn((p) => ({ ...p, title: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Message</Label>
                        <Textarea
                          placeholder="Write your announcement..."
                          value={newAnn.content}
                          onChange={(e) => setNewAnn((p) => ({ ...p, content: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      {/* Notify Push toggle */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                        <div className="flex items-center gap-2.5">
                          <Bell className="w-4 h-4 text-accent" />
                          <div>
                            <p className="text-sm font-medium">Alert students on phone</p>
                            <p className="text-xs text-muted-foreground">Send a mobile push notification</p>
                          </div>
                        </div>
                        <Switch
                          checked={newAnn.notifyPush}
                          onCheckedChange={(v) => setNewAnn((p) => ({ ...p, notifyPush: v }))}
                        />
                      </div>
                      <Button
                        className="w-full gradient-hero text-white border-0 hover:opacity-90"
                        onClick={postAnnouncement}
                        disabled={savingAnn}
                      >
                        {savingAnn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Post
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No announcements yet.</p>
              ) : (
                announcements.map((ann, i) => (
                  <motion.div
                    key={ann.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Card className="p-4 shadow-card border-border/50">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0">
                          <Megaphone className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{ann.title}</span>
                            {ann.type && (
                              <Badge variant="secondary" className="text-xs">
                                {ann.type}
                              </Badge>
                            )}
                            {ann.notify_push && (
                              <Badge className="text-xs bg-accent-light text-accent border-accent/20 gap-1">
                                <Bell className="w-2.5 h-2.5" /> Alerted
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed mb-2">{ann.content}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{ann.posted_by_name}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {timeAgo(ann.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          {/* ── Attendance ── */}
          <TabsContent value="attendance" className="h-full overflow-y-auto m-0 p-4 data-[state=inactive]:hidden">
            <div className="max-w-xl space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center shadow-card border-border/50">
                  <div className="text-xl font-display font-bold text-success">{presentCount}</div>
                  <div className="text-xs text-muted-foreground">Present</div>
                </Card>
                <Card className="p-3 text-center shadow-card border-border/50">
                  <div className="text-xl font-display font-bold text-danger">{students.length - presentCount}</div>
                  <div className="text-xs text-muted-foreground">Absent</div>
                </Card>
                <Card className="p-3 text-center shadow-card border-border/50">
                  <div
                    className={`text-xl font-display font-bold ${students.length > 0 && Math.round((presentCount / students.length) * 100) >= 75 ? "text-success" : "text-danger"}`}
                  >
                    {students.length > 0 ? `${Math.round((presentCount / students.length) * 100)}%` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">Today</div>
                </Card>
              </div>
              {students.length === 0 ? (
                <Card className="p-8 text-center shadow-card border-border/50">
                  <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">No students enrolled in this batch yet.</p>
                </Card>
              ) : (
                <Card className="shadow-card border-border/50 overflow-hidden">
                  <div className="p-3 border-b border-border/50 flex items-center justify-between">
                    <p className="font-display font-semibold text-sm">
                      Today's Attendance — {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
                    </p>
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Eye className="w-3 h-3" /> Read-only
                    </Badge>
                  </div>
                  <div className="divide-y divide-border/40">
                    {students.map((s) => (
                      <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold">
                            {s.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <p className="text-sm font-medium">{s.full_name}</p>
                        </div>
                        <Badge
                          className={
                            attendance[s.id]
                              ? "bg-success-light text-success border-success/20 text-xs"
                              : "bg-danger-light text-danger border-danger/20 text-xs"
                          }
                        >
                          {attendance[s.id] ? "Present" : "Absent"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-border/50 text-center">
                    <p className="text-xs text-muted-foreground">
                      To mark attendance, use the dedicated <strong>Attendance</strong> section in the main panel.
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Tests ── */}
          <TabsContent value="tests" className="h-full overflow-y-auto m-0 p-4 data-[state=inactive]:hidden">
            <div className="max-w-2xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-display font-semibold">Test Scores</h3>
                <Badge variant="secondary" className="text-xs gap-1">
                  <Eye className="w-3 h-3" /> Read-only
                </Badge>
              </div>
              {tests.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No test scores yet.</p>
              ) : (
                tests.map((t, i) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Card className="p-4 shadow-card border-border/50">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center text-white text-xs font-bold">
                            {i + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{t.test_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(t.test_date).toLocaleDateString("en-IN")} · Max: {t.max_marks}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-display font-bold text-lg">
                            {t.score}
                            <span className="text-sm text-muted-foreground">/{t.max_marks}</span>
                          </p>
                          <p
                            className={`text-xs font-semibold ${Math.round((t.score / t.max_marks) * 100) >= 75 ? "text-success" : "text-warning"}`}
                          >
                            {Math.round((t.score / t.max_marks) * 100)}%
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${Math.round((t.score / t.max_marks) * 100) >= 75 ? "bg-success" : "bg-warning"}`}
                            style={{ width: `${Math.round((t.score / t.max_marks) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          {/* ── DPP / Homework ── */}
          <TabsContent value="dpp" className="h-full overflow-y-auto m-0 p-4 data-[state=inactive]:hidden">
            <div className="max-w-2xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-display font-semibold">DPP / Homework</h3>
                {currentUserRole === "teacher" && (
                  <Dialog open={dppDialog} onOpenChange={setDppDialog}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-1.5 h-8 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5" /> Upload DPP
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="font-display">Upload DPP / Homework</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                          <Label>Title *</Label>
                          <Input
                            placeholder="e.g. DPP 14 — Electrostatics"
                            value={newDpp.title}
                            onChange={(e) => setNewDpp((p) => ({ ...p, title: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Description / Instructions</Label>
                          <Textarea
                            placeholder="Any notes for students..."
                            value={newDpp.description}
                            onChange={(e) => setNewDpp((p) => ({ ...p, description: e.target.value }))}
                            rows={2}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Link (optional)</Label>
                          <Input
                            placeholder="https://... (Google Drive, YouTube, etc.)"
                            value={newDpp.link_url}
                            onChange={(e) => setNewDpp((p) => ({ ...p, link_url: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>File (optional)</Label>
                          <input
                            ref={dppFileRef}
                            type="file"
                            className="hidden"
                            accept="image/*,application/pdf,.doc,.docx"
                            onChange={(e) => setDppFile(e.target.files?.[0] || null)}
                          />
                          <div
                            className="flex items-center gap-3 p-3 border border-dashed border-border/60 rounded-lg bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                            onClick={() => dppFileRef.current?.click()}
                          >
                            <Paperclip className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {dppFile ? dppFile.name : "Attach PDF, image, or doc (max 10MB)"}
                            </span>
                            {dppFile && (
                              <button
                                className="ml-auto text-danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDppFile(null);
                                }}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <Button
                          className="w-full gradient-hero text-white border-0 hover:opacity-90"
                          onClick={postDpp}
                          disabled={savingDpp || !newDpp.title}
                        >
                          {savingDpp ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Uploading...
                            </>
                          ) : (
                            "Post DPP / Homework"
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {dppItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No DPP or homework posted yet.</p>
              ) : (
                dppItems.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Card className="p-4 shadow-card border-border/50">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0">
                          <BookMarked className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm mb-0.5">{item.title}</p>
                          {item.description && <p className="text-xs text-muted-foreground mb-2">{item.description}</p>}
                          <div className="flex flex-wrap gap-2">
                            {item.file_url && (
                              <a
                                href={item.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-primary hover:underline bg-primary-light px-2.5 py-1 rounded-full"
                              >
                                <Download className="w-3 h-3" /> {item.file_name || "Download File"}
                              </a>
                            )}
                            {item.link_url && (
                              <a
                                href={item.link_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-accent hover:underline bg-accent-light px-2.5 py-1 rounded-full"
                              >
                                <LinkIcon className="w-3 h-3" /> Open Link
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {timeAgo(item.created_at)} · {item.posted_by_name}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          {/* ── Rankings ── */}
          <TabsContent value="rankings" className="h-full overflow-y-auto m-0 p-4 data-[state=inactive]:hidden">
            <div className="max-w-md space-y-4">
              <Card className="shadow-card border-border/50 overflow-hidden">
                <div className="gradient-hero p-5 text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-5 h-5" />
                    <span className="font-display font-bold text-lg">Batch Leaderboard</span>
                  </div>
                  <p className="text-white/70 text-sm">Based on latest test scores</p>
                </div>
                {tests.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No test scores yet to rank.</div>
                ) : (
                  (() => {
                    const byStudent: Record<string, { name: string; total: number; count: number }> = {};
                    tests.forEach((t) => {
                      const s = students.find((s) => s.user_id === t.student_id);
                      const name = s?.full_name || "Unknown";
                      if (!byStudent[t.student_id]) byStudent[t.student_id] = { name, total: 0, count: 0 };
                      byStudent[t.student_id].total += Math.round((t.score / t.max_marks) * 100);
                      byStudent[t.student_id].count += 1;
                    });
                    const ranked = Object.entries(byStudent)
                      .map(([id, v]) => ({ id, name: v.name, avg: Math.round(v.total / v.count) }))
                      .sort((a, b) => b.avg - a.avg);
                    return (
                      <div className="divide-y divide-border/40">
                        {ranked.map((r, i) => (
                          <div
                            key={r.id}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3.5",
                              r.id === currentUserId && "bg-primary-light/40 border-l-2 border-primary",
                            )}
                          >
                            <div
                              className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0",
                                i === 0
                                  ? "gradient-hero text-white"
                                  : i === 1
                                    ? "bg-secondary text-foreground"
                                    : i === 2
                                      ? "bg-accent-light text-accent"
                                      : "bg-muted text-muted-foreground text-xs",
                              )}
                            >
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={cn(
                                  "text-sm font-medium",
                                  r.id === currentUserId && "text-primary font-bold",
                                )}
                              >
                                {r.name} {r.id === currentUserId && <span className="text-xs">(You)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">Avg: {r.avg}%</p>
                            </div>
                            <span className="text-sm font-display font-bold">{r.avg}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </Card>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
