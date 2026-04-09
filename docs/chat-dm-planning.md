# BatchHub — Real-Time Chat System & Bottom Navigation: Complete Implementation Plan

> **Status:** Planning only — no implementation code written yet. All decisions below are open to revision.  
> **Scope:** Admin ↔ Teacher DMs · Admin ↔ Student DMs · Bottom Nav · WhatsApp-style Chat Hub  
> **Out of scope (Phase 1):** Student ↔ Teacher · Teacher ↔ Teacher · any DM involving Parent role

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Current State Audit](#2-current-state-audit)
3. [Database Schema Changes](#3-database-schema-changes)
4. [Row Level Security (RLS) Policies](#4-row-level-security-rls-policies)
5. [Storage Bucket Changes](#5-storage-bucket-changes)
6. [Supabase Query & Subscription Layer](#6-supabase-query--subscription-layer)
7. [Frontend Component Tree](#7-frontend-component-tree)
8. [Navigation Architecture](#8-navigation-architecture)
9. [Role-Based Access Matrix](#9-role-based-access-matrix)
10. [TypeScript Type Changes](#10-typescript-type-changes)
11. [UI / UX Specification Per Screen](#11-ui--ux-specification-per-screen)
12. [Edge Cases & Potential Issues](#12-edge-cases--potential-issues)
13. [Phased Implementation Roadmap](#13-phased-implementation-roadmap)
14. [Open Questions](#14-open-questions)

---

## 1. Feature Overview

### What We Are Building

| Feature | Why It Matters |
|---|---|
| **Bottom navigation bar** | Persistent, Instagram-style tab bar replacing the hamburger menu as the primary navigation for the two highest-frequency actions (Attendance, Batch Chat) on mobile |
| **Admin Chat Hub** (WhatsApp-style list) | Central inbox for admin showing all conversations — batch group chats + 1-on-1 DMs — sorted by latest message |
| **Admin ↔ Teacher private DMs** | Admins and teachers need private channels. Without this, they default to WhatsApp, defeating the purpose of BatchHub |
| **Admin ↔ Student private DMs** | Admins need to discuss fees, individual issues, warnings privately with students |
| **Reciprocal access (Teacher/Student side)** | Every DM opened by admin must also appear on the other party's app so they can reply |

### What We Are NOT Building Yet

- Student ↔ Teacher DMs
- Teacher ↔ Teacher DMs
- Student ↔ Student DMs
- Parent access to any DM
- Group DMs with more than 2 participants (outside of batch group chats)
- Voice/video messages
- Message forwarding
- DM archiving / muting / blocking

---

## 2. Current State Audit

### 2.1 Existing Tables Relevant to Chat

| Table | Purpose | Gaps for New Feature |
|---|---|---|
| `batch_messages` | Group chat for a batch | No DM concept; tightly coupled to `batch_id` |
| `batches` | Batch metadata | No issue, used as-is |
| `profiles` | User profile (name, role, institute_code) | `avatar_url` exists but no DM thread awareness |
| `students_batches` | Student ↔ Batch enrolment | Used to list students under admin |
| `user_roles` | Multi-role mapping | Used for auth guard, no change needed |
| `push_subscriptions` | PWA push | Will need extension for DM push notifications |

### 2.2 Missing Entirely

- No `direct_conversations` table (no way to store an Admin↔Teacher or Admin↔Student DM thread)
- No `direct_messages` table (no messages for those threads)
- No unread count mechanism for DMs
- No concept of `conversation_type` distinguishing group vs. 1-on-1

### 2.3 Existing Navigation (`DashboardLayout.tsx`)

- Desktop: collapsible left sidebar (works fine, keep it)
- Mobile: hamburger → slide-in drawer (replace primary actions with bottom nav)
- No bottom navigation bar exists anywhere in the codebase today

### 2.4 Existing Routes (from `App.tsx`)

```
/batch/:id          → BatchWorkspace.tsx  (group chat lives here)
/admin/attendance   → AdminAttendance.tsx
/admin              → AdminDashboard.tsx
```
No `/admin/chat` or `/dm/:conversationId` route exists yet.

### 2.5 Existing Push Notification Infrastructure

`use-push-notifications.ts` + `sendPushNotification` from `lib/pushNotifications` exist and are already hooked into `batch_messages` inserts. DM messages will need to trigger the same mechanism with different payloads.

### 2.6 Existing Chat Features (inside `BatchWorkspace.tsx`)

The following features already work for batch group chat and must be replicated/shared for DMs:
- Text messages with sender name/role
- File attachments (images, PDFs via `chat-files` storage bucket with signed URLs)
- Reply-to (quoting a previous message)
- Emoji reactions (`reactions` jsonb column with `{ "👍": ["userId1", ...] }`)
- Edit message (with `is_edited` flag)
- Soft delete (with `is_deleted` flag, shows "This message was deleted")
- Real-time via Supabase Realtime (INSERT + UPDATE channels)
- Scroll-to-bottom button with auto-scroll on new messages
- Push notifications (teacher/admin → students, student → teacher)

---

## 3. Database Schema Changes

> All changes are additive (no existing columns deleted or renamed).

### 3.1 New Enum Type: `dm_type`

```sql
CREATE TYPE public.dm_type AS ENUM (
  'admin_teacher',   -- conversation between an admin and a teacher
  'admin_student'    -- conversation between an admin and a student
  -- future: 'student_teacher', 'teacher_teacher'
);
```

> **Why a separate enum instead of a string column?**  
> Prevents invalid values at the DB level. Cheaper to query/index. Consistent with existing project pattern (`app_role`, `user_status`, `institute_status` are all enums).

---

### 3.2 New Table: `direct_conversations`

Represents a single 1-on-1 DM thread between exactly two participants.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `institute_code` | `text` | NO | — | Scoping — all chats are institute-scoped |
| `dm_type` | `dm_type` (enum) | NO | — | `admin_teacher` or `admin_student` |
| `admin_id` | `uuid` | NO | — | The admin participant (`auth.users.id`) |
| `other_user_id` | `uuid` | NO | — | The teacher or student participant |
| `created_at` | `timestamptz` | NO | `now()` | When the conversation was first created |
| `updated_at` | `timestamptz` | NO | `now()` | Updated on every new message (for sorting) |
| `last_message_preview` | `text` | YES | `null` | Cached text of last message (for list display) |
| `last_message_at` | `timestamptz` | YES | `null` | Timestamp of last message (for sorting) |
| `admin_unread_count` | `integer` | NO | `0` | Unread count for the admin side |
| `other_user_unread_count` | `integer` | NO | `0` | Unread count for the teacher/student side |

**Constraints:**
```sql
-- Ensure no duplicate thread between same two people of same type
ALTER TABLE direct_conversations
  ADD CONSTRAINT direct_conversations_unique_pair
  UNIQUE (institute_code, dm_type, admin_id, other_user_id);
```

**Indexes:**
```sql
CREATE INDEX idx_dc_admin_id ON direct_conversations (admin_id);
CREATE INDEX idx_dc_other_user ON direct_conversations (other_user_id);
CREATE INDEX idx_dc_institute ON direct_conversations (institute_code);
CREATE INDEX idx_dc_last_msg ON direct_conversations (last_message_at DESC NULLS LAST);
```

---

### 3.3 New Table: `direct_messages`

Stores individual messages inside a DM thread.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `conversation_id` | `uuid` | NO | — | FK → `direct_conversations.id` ON DELETE CASCADE |
| `institute_code` | `text` | NO | — | Denormalized for RLS efficiency |
| `sender_id` | `uuid` | NO | — | `auth.users.id` of sender |
| `sender_name` | `text` | NO | — | Denormalized (same pattern as `batch_messages`) |
| `sender_role` | `text` | NO | — | `'admin'` or `'teacher'` or `'student'` |
| `message` | `text` | NO | — | Message body (empty string if only a file) |
| `file_url` | `text` | YES | `null` | Signed URL to `chat-files` storage |
| `file_name` | `text` | YES | `null` | Original filename |
| `file_type` | `text` | YES | `null` | MIME type |
| `reply_to_id` | `uuid` | YES | `null` | FK → `direct_messages.id` (self-ref) |
| `reactions` | `jsonb` | NO | `'{}'` | `{ "👍": ["user_id_1", ...] }` — same as batch_messages |
| `is_deleted` | `boolean` | NO | `false` | Soft delete |
| `is_edited` | `boolean` | NO | `false` | Edit flag |
| `created_at` | `timestamptz` | NO | `now()` | Message timestamp |

**Indexes:**
```sql
CREATE INDEX idx_dm_conversation ON direct_messages (conversation_id, created_at ASC);
CREATE INDEX idx_dm_sender ON direct_messages (sender_id);
```

---

### 3.4 Trigger: Auto-Update `direct_conversations` on New Message

After every INSERT into `direct_messages`, a trigger must:
1. Update `direct_conversations.last_message_preview` (truncated to 100 chars)
2. Update `direct_conversations.last_message_at = NEW.created_at`
3. Update `direct_conversations.updated_at = NOW()`
4. Increment `admin_unread_count` if sender is NOT the admin, OR increment `other_user_unread_count` if sender is NOT the other user

```sql
CREATE OR REPLACE FUNCTION public.after_direct_message_insert()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE direct_conversations
  SET
    last_message_preview = LEFT(NEW.message, 100),
    last_message_at = NEW.created_at,
    updated_at = NOW(),
    admin_unread_count = CASE
      WHEN NEW.sender_id <> admin_id THEN admin_unread_count + 1
      ELSE admin_unread_count
    END,
    other_user_unread_count = CASE
      WHEN NEW.sender_id <> other_user_id THEN other_user_unread_count + 1
      ELSE other_user_unread_count
    END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_after_dm_insert
AFTER INSERT ON direct_messages
FOR EACH ROW EXECUTE FUNCTION after_direct_message_insert();
```

### 3.5 Unread Count Reset

> **⚠️ SECURITY FIX:** Do NOT use raw UPDATE from the client — a teacher/student could manipulate `admin_unread_count` via the generic UPDATE policy. Instead, use a dedicated `SECURITY DEFINER` RPC that only resets the caller's own column.

```sql
CREATE OR REPLACE FUNCTION public.mark_dm_read(p_conversation_id UUID)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Reset ONLY the caller's unread column
  UPDATE direct_conversations
  SET
    admin_unread_count = CASE WHEN admin_id = auth.uid() THEN 0 ELSE admin_unread_count END,
    other_user_unread_count = CASE WHEN other_user_id = auth.uid() THEN 0 ELSE other_user_unread_count END
  WHERE id = p_conversation_id
    AND (admin_id = auth.uid() OR other_user_id = auth.uid());
END;
$$;
```

Frontend calls:
```typescript
await supabase.rpc("mark_dm_read", { p_conversation_id: conversationId });
```
This replaces the raw UPDATE approach and prevents cross-column manipulation.

### 3.6 Summary of All DB Changes

| Change | Type | Breaking? |
|---|---|---|
| Add `dm_type` enum | New enum | No |
| Add `direct_conversations` table | New table | No |
| Add `direct_messages` table | New table | No |
| Add trigger `after_direct_message_insert` | New trigger | No |
| Add trigger `trigger_dm_push` | New trigger | No |
| Add RPC `get_or_create_dm_conversation` | New function | No |
| Add RPC `get_batch_last_messages` | New function | No |
| Add RPC `mark_dm_read` | New function | No |
| ~~Extend `chat-files` storage policy~~ | ~~Modified policy~~ | **Removed — bucket is public, no policy needed** |
| No changes to any existing tables | — | No |

> **⚠️ KNOWN LIMITATION:** Batch group chats currently have no unread tracking. The "All" tab in the Chat Hub will show batch chats without unread badges. Adding batch unread tracking is a separate feature and should be planned for a future phase after DMs are stable.

---

## 4. Row Level Security (RLS) Policies

> All new tables have RLS enabled. Principle: A user can only read/write conversations they are a participant in, scoped to their institute.

### 4.1 `direct_conversations`

**SELECT** — Both participants can see their thread:
```sql
CREATE POLICY "Participants can view own conversations"
  ON direct_conversations FOR SELECT TO authenticated
  USING (
    institute_code = get_my_institute_code()
    AND (admin_id = auth.uid() OR other_user_id = auth.uid())
  );
```

**INSERT** — Only admins can create DM conversations:
```sql
CREATE POLICY "Admins can create DM conversations"
  ON direct_conversations FOR INSERT TO authenticated
  WITH CHECK (
    institute_code = get_my_institute_code()
    AND admin_id = auth.uid()
    AND has_role(auth.uid(), 'admin'::app_role)
  );
```

> **⚠️ FIX APPLIED:** Added `::app_role` enum cast. Without it, Postgres may fail to match the overloaded `has_role` function signature.

**UPDATE** — Both participants can update (for unread count reset):
```sql
CREATE POLICY "Participants can update own conversations"
  ON direct_conversations FOR UPDATE TO authenticated
  USING (
    institute_code = get_my_institute_code()
    AND (admin_id = auth.uid() OR other_user_id = auth.uid())
  )
  WITH CHECK (
    institute_code = get_my_institute_code()
    AND (admin_id = auth.uid() OR other_user_id = auth.uid())
  );
```

**DELETE** — No deletes allowed (no policy = blocked).

### 4.2 `direct_messages`

**SELECT** — Only conversation participants:
```sql
CREATE POLICY "Conversation participants can read messages"
  ON direct_messages FOR SELECT TO authenticated
  USING (
    institute_code = get_my_institute_code()
    AND EXISTS (
      SELECT 1 FROM direct_conversations dc
      WHERE dc.id = conversation_id
      AND (dc.admin_id = auth.uid() OR dc.other_user_id = auth.uid())
    )
  );
```

**INSERT** — Only participants, sender must be self:
```sql
CREATE POLICY "Participants can send messages"
  ON direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND institute_code = get_my_institute_code()
    AND EXISTS (
      SELECT 1 FROM direct_conversations dc
      WHERE dc.id = conversation_id
      AND (dc.admin_id = auth.uid() OR dc.other_user_id = auth.uid())
    )
  );
```

**UPDATE** — Participants can update (for reactions by either, edits/deletes by sender only — application-layer enforcement for granularity):
```sql
CREATE POLICY "Participants can update messages"
  ON direct_messages FOR UPDATE TO authenticated
  USING (
    institute_code = get_my_institute_code()
    AND EXISTS (
      SELECT 1 FROM direct_conversations dc
      WHERE dc.id = conversation_id
      AND (dc.admin_id = auth.uid() OR dc.other_user_id = auth.uid())
    )
  );
```

**DELETE** — No hard deletes (soft delete via `is_deleted = true` only).

---

## 5. Storage Bucket Changes

> **⚠️ FIX APPLIED:** The `chat-files` bucket is already **PUBLIC** (`is_public: true` in Supabase config). Public buckets serve files directly via their public URL without any RLS check on `storage.objects`. Therefore, the proposed private-bucket RLS policy with `LIKE '%' || name` subqueries is **invalid and unnecessary**.
>
> **No storage changes are needed.** DM file uploads will use the same `chat-files` public bucket. The upload path will be scoped by folder (e.g., `dm/{conversation_id}/{filename}`) for organization, but access control for DM files is handled at the application layer (only participants see the `file_url` via `direct_messages` RLS).

**Action:** None. Keep `chat-files` as public. No new buckets. No policy changes.

`homework-files` and `applicant-photos` are also public and unaffected.

---

## 6. Supabase Query & Subscription Layer

### 6.1 Queries for Admin Chat Hub

**Q1 — Fetch all institute batches** (for "Batch Chats" tab):
```typescript
supabase.from("batches")
  .select("id, name, course, teacher_name, updated_at")
  .eq("institute_code", instituteCode)
  .eq("is_active", true)
  .order("updated_at", { ascending: false })
```

**Q2 — Fetch last message per batch** (for preview in list):  
Create a Supabase RPC `get_batch_last_messages(institute_code)` that returns the latest `batch_messages` row per batch using `DISTINCT ON (batch_id)`. This avoids N+1 queries.

**Q3 — Fetch all teachers in institute** (for "Teachers" tab):
```typescript
supabase.from("profiles")
  .select("user_id, full_name, avatar_url")
  .eq("institute_code", instituteCode)
  .eq("role", "teacher")
  .order("full_name")
```

**Q4 — Fetch all students in institute** (for "Students" tab):
```typescript
supabase.from("profiles")
  .select("user_id, full_name, avatar_url")
  .eq("institute_code", instituteCode)
  .eq("role", "student")
  .order("full_name")
```

**Q5 — Fetch all DM conversations for admin**:
```typescript
supabase.from("direct_conversations")
  .select("*")
  .eq("institute_code", instituteCode)
  .eq("admin_id", currentUserId)
  .order("last_message_at", { ascending: false, nullsFirst: false })
```

**Q6 — "All" tab merge**: Client-side merge of Q1+Q2+Q5, sorted by `last_message_at` descending.

**Q7 — Get-or-create DM conversation** (when admin taps a teacher/student):  
Use RPC `get_or_create_dm_conversation(admin_id, other_user_id, dm_type, institute_code)` that does an atomic upsert and returns the `conversation_id`.

### 6.2 Queries for DM Conversation Screen

**Q8 — Fetch messages**:
```typescript
supabase.from("direct_messages")
  .select("*")
  .eq("conversation_id", conversationId)
  .order("created_at", { ascending: true })
  .limit(100)
```

**Q9 — Send a message**:
```typescript
supabase.from("direct_messages").insert({
  conversation_id, institute_code,
  sender_id, sender_name, sender_role,
  message, reply_to_id,
  file_url, file_name, file_type,
})
```

**Q10 — Mark as read** (reset unread count):
```typescript
// If current user is the admin:
supabase.from("direct_conversations")
  .update({ admin_unread_count: 0 })
  .eq("id", conversationId)
// If current user is teacher/student:
supabase.from("direct_conversations")
  .update({ other_user_unread_count: 0 })
  .eq("id", conversationId)
```

**Q11 — Edit a message**:
```typescript
supabase.from("direct_messages")
  .update({ message: newText, is_edited: true })
  .eq("id", messageId)
  .eq("sender_id", currentUserId) // only own messages
```

**Q12 — Soft delete a message**:
```typescript
supabase.from("direct_messages")
  .update({ is_deleted: true, message: "This message was deleted",
            file_url: null, file_name: null, file_type: null })
  .eq("id", messageId)
  .eq("sender_id", currentUserId)
```

### 6.3 Real-time Subscriptions

**Sub-1 — DM messages in open conversation** (for live chat):
```typescript
supabase.channel(`dm-${conversationId}`)
  .on("postgres_changes", {
    event: "INSERT", schema: "public", table: "direct_messages",
    filter: `conversation_id=eq.${conversationId}`
  }, handleNewMsg)
  .on("postgres_changes", {
    event: "UPDATE", schema: "public", table: "direct_messages",
    filter: `conversation_id=eq.${conversationId}`
  }, handleEditOrReaction)
  .subscribe()
```

**Sub-2 — DM conversation list updates** (for chat hub auto-refresh):
```typescript
// Admin side: listen for conversations where admin_id = me
supabase.channel(`dm-list-${currentUserId}`)
  .on("postgres_changes", {
    event: "*", schema: "public", table: "direct_conversations",
    filter: `admin_id=eq.${currentUserId}`
  }, handleListRefresh)
  .subscribe()

// Teacher/Student side: listen for conversations where other_user_id = me
supabase.channel(`dm-list-${currentUserId}`)
  .on("postgres_changes", {
    event: "*", schema: "public", table: "direct_conversations",
    filter: `other_user_id=eq.${currentUserId}`
  }, handleListRefresh)
  .subscribe()
```

### 6.4 DB Functions (RPCs) to Create

> **⚠️ FIX APPLIED:** Added full SQL implementations (the original plan only listed function names without bodies).

#### RPC 1: `get_or_create_dm_conversation`

```sql
CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(
  p_admin_id UUID,
  p_other_user_id UUID,
  p_dm_type dm_type,
  p_institute_code TEXT
)
RETURNS UUID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Must be called by the admin
  IF p_admin_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the admin can create DM conversations';
  END IF;

  -- Try to find existing
  SELECT id INTO v_id
  FROM direct_conversations
  WHERE institute_code = p_institute_code
    AND dm_type = p_dm_type
    AND admin_id = p_admin_id
    AND other_user_id = p_other_user_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Create new
  INSERT INTO direct_conversations (institute_code, dm_type, admin_id, other_user_id)
  VALUES (p_institute_code, p_dm_type, p_admin_id, p_other_user_id)
  ON CONFLICT (institute_code, dm_type, admin_id, other_user_id) DO NOTHING
  RETURNING id INTO v_id;

  -- Handle race condition: if ON CONFLICT fired, re-select
  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM direct_conversations
    WHERE institute_code = p_institute_code
      AND dm_type = p_dm_type
      AND admin_id = p_admin_id
      AND other_user_id = p_other_user_id;
  END IF;

  RETURN v_id;
END;
$$;
```

#### RPC 2: `get_batch_last_messages`

```sql
CREATE OR REPLACE FUNCTION public.get_batch_last_messages(p_institute_code TEXT)
RETURNS TABLE (
  batch_id UUID,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  sender_name TEXT
) LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (bm.batch_id)
    bm.batch_id,
    CASE WHEN bm.is_deleted THEN 'This message was deleted'
         WHEN bm.file_url IS NOT NULL AND bm.message = '' THEN '📎 ' || COALESCE(bm.file_name, 'File')
         ELSE LEFT(bm.message, 100)
    END AS last_message,
    bm.created_at AS last_message_at,
    bm.sender_name
  FROM batch_messages bm
  WHERE bm.institute_code = p_institute_code
  ORDER BY bm.batch_id, bm.created_at DESC;
$$;
```

---

## 7. Frontend Component Tree

### 7.1 New Files to Create

```
src/
├── components/
│   ├── BottomNav.tsx                    ← Persistent bottom tab bar
│   ├── chat/
│   │   ├── ChatListItem.tsx             ← Single row in chat hub (avatar, name, preview, badge)
│   │   ├── ChatSearchBar.tsx            ← Search input with clear button
│   │   └── MessageBubble.tsx            ← Extracted from BatchWorkspace (shared)
│
├── pages/
│   ├── AdminChatHub.tsx                 ← Admin's 4-tab chat list (/admin/chat)
│   ├── TeacherChatHub.tsx               ← Teacher's 2-tab chat list (/teacher/chat)
│   ├── StudentChatHub.tsx               ← Student's 2-tab chat list (/student/chat)
│   └── DMConversation.tsx               ← Full DM chat screen (/dm/:conversationId)
│
├── hooks/
│   ├── useDirectMessages.ts             ← DM thread state + realtime
│   └── useDMList.ts                     ← DM conversation list + realtime
│
├── types/
│   └── chat.ts                          ← All new TypeScript interfaces
```

### 7.2 Files to Modify

```
src/
├── App.tsx                              ← Add 4 new routes
├── components/
│   └── DashboardLayout.tsx              ← Integrate BottomNav, add pb-16 on mobile
├── pages/
│   └── BatchWorkspace.tsx               ← Extract MessageBubble into shared component
```

### 7.3 Component Responsibilities

**`BottomNav.tsx`**

> **⚠️ FIX APPLIED:** Changed from 2 tabs to 3 tabs. A "Home" tab is essential — without it, users on the Chat or Attendance screen have no way to return to the dashboard without using the browser back button.

- Props: `role: "admin" | "teacher" | "student"`, `chatUnreadCount: number`
- Fixed at bottom, `z-50`, hidden on `lg:` (desktop uses sidebar)
- **Three tabs:** Home (`Home` icon) + Attendance (`CalendarCheck` icon) + Chat (`MessageSquare` icon)
- Chat tab shows total unread badge
- `pb-safe` for iPhone notch via `env(safe-area-inset-bottom)`
- Active tab: filled icon + primary color, spring scale animation

**`AdminChatHub.tsx`**
- Header: institute name (bold)
- Search bar: filters list by name or last message preview
- 4-tab toggle: All | Batch Chats | Teachers | Students
- Each tab renders `<ChatListItem>` rows
- "All" tab: merged & sorted by `last_message_at DESC`
- Batch row tap → `/batch/:id` (existing BatchWorkspace)
- Teacher/Student row tap → `get_or_create_dm_conversation()` → `/dm/:conversationId`
- Empty states per tab

**`ChatListItem.tsx`**
- Props: `avatar`, `name`, `subtitle`, `lastMessage`, `lastMessageAt`, `unreadCount`, `onClick`
- 72px height, avatar (initials circle), name (bold), preview (muted, ellipsis), time, unread badge
- Unread badge: red pill, capped at "99+"

**`DMConversation.tsx`**
- Route: `/dm/:conversationId`
- Header: back arrow + other user's name + role subtitle
- Reuses `MessageBubble.tsx` for rendering
- Features: send text, attach file, reply-to, reactions, edit, soft delete
- Resets unread count on open
- Realtime: Sub-1 subscription
- No attendance/announcements/tests tabs (message-only)

**`MessageBubble.tsx`** (extracted from `BatchWorkspace.tsx`)
- Currently ~400 lines inline in BatchWorkspace
- Extract into shared component with props: `message`, `isSelf`, `onReact`, `onReply`, `onEdit`, `onDelete`, etc.
- Reused by both BatchWorkspace (group chat) and DMConversation (1-on-1)

**`useDirectMessages.ts`**
- Encapsulates: fetch messages, send message, realtime sub, edit, delete, react
- Returns: `{ messages, sendMessage, editMessage, deleteMessage, reactToMessage, loading }`

**`useDMList.ts`**
- Encapsulates: fetch DM conversations + realtime update on new messages
- Returns: `{ conversations, totalUnread, loading }`

**`TeacherChatHub.tsx`**
- Simpler: 2-tab toggle (All | Admin DM)
- "All" = teacher's assigned batch chats + admin DM thread
- Batch chats: from `batches` where `teacher_id = currentUserId`

**`StudentChatHub.tsx`**
- Simplest: 2-tab toggle (All | Admin DM)
- "All" = enrolled batch chats + admin DM thread
- Batch chats: from `students_batches` where `student_id = currentUserId`

---

## 8. Navigation Architecture

### 8.1 New Routes in `App.tsx`

```typescript
// Admin
<Route path="/admin/chat" element={<AdminChatHub />} />
<Route path="/dm/:conversationId" element={<DMConversation />} />
// /batch/:id already exists — no change

// Teacher
<Route path="/teacher/chat" element={<TeacherChatHub />} />
// Teacher DM uses same /dm/:conversationId route

// Student
<Route path="/student/chat" element={<StudentChatHub />} />
// Student DM uses same /dm/:conversationId route
```

### 8.2 Bottom Nav Tab → Route Mapping

| Role | Tab 1 (Left) | Tab 2 (Center) | Tab 3 (Right) |
|---|---|---|---|
| Admin | `/${role}` Home | `/${role}/attendance` (CalendarCheck) | `/${role}/chat` (MessageSquare) |
| Teacher | `/${role}` Home | `/${role}/attendance` (CalendarCheck) | `/${role}/chat` (MessageSquare) |
| Student | `/${role}` Home | `/${role}/attendance` (CalendarCheck) | `/${role}/chat` (MessageSquare) |

### 8.3 Navigation Flow: Admin

```
AdminDashboard (sidebar)
  └── Bottom Nav: [Attendance] [Chat 🔴3]
        └── Chat → AdminChatHub
              ├── Batch Chats tab → tap → /batch/:id (existing)
              ├── Teachers tab → tap → get_or_create_dm → /dm/:id
              └── Students tab → tap → get_or_create_dm → /dm/:id
```

### 8.4 Navigation Flow: Teacher

```
TeacherDashboard (sidebar)
  └── Bottom Nav: [Attendance] [Chat 🔴1]
        └── Chat → TeacherChatHub
              ├── Batch chats → tap → /batch/:id
              └── Admin DM → tap → /dm/:id
```

### 8.5 Navigation Flow: Student

```
StudentDashboard (sidebar)
  └── Bottom Nav: [Attendance] [Chat 🔴2]
        └── Chat → StudentChatHub
              ├── Batch chats → tap → /batch/:id
              └── Admin DM → tap → /dm/:id
```

### 8.6 Back Navigation

- `/dm/:id` → `navigate(-1)` with fallback to `/${role}/chat` if `history.length ≤ 2`
- `/admin/chat` → back returns to previous page

### 8.7 Bottom Nav Visibility Rules

| Screen | Bottom Nav Shown? |
|---|---|
| Any Dashboard page | ✅ Yes |
| AdminChatHub / TeacherChatHub / StudentChatHub | ✅ Yes |
| `/dm/:conversationId` (DM screen) | ❌ Hide (full immersion) |
| `/batch/:id` (BatchWorkspace) | ❌ Hide (already has its own back button + tabs) |
| Auth screens, landing page | ❌ Hide |

---

## 9. Role-Based Access Matrix

### 9.1 Bottom Navigation

| Role | Bottom Nav Shown? | Tabs |
|---|---|---|
| Admin | ✅ | Home, Attendance, Chat |
| Teacher | ✅ | Home, Attendance, Chat |
| Student | ✅ | Home, Attendance, Chat |
| Parent | ❌ | — |
| Super Admin | ❌ | — |

### 9.2 Chat Hub Features

| Feature | Admin | Teacher | Student | Parent |
|---|---|---|---|---|
| See ALL institute batch chats | ✅ | ❌ (assigned only) | ❌ (enrolled only) | ❌ |
| See teacher list + initiate DM | ✅ | ❌ | ❌ | ❌ |
| See student list + initiate DM | ✅ | ❌ | ❌ | ❌ |
| Receive DM from admin | N/A | ✅ | ✅ | ❌ |
| Reply in existing DM thread | ✅ | ✅ | ✅ | ❌ |
| Search conversations | ✅ | ✅ | ✅ | ❌ |

### 9.3 Direct Message Permissions

| Action | Admin | Teacher | Student |
|---|---|---|---|
| Create a new DM conversation | ✅ (initiator only) | ❌ | ❌ |
| Send messages in their thread | ✅ | ✅ | ✅ |
| Read messages in their thread | ✅ | ✅ | ✅ |
| Edit own messages | ✅ | ✅ | ✅ |
| Soft delete own messages | ✅ | ✅ | ✅ |
| React to any message in thread | ✅ | ✅ | ✅ |
| Attach files | ✅ | ✅ | ✅ |
| Reply to a message | ✅ | ✅ | ✅ |

---

## 10. TypeScript Type Changes

### 10.1 New File: `src/types/chat.ts`

```typescript
export type DmType = "admin_teacher" | "admin_student";

export interface DirectConversation {
  id: string;
  institute_code: string;
  dm_type: DmType;
  admin_id: string;
  other_user_id: string;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  admin_unread_count: number;
  other_user_unread_count: number;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  institute_code: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  is_deleted: boolean;
  is_edited: boolean;
  created_at: string;
  isSelf?: boolean; // computed client-side
}

// Unified thread type for the "All" tab
export type ChatThreadType = "batch_group" | "dm";

export interface UnifiedChatThread {
  id: string;              // batch_id or conversation_id
  type: ChatThreadType;
  name: string;            // batch name or person name
  subtitle: string;        // course name or role label
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  avatarInitials: string;
}
```

### 10.2 Auto-generated Types

After migration is applied, regenerate:
```bash
npx supabase gen types typescript --project-id zakmujlzcobyiojmqlyd > src/integrations/supabase/types.ts
```

---

## 11. UI / UX Specification Per Screen

### 11.1 Bottom Navigation Bar

- **Height:** 56px fixed
- **Position:** `fixed bottom-0 left-0 right-0 z-50`
- **Visibility:** Mobile only (`lg:hidden`)
- **Background:** `bg-card` with `border-t border-border/50` + subtle upward shadow
- **Active tab:** Filled icon + primary color label + small dot indicator
- **Inactive tab:** Muted icon + muted label
- **Badge:** Small red circle on icon, unread count, hidden if 0
- **Safe area:** `padding-bottom: env(safe-area-inset-bottom)` for iPhone
- **Animation:** Active icon scales 1.0 → 1.15 → 1.0 (spring, 200ms)

### 11.2 Admin Chat Hub (`/admin/chat`)

**Header (sticky, 56px):**
- Left: Institute name (bold, truncated with ellipsis)
- Right: Search icon toggle (future: settings icon)

**Search Bar (conditional):**
- Appears below header when search icon tapped
- Filters by thread name or last message preview
- Clear (×) button on right
- Placeholder: "Search conversations..."

**Tab Toggle:**
- 4 pills: All | Batch Chats | Teachers | Students
- Horizontally scrollable on small screens
- Active: primary bg + white text
- Inactive: muted bg + foreground text
- Sliding indicator animation

**Chat List:**
- Each item 72px height
  - Left: 40px avatar circle (initials, color from name hash)
  - Center: Name (bold, 15px) + preview (muted, 13px, 1-line ellipsis)
  - Right: Time (muted, 11px, top-aligned) + Unread badge (red pill, bottom-aligned)
- Subtle bottom border between items

**Empty States:**
- No batches: "No active batches. Create one from Batches section."
- No teachers: "No teachers in your institute yet."
- No students: "No students enrolled yet."
- No conversations (All tab): "No conversations yet. Start chatting from Teachers or Students tabs."

### 11.3 DM Conversation Screen (`/dm/:id`)

**Header (sticky):**
- Back arrow (←)
- Avatar circle + Name of other person
- Subtitle: "Teacher" or "Student"

**Message Area:**
- Same layout as BatchWorkspace chat tab
- Self messages: right-aligned, primary color bubble
- Other messages: left-aligned, muted bubble
- Shared `MessageBubble.tsx` component

**Input Area:**
- Text input + file attach button + send button
- Reply preview bar above input when replying

### 11.4 Teacher Chat Hub (`/teacher/chat`)

- Header: Institute name
- Search bar
- 2-tab toggle: All | Admin DM
- "All" = assigned batches + admin DM
- Simpler than admin version

### 11.5 Student Chat Hub (`/student/chat`)

- Header: Institute name
- Search bar
- 2-tab toggle: All | Admin DM
- "All" = enrolled batches + admin DM

---

## 12. Edge Cases & Potential Issues

### 12.1 Data & State

| Edge Case | Risk | Mitigation |
|---|---|---|
| Admin taps teacher not yet in institute | Invalid DM would be created | RLS `WITH CHECK (institute_code = get_my_institute_code())` blocks it |
| 200+ students in one institute | Laggy scroll on mobile | Paginate with infinite scroll or use `react-window` virtualization |
| Two admins in one institute | Each admin creates their own DM threads | UNIQUE constraint scopes to `(admin_id, other_user_id)` — no conflict. Each admin manages their own conversations |
| Last message is a file-only message | Preview shows empty or filename | Store `"📎 filename.pdf"` format in trigger preview |
| Teacher leaves institute (profile changes) | Conversation remains, teacher gone | Show "(Former Teacher)" label when profile lookup returns null or mismatched institute |
| Conversation created but never messaged | `last_message_at = null`, `last_message_preview = null` | Sort nulls last; show "No messages yet" as preview text |
| Same user has multiple roles | Could create confusion in DM lookup | `dm_type` + `other_user_id` uniquely identifies the thread context |
| Race condition on `get_or_create_dm` | Two rapid taps create duplicate rows | UNIQUE constraint prevents dups; RPC uses `INSERT ... ON CONFLICT DO NOTHING RETURNING id` |
| Unread count goes negative | Multiple rapid resets | Set to `0` directly, never decrement |

### 12.2 Real-time

| Edge Case | Risk | Mitigation |
|---|---|---|
| Supabase connection drops silently | Messages stop appearing | Supabase client auto-reconnects; show "Reconnecting..." banner if offline |
| Multiple browser tabs open | Messages appear twice | De-duplicate by `id` in state setter (already done in BatchWorkspace pattern) |
| Realtime fires before INSERT returns | Self-message appears twice briefly | `isSelf` check + `id` dedup prevents visual duplicate |
| Teacher/student realtime filter | `admin_id` filter won't work for them | Use `other_user_id` filter for non-admin participants |

### 12.3 UI / Navigation

| Edge Case | Risk | Mitigation |
|---|---|---|
| Back from `/dm/:id` goes to wrong screen | User navigated from outside app | `navigate(-1)` with fallback to `/${role}/chat` if `history.length ≤ 2` |
| Bottom nav overlaps content | Last items hidden behind 56px bar | Add `pb-16` + `env(safe-area-inset-bottom)` to `<main>` |
| No batches exist | Batch Chats tab is empty | Show empty state, don't crash |
| Institute name too long | Overflows header | Truncate with `truncate` class (already done in DashboardLayout) |
| Student has no enrolled batches | "All" tab empty | Show "Join a batch to see group chats here" + link to `/student/apply-batch` |
| Teacher assigned to 0 batches | "All" tab empty | Show "You have no assigned batches yet" |

### 12.4 Security

| Issue | Risk | Mitigation |
|---|---|---|
| User guesses another `conversationId` | Reads others' messages | RLS requires participant membership via subquery |
| Admin from Institute A creates DM in Institute B | Cross-institute leak | `WITH CHECK (institute_code = get_my_institute_code())` blocks it |
| Teacher updates `admin_unread_count` | Marks admin's messages read fraudulently | Consider separate RPC for read-marking with column-specific guards |
| DM file accessible to non-participant | Privacy leak | Extended storage policy checks `direct_messages` table membership |

### 12.5 Push Notifications

> **⚠️ FIX APPLIED:** Added DB trigger requirement for DM push notifications. Without this, DM messages will be silent.

| Issue | Risk | Mitigation |
|---|---|---|
| DM message should notify recipient | No push for DMs currently | **Create a DB trigger `trigger_dm_push`** on `direct_messages` AFTER INSERT that calls the `send-push-notifications` edge function with `target_user_ids` set to the other participant. Pattern: look up `direct_conversations` to find `admin_id` / `other_user_id`, determine who is NOT the sender, and push to them. |
| Push shows message preview on lock screen | Privacy concern | Accept this (WhatsApp default); can add opt-out toggle later |
| Teacher has no push subscription | Silent failure | `sendPushNotification` already handles missing subscriptions gracefully |

**Trigger SQL (to be included in Phase 1 migration):**
```sql
CREATE OR REPLACE FUNCTION public.trigger_dm_push()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conv       RECORD;
  v_target_id  UUID;
  v_url        TEXT;
  v_anon_key   TEXT;
BEGIN
  SELECT admin_id, other_user_id, institute_code
  INTO v_conv
  FROM direct_conversations
  WHERE id = NEW.conversation_id;

  -- Determine the recipient (the one who did NOT send)
  IF NEW.sender_id = v_conv.admin_id THEN
    v_target_id := v_conv.other_user_id;
  ELSE
    v_target_id := v_conv.admin_id;
  END IF;

  v_anon_key := current_setting('app.settings.supabase_anon_key', true);
  v_url := current_setting('app.settings.supabase_url', true);

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/send-push-notifications',
    body    := jsonb_build_object(
      'institute_code', v_conv.institute_code,
      'target_user_ids', jsonb_build_array(v_target_id),
      'title', 'New message from ' || NEW.sender_name,
      'body', LEFT(NEW.message, 100),
      'url', '/dm/' || NEW.conversation_id
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[dm_push_trigger] %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dm_push
AFTER INSERT ON direct_messages
FOR EACH ROW EXECUTE FUNCTION trigger_dm_push();
```

---

## 13. Phased Implementation Roadmap

> **Rule:** Each phase is independently deployable without breaking existing features.

### Phase 0 — Pre-work & Refactoring (1–2 hours)

- [ ] **P0.1** Extract `MessageBubble` component from `BatchWorkspace.tsx` → `src/components/chat/MessageBubble.tsx`
- [ ] **P0.2** Create `src/types/chat.ts` with all new TypeScript interfaces
- [ ] **P0.3** Verify `get_my_institute_code()` works for all roles (admin, teacher, student)
- [ ] **VERIFY:** BatchWorkspace still works identically after MessageBubble extraction

---

### Phase 1 — Database Migration (1–2 hours)

- [ ] **P1.1** Create migration: `dm_type` enum
- [ ] **P1.2** Create migration: `direct_conversations` table + indexes + UNIQUE constraint
- [ ] **P1.3** Create migration: `direct_messages` table + indexes + FKs
- [ ] **P1.4** Create migration: trigger `after_direct_message_insert`
- [ ] **P1.5** Create migration: RLS policies for both new tables
- [ ] **P1.6** Create migration: extend `chat-files` storage read policy
- [ ] **P1.7** Create migration: RPC `get_or_create_dm_conversation`
- [ ] **P1.8** Create migration: RPC `get_batch_last_messages`
- [ ] **P1.9** Apply migration to Supabase
- [ ] **P1.10** Regenerate `types.ts` from live schema
- [ ] **VERIFY:** No existing features broken — batch messages, attendance, fees all still work

---

### Phase 2 — Bottom Navigation Bar (2–3 hours)

- [ ] **P2.1** Create `src/components/BottomNav.tsx` — 2 tabs, icons, active state, badge slot
- [ ] **P2.2** Integrate into `DashboardLayout.tsx` — render below `<main>`, add `pb-16` on mobile
- [ ] **P2.3** Gate by role (`admin | teacher | student` only)
- [ ] **P2.4** Wire Chat tab to `/admin/chat` (placeholder page initially)
- [ ] **P2.5** Wire Attendance tab to `/${role}/attendance`
- [ ] **VERIFY:** Desktop sidebar unaffected. Bottom nav hidden on `≥1024px`. Active tab highlights correctly.

---

### Phase 3 — Admin Chat Hub (4–6 hours)

- [ ] **P3.1** Create `AdminChatHub.tsx` with header + search + 4-tab toggle
- [ ] **P3.2** Create `ChatListItem.tsx`
- [ ] **P3.3** Create `ChatSearchBar.tsx`
- [ ] **P3.4** Implement "Batch Chats" tab — fetch & display all institute batches
- [ ] **P3.5** Implement "Teachers" tab — fetch & display all institute teachers with DM status
- [ ] **P3.6** Implement "Students" tab — fetch & display all institute students with DM status
- [ ] **P3.7** Implement "All" tab — merged list sorted by `last_message_at`
- [ ] **P3.8** Add route `/admin/chat` in `App.tsx`
- [ ] **P3.9** Wire bottom nav Chat tab to `/admin/chat`
- [ ] **P3.10** Batch rows: tap → `/batch/:id` (existing BatchWorkspace)
- [ ] **VERIFY:** Search works. Empty states render. No crash with 0 batches/teachers/students.

---

### Phase 4 — DM Conversation Screen (4–6 hours)

- [ ] **P4.1** Create `useDirectMessages.ts` hook
- [ ] **P4.2** Create `DMConversation.tsx` page
- [ ] **P4.3** Add route `/dm/:conversationId` in `App.tsx`
- [ ] **P4.4** Implement `get_or_create_dm_conversation` call on teacher/student tap
- [ ] **P4.5** Implement message fetch + realtime subscription (Sub-1)
- [ ] **P4.6** Implement send message (text + file)
- [ ] **P4.7** Implement reply-to
- [ ] **P4.8** Implement emoji reactions
- [ ] **P4.9** Implement edit message
- [ ] **P4.10** Implement soft delete
- [ ] **P4.11** Implement scroll-to-bottom + scroll-down button
- [ ] **P4.12** Implement "mark as read" on conversation open
- [ ] **P4.13** Push notification on new DM message
- [ ] **VERIFY:** Messages appear in real-time. File upload works. Back navigation correct.

---

### Phase 5 — Unread Counts & Real-time List (2–3 hours)

- [ ] **P5.1** Create `useDMList.ts` hook
- [ ] **P5.2** Plug into `AdminChatHub.tsx`
- [ ] **P5.3** Show `admin_unread_count` badge on each DM thread row
- [ ] **P5.4** Sum all unread counts → show on bottom nav Chat badge
- [ ] **VERIFY:** DM from teacher → badge appears on admin hub in real-time

---

### Phase 6 — Teacher-Side Reciprocal Access (2–3 hours)

- [ ] **P6.1** Create `TeacherChatHub.tsx` — 2-tab (All, Admin DM)
- [ ] **P6.2** "All" tab: teacher's assigned batch chats + admin DM thread
- [ ] **P6.3** Add route `/teacher/chat` in `App.tsx`
- [ ] **P6.4** Wire teacher bottom nav Chat tab
- [ ] **P6.5** Realtime Sub-2 variant (filter on `other_user_id`)
- [ ] **P6.6** Teacher tapping DM → `/dm/:conversationId`
- [ ] **P6.7** Mark as read: reset `other_user_unread_count`
- [ ] **P6.8** Push notification to admin when teacher replies
- [ ] **VERIFY:** Teacher sees admin's messages. Reply shows on admin screen in real-time.

---

### Phase 7 — Student-Side Reciprocal Access (2–3 hours)

- [ ] **P7.1** Create `StudentChatHub.tsx` — 2-tab (All, Admin DM)
- [ ] **P7.2** "All" tab: enrolled batch chats + admin DM thread
- [ ] **P7.3** Add route `/student/chat` in `App.tsx`
- [ ] **P7.4** Wire student bottom nav Chat tab
- [ ] **P7.5** Same realtime + mark-as-read pattern as teacher
- [ ] **P7.6** Push notification to admin when student replies
- [ ] **VERIFY:** Full round-trip: admin sends → student receives push → student replies → admin sees reply

---

### Phase 8 — Integration Testing & Polish (2–3 hours)

- [ ] **P8.1** Test admin → teacher DM → teacher receives + badge → teacher replies → admin sees reply
- [ ] **P8.2** Same flow for admin ↔ student
- [ ] **P8.3** Verify batch group chat completely unaffected
- [ ] **P8.4** Test mobile: bottom nav visible, content not hidden, safe-area correct
- [ ] **P8.5** Test empty states: 0 teachers, 0 students, 0 batches
- [ ] **P8.6** Test large file upload (near 10MB limit)
- [ ] **P8.7** Test slow network: skeletons appear, no crash
- [ ] **P8.8** Zero `as any` casts in new code, strict TypeScript

---

## 14. Open Questions

> Decisions needed before or during implementation. Suggested defaults provided.

| # | Question | Context | Suggested Default |
|---|---|---|---|
| **Q1** | Can a teacher/student initiate a DM with admin, or only admin can start? | Current plan: admin-only initiation. Others only reply. | Admin-only initiation |
| **Q2** | If institute has 2 admins, can both DM the same teacher? | Each admin creates their own thread. Teacher sees 2 separate DMs. | Yes, separate threads per admin |
| **Q3** | Should DM support a max message length? | BatchWorkspace has no enforced limit currently. | 1000 characters |
| **Q4** | Should "All" tab show batch chats with last message preview? | Requires `get_batch_last_messages` RPC — extra effort. | Yes, show preview (better UX) |
| **Q5** | What happens to DM threads when teacher is removed from institute? | Profile `institute_code` changes. Thread remains in DB. | Keep thread readable, label "(Former Teacher)" |
| **Q6** | Should DM show typing indicator? | Nice UX but adds complexity (presence channels). | No for Phase 1, plan for later |
| **Q7** | Should admin be able to delete entire DM thread? | Data cleanup. Requires CASCADE. | No for Phase 1 |
| **Q8** | How many messages to load initially? | BatchWorkspace loads 100, no pagination. | 100 messages, add "load more" later |
| **Q9** | Push notification content — generic or show preview? | Preview shows on lock screen (privacy). | Show preview (WhatsApp default) |
| **Q10** | Should bottom nav be visible on BatchWorkspace (`/batch/:id`)? | BatchWorkspace has its own tabs/header — may clash. | Hide bottom nav on BatchWorkspace |
| **Q11** | Should `direct_conversations` be visible to super_admin for auditing? | Security consideration. | No — private to participants only |
| **Q12** | DM sidebar entry in desktop sidebar menu? | Desktop uses sidebar, not bottom nav. Need a "Chat" entry there too. | Add "Chat" to `menusByRole` in DashboardLayout |

---

## Appendix A — DB Change Summary

```
NEW:
  enum:    dm_type
  table:   direct_conversations  (11 columns, 4 indexes, 1 UNIQUE)
  table:   direct_messages       (15 columns, 2 indexes)
  trigger: after_direct_message_insert
  rpc:     get_or_create_dm_conversation
  rpc:     get_batch_last_messages

MODIFIED:
  policy:  "chat-files" storage read  (extended for direct_messages)

UNCHANGED:
  batch_messages, batches, profiles, students_batches, user_roles,
  attendance, fees, homeworks, announcements, test_scores, push_subscriptions
```

## Appendix B — File Change Summary

```
NEW FILES (11):
  src/types/chat.ts
  src/components/BottomNav.tsx
  src/components/chat/MessageBubble.tsx
  src/components/chat/ChatListItem.tsx
  src/components/chat/ChatSearchBar.tsx
  src/hooks/useDirectMessages.ts
  src/hooks/useDMList.ts
  src/pages/AdminChatHub.tsx
  src/pages/TeacherChatHub.tsx
  src/pages/StudentChatHub.tsx
  src/pages/DMConversation.tsx

MODIFIED FILES (3):
  src/App.tsx                          (+4 routes)
  src/components/DashboardLayout.tsx   (+BottomNav, +pb-16, +Chat sidebar entry)
  src/pages/BatchWorkspace.tsx         (MessageBubble extraction)

AUTO-REGENERATED (1):
  src/integrations/supabase/types.ts   (after migration)

MIGRATION FILES (1):
  supabase/migrations/YYYYMMDD_chat_dm_system.sql
```

---

*Last updated: 2026-04-10 · BatchHub project · Planning document v2.0*  
*Next step: Review open questions (Section 14), confirm decisions, then begin Phase 0.*
