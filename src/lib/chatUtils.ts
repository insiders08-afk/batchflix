/**
 * Shared chat utilities used by BatchWorkspace and DMConversation.
 * B-29: Extracted from duplicated code in both files.
 */

/** Format a message timestamp for display in chat bubbles */
export function formatChatDate(dateStr: string): string {
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
}

/** B-13: Smart reply preview helper for file-only and text messages */
export function getMessagePreview(msg: {
  message?: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  is_deleted?: boolean;
}): string {
  if (msg.is_deleted) return "This message was deleted";
  if (msg.file_url && (!msg.message || msg.message === "" || msg.message === msg.file_name)) {
    if (msg.file_type?.startsWith("image/")) return "📷 Photo";
    return `📄 ${msg.file_name || "File"}`;
  }
  return msg.message || "Original message";
}

/** Role label helper */
export function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Teacher";
  if (role === "student") return "Student";
  return role;
}

/** Relative time ago helper */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
