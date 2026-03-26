/**
 * Client-side push notification helper.
 * Calls the send-push-notifications edge function with proper rule engine params.
 */
import { supabase } from "@/integrations/supabase/client";

const EDGE_FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/send-push-notifications`;

interface PushPayload {
  institute_code: string;
  title: string;
  body?: string;
  url?: string;
  /** Send to all students in a specific batch (teacher chat rule) */
  batch_id?: string;
  /** Send to explicit user IDs list */
  target_user_ids?: string[];
}

export async function sendPushNotification(payload: PushPayload): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(EDGE_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Push is non-critical — log and continue
    console.warn("[push] Notification dispatch failed:", err);
  }
}

/**
 * Fetch all student user_ids enrolled in a batch.
 * Used to build target_user_ids for teacher chat messages.
 */
export async function getBatchStudentIds(batchId: string): Promise<string[]> {
  const { data } = await supabase
    .from("students_batches")
    .select("student_id")
    .eq("batch_id", batchId);
  return (data || []).map((r) => r.student_id);
}
