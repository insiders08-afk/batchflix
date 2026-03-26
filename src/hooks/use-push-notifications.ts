import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// VAPID public key — safe to expose in frontend (generated 2026-03-10)
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "BFme8yGA0-W-aHmNAyJOkyUH_tMiS0lJ0I7MiYgGSW7L_oLUCNiDb5RcMgdFyXvdBwGheuKoz6fLvfIRcV9pWgo";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(instituteCode: string | null) {
  const registered = useRef(false);

  useEffect(() => {
    if (!instituteCode || registered.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!VAPID_PUBLIC_KEY) return; // Not configured yet

    const register = async () => {
      try {
        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Get service worker registration
        const reg = await navigator.serviceWorker.ready;

        // Check existing subscription
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          // Subscribe
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
          });
        }

        if (!sub) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const key = sub.getKey("p256dh");
        const auth = sub.getKey("auth");
        if (!key || !auth) return;

        const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)));
        const authKey = btoa(String.fromCharCode(...new Uint8Array(auth)));

        // Upsert subscription — delete old one for this endpoint first, then insert
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", session.user.id);

        await supabase.from("push_subscriptions").insert({
          user_id: session.user.id,
          institute_code: instituteCode,
          endpoint: sub.endpoint,
          p256dh,
          auth_key: authKey,
        });

        registered.current = true;
      } catch (err) {
        // Silently fail — push is non-critical
        console.warn("[push] Registration failed:", err);
      }
    };

    register();
  }, [instituteCode]);
}
