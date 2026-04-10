import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DirectMessage } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE_MB = 10;

interface UseDirectMessagesOptions {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  instituteCode: string;
}

export function useDirectMessages({
  conversationId,
  currentUserId,
  currentUserName,
  currentUserRole,
  instituteCode,
}: UseDirectMessagesOptions) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // B-14: Track realtime channel status
  const [channelStatus, setChannelStatus] = useState<string>("CLOSED");

  // ── Fetch messages ─────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await supabase
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (data) {
      setMessages(
        data.map((m) => ({
          ...m,
          reactions: (m.reactions ?? {}) as Record<string, string[]>,
          isSelf: m.sender_id === currentUserId,
        }))
      );
    }
    setLoading(false);
  }, [conversationId, currentUserId]);

  // B-5: Combined fetch + subscribe in a single effect to prevent double-fetch
  useEffect(() => {
    if (!conversationId) return;

    // Remove any previous channel before creating a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Fetch messages first
    fetchMessages();

    const channel = supabase
      .channel(`dm-${conversationId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as DirectMessage;
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
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as DirectMessage;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    message: updated.message,
                    reactions: (updated.reactions ?? {}) as Record<string, string[]>,
                    is_deleted: updated.is_deleted,
                    is_edited: updated.is_edited,
                    file_url: updated.file_url,
                    file_name: updated.file_name,
                    file_type: updated.file_type,
                  }
                : m
            )
          );
        }
      )
      .subscribe((status) => {
        // B-14: Track channel status for "Live" indicator
        setChannelStatus(status);
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, currentUserId, fetchMessages]);

  // ── Mark conversation as read ──────────────────────────────
  const markAsRead = useCallback(async () => {
    if (!conversationId) return;
    await supabase.rpc("mark_dm_read", { p_conversation_id: conversationId });
  }, [conversationId]);

  // ── File upload ────────────────────────────────────────────
  // B-3: Use getPublicUrl since chat-files bucket IS public (per storage config)
  const uploadFile = async (
    file: File
  ): Promise<{ url: string; name: string; type: string } | null> => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({ title: `File too large (max ${MAX_FILE_SIZE_MB} MB)`, variant: "destructive" });
      return null;
    }
    const ext = file.name.split(".").pop() || "bin";
    const mimeType =
      file.type ||
      (ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
        ? "image/png"
        : "application/octet-stream");
    const path = `dm/${conversationId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("chat-files")
      .upload(path, file, { contentType: mimeType, upsert: false });
    if (error) {
      toast({ title: "Upload error", description: error.message, variant: "destructive" });
      return null;
    }
    const { data: publicData } = supabase.storage
      .from("chat-files")
      .getPublicUrl(path);
    return { url: publicData.publicUrl, name: file.name, type: mimeType };
  };

  // ── Send message ───────────────────────────────────────────
  const sendMessage = useCallback(
    async ({
      text,
      file,
      replyToId,
    }: {
      text: string;
      file?: File | null;
      replyToId?: string | null;
    }) => {
      if (!text.trim() && !file) return;

      let fileData: { url: string; name: string; type: string } | null = null;
      if (file) {
        fileData = await uploadFile(file);
        if (!fileData) return;
      }

      // B-6: Use descriptive message for file-only messages instead of empty string
      const messageText = text.trim() || (fileData ? `📎 ${fileData.name}` : "");

      // Optimistic send: add message locally before DB insert
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: DirectMessage = {
        id: optimisticId,
        conversation_id: conversationId,
        institute_code: instituteCode,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_role: currentUserRole,
        message: messageText,
        file_url: fileData?.url ?? null,
        file_name: fileData?.name ?? null,
        file_type: fileData?.type ?? null,
        reply_to_id: replyToId ?? null,
        reactions: {},
        is_deleted: false,
        is_edited: false,
        created_at: new Date().toISOString(),
        isSelf: true,
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const { error } = await supabase.from("direct_messages").insert({
        conversation_id: conversationId,
        institute_code: instituteCode,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_role: currentUserRole,
        message: messageText,
        file_url: fileData?.url ?? null,
        file_name: fileData?.name ?? null,
        file_type: fileData?.type ?? null,
        reply_to_id: replyToId ?? null,
      });

      if (error) {
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
      }
      // Real message will arrive via realtime INSERT and dedup will handle it
    },
    [conversationId, currentUserId, currentUserName, currentUserRole, instituteCode, toast]
  );

  // ── Edit message ───────────────────────────────────────────
  const editMessage = useCallback(
    async (messageId: string, newText: string) => {
      const { error } = await supabase
        .from("direct_messages")
        .update({ message: newText, is_edited: true })
        .eq("id", messageId)
        .eq("sender_id", currentUserId);
      if (error) {
        toast({ title: "Failed to edit message", variant: "destructive" });
      }
    },
    [currentUserId, toast]
  );

  // ── Soft delete message ────────────────────────────────────
  const deleteMessage = useCallback(
    async (messageId: string) => {
      const { error } = await supabase
        .from("direct_messages")
        .update({
          is_deleted: true,
          message: "This message was deleted",
          file_url: null,
          file_name: null,
          file_type: null,
        })
        .eq("id", messageId)
        .eq("sender_id", currentUserId);
      if (error) {
        toast({ title: "Failed to delete message", variant: "destructive" });
      }
    },
    [currentUserId, toast]
  );

  // ── React to message ───────────────────────────────────────
  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return;

      const current = msg.reactions || {};
      const users = current[emoji] || [];
      const hasReacted = users.includes(currentUserId);
      const newUsers = hasReacted
        ? users.filter((id) => id !== currentUserId)
        : [...users, currentUserId];
      const newReactions = { ...current, [emoji]: newUsers };

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: newReactions } : m))
      );

      const { error } = await supabase
        .from("direct_messages")
        .update({ reactions: newReactions })
        .eq("id", messageId);

      if (error) {
        toast({ title: "Error updating reaction", variant: "destructive" });
        // Revert on failure
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: current } : m))
        );
      }
    },
    [messages, currentUserId, toast]
  );

  return {
    messages,
    loading,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
    markAsRead,
    channelStatus,
  };
}
