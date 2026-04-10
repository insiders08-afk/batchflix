/**
 * Prefetch critical route chunks during idle time so navigation feels instant.
 * Uses requestIdleCallback (with setTimeout fallback) to avoid blocking the main thread.
 */
const CHAT_ROUTES = [
  () => import("@/pages/AdminChatHub"),
  () => import("@/pages/TeacherChatHub"),
  () => import("@/pages/StudentChatHub"),
  () => import("@/pages/BatchWorkspace"),
  () => import("@/pages/DMConversation"),
];

const DASHBOARD_ROUTES = [
  () => import("@/pages/RoleSelection"),
  () => import("@/pages/AdminDashboard"),
  () => import("@/pages/TeacherDashboard"),
  () => import("@/pages/StudentDashboard"),
  () => import("@/pages/auth/AdminAuth"),
  () => import("@/pages/auth/TeacherAuth"),
  () => import("@/pages/auth/StudentAuth"),
];

let prefetched = false;

export function prefetchCriticalRoutes() {
  if (prefetched) return;
  prefetched = true;

  const idle = (typeof requestIdleCallback !== "undefined")
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 200);

  // First priority: chat routes (user complaint is about chat speed)
  idle(() => {
    CHAT_ROUTES.forEach((load) => load().catch(() => {}));
  });

  // Second priority: dashboards & auth
  idle(() => {
    DASHBOARD_ROUTES.forEach((load) => load().catch(() => {}));
  });
}
