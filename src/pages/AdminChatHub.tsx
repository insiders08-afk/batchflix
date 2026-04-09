import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageSquare, Users, GraduationCap, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { ChatListItem } from "@/components/chat/ChatListItem";
import { ChatSearchBar } from "@/components/chat/ChatSearchBar";
import { useDMList } from "@/hooks/useDMList";
import type { DirectConversation, BatchLastMessage } from "@/types/chat";

type Tab = "all" | "batches" | "teachers" | "students";

interface Batch {
  id: string;
  name: string;
  course: string;
  teacher_name: string | null;
  updated_at: string | null;
}

interface UserProfile {
  user_id: string;
  full_name: string;
  role: string;
}

export default function AdminChatHub() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [instituteCode, setInstituteCode] = useState("");
  const [instituteName, setInstituteName] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [batchLastMsgs, setBatchLastMsgs] = useState<Record<string, BatchLastMessage>>({});
  const [pageLoading, setPageLoading] = useState(true);

  // ── Load session & data ──────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("institute_code")
        .eq("user_id", user.id)
        .single();
      if (!profile?.institute_code) return;
      const ic = profile.institute_code;
      setInstituteCode(ic);

      // Institute name
      const { data: inst } = await supabase
        .from("institutes")
        .select("institute_name, city")
        .eq("institute_code", ic)
        .single();
      if (inst) {
        setInstituteName(`${inst.institute_name}${inst.city ? ", " + inst.city : ""}`);
      }

      // Batches
      const { data: batchData } = await supabase
        .from("batches")
        .select("id, name, course, teacher_name, updated_at")
        .eq("institute_code", ic)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      setBatches(batchData || []);

      // Batch last messages (RPC)
      const { data: blm } = await supabase.rpc("get_batch_last_messages", {
        p_institute_code: ic,
      });
      const blmMap: Record<string, BatchLastMessage> = {};
      (blm || []).forEach((row: BatchLastMessage) => {
        blmMap[row.batch_id] = row;
      });
      setBatchLastMsgs(blmMap);

      // Teachers
      const { data: teacherData } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("institute_code", ic)
        .eq("role", "teacher")
        .order("full_name");
      setTeachers(teacherData || []);

      // Students
      const { data: studentData } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("institute_code", ic)
        .eq("role", "student")
        .order("full_name");
      setStudents(studentData || []);

      setPageLoading(false);
    };
    init();
  }, []);

  // ── DM conversation list ─────────────────────────────────
  const { conversations } = useDMList({
    currentUserId,
    currentUserRole: "admin",
    instituteCode,
  });

  // Map conversations by other_user_id for quick lookup
  const convByUser = useMemo(() => {
    const map: Record<string, DirectConversation> = {};
    conversations.forEach((c) => {
      map[c.other_user_id] = c;
    });
    return map;
  }, [conversations]);

  // ── Open or create DM with a user ───────────────────────
  const openDM = async (userId: string, dmType: "admin_teacher" | "admin_student") => {
    if (!currentUserId || !instituteCode) return;
    const { data, error } = await supabase.rpc("get_or_create_dm_conversation", {
      p_admin_id: currentUserId,
      p_other_user_id: userId,
      p_dm_type: dmType,
      p_institute_code: instituteCode,
    });
    if (error || !data) {
      console.error("[openDM]", error);
      return;
    }
    navigate(`/dm/${data}`);
  };

  // ── Search filtering helpers ─────────────────────────────
  const q = search.toLowerCase();
  const filteredBatches = batches.filter(
    (b) => b.name.toLowerCase().includes(q) || b.course.toLowerCase().includes(q)
  );
  const filteredTeachers = teachers.filter((t) => t.full_name.toLowerCase().includes(q));
  const filteredStudents = students.filter((s) => s.full_name.toLowerCase().includes(q));

  // ── All tab: merge batches + DMs sorted by last message ───
  const allThreads = useMemo(() => {
    type Thread = {
      key: string;
      name: string;
      subtitle: string;
      lastMessage: string | null;
      lastMessageAt: string | null;
      unreadCount: number;
      onClick: () => void;
      isGroup: boolean;
    };
    const threads: Thread[] = [];

    batches.forEach((b) => {
      const lm = batchLastMsgs[b.id];
      threads.push({
        key: `batch-${b.id}`,
        name: b.name,
        subtitle: b.course,
        lastMessage: lm ? lm.last_message : null,
        lastMessageAt: lm ? lm.last_message_at : b.updated_at,
        unreadCount: 0,
        onClick: () => navigate(`/batch/${b.id}`),
        isGroup: true,
      });
    });

    conversations.forEach((c) => {
      const person = [...teachers, ...students].find((p) => p.user_id === c.other_user_id);
      threads.push({
        key: `dm-${c.id}`,
        name: person?.full_name ?? "Unknown",
        subtitle: person?.role === "teacher" ? "Teacher" : "Student",
        lastMessage: c.last_message_preview,
        lastMessageAt: c.last_message_at,
        unreadCount: c.admin_unread_count,
        onClick: () => navigate(`/dm/${c.id}`),
        isGroup: false,
      });
    });

    return threads
      .sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return 0;
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      })
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.lastMessage ?? "").toLowerCase().includes(q)
      );
  }, [batches, batchLastMsgs, conversations, teachers, students, navigate, q]);

  if (pageLoading) {
    return (
      <DashboardLayout title="Chats" role="admin">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "all", label: "All", icon: LayoutList },
    { id: "batches", label: "Batch Chats", icon: MessageSquare },
    { id: "teachers", label: "Teachers", icon: Users },
    { id: "students", label: "Students", icon: GraduationCap },
  ];

  return (
    <DashboardLayout title="Chats" role="admin">
      <div className="-m-3 sm:-m-4 md:-m-6 flex flex-col h-full min-h-[calc(100vh-60px)]">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border/40 bg-card/80">
          <h2 className="font-display font-bold text-lg truncate">{instituteName}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Messages &amp; conversations</p>

          {/* Search */}
          <div className="mt-3">
            <ChatSearchBar value={search} onChange={setSearch} />
          </div>

          {/* Tab toggle */}
          <div className="flex gap-1 mt-3 overflow-x-auto pb-1 scrollbar-hide">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                id={`admin-chat-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                  activeTab === tab.id
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lists */}
        <div className="flex-1 overflow-y-auto">
          {/* ── ALL tab ── */}
          {activeTab === "all" && (
            <>
              {allThreads.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  message={
                    search
                      ? "No conversations match your search."
                      : "No conversations yet. Start chatting from the Teachers or Students tabs."
                  }
                />
              ) : (
                allThreads.map((t) => (
                  <ChatListItem
                    key={t.key}
                    name={t.name}
                    subtitle={t.subtitle}
                    lastMessage={t.lastMessage}
                    lastMessageAt={t.lastMessageAt}
                    unreadCount={t.unreadCount}
                    onClick={t.onClick}
                    isGroup={t.isGroup}
                  />
                ))
              )}
            </>
          )}

          {/* ── BATCHES tab ── */}
          {activeTab === "batches" && (
            <>
              {filteredBatches.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  message={search ? "No batches match your search." : "No active batches yet."}
                />
              ) : (
                filteredBatches.map((b) => {
                  const lm = batchLastMsgs[b.id];
                  return (
                    <ChatListItem
                      key={b.id}
                      name={b.name}
                      subtitle={b.course}
                      lastMessage={lm?.last_message ?? null}
                      lastMessageAt={lm?.last_message_at ?? b.updated_at}
                      unreadCount={0}
                      onClick={() => navigate(`/batch/${b.id}`)}
                      isGroup
                    />
                  );
                })
              )}
            </>
          )}

          {/* ── TEACHERS tab ── */}
          {activeTab === "teachers" && (
            <>
              {filteredTeachers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  message={
                    search ? "No teachers match your search." : "No teachers in your institute yet."
                  }
                />
              ) : (
                filteredTeachers.map((t) => {
                  const conv = convByUser[t.user_id];
                  return (
                    <ChatListItem
                      key={t.user_id}
                      name={t.full_name}
                      subtitle="Teacher"
                      lastMessage={conv?.last_message_preview ?? null}
                      lastMessageAt={conv?.last_message_at ?? null}
                      unreadCount={conv?.admin_unread_count ?? 0}
                      onClick={() => openDM(t.user_id, "admin_teacher")}
                    />
                  );
                })
              )}
            </>
          )}

          {/* ── STUDENTS tab ── */}
          {activeTab === "students" && (
            <>
              {filteredStudents.length === 0 ? (
                <EmptyState
                  icon={GraduationCap}
                  message={
                    search ? "No students match your search." : "No students enrolled yet."
                  }
                />
              ) : (
                filteredStudents.map((s) => {
                  const conv = convByUser[s.user_id];
                  return (
                    <ChatListItem
                      key={s.user_id}
                      name={s.full_name}
                      subtitle="Student"
                      lastMessage={conv?.last_message_preview ?? null}
                      lastMessageAt={conv?.last_message_at ?? null}
                      unreadCount={conv?.admin_unread_count ?? 0}
                      onClick={() => openDM(s.user_id, "admin_student")}
                    />
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ElementType;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-muted-foreground opacity-60" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}
