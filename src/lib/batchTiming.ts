/**
 * Utility functions for batch timing — shared across attendance pages.
 * 
 * IMPORTANT: Days are stored as 3-letter abbreviations ("Mon","Tue","Wed"…)
 * matching the WEEKDAYS array in AdminBatches.tsx.
 * JS Date.getDay() → 0-6, mapped via JS_DAY_ABBREVS below.
 */

export interface BatchTiming {
  days: string[];
  startHour: number;
  startMinute: number;
  startAmPm: "AM" | "PM";
  endHour: number;
  endMinute: number;
  endAmPm: "AM" | "PM";
}

// JS getDay() → 3-letter abbreviation (matches stored values)
export const JS_DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// JS getDay() → full display name (for UI messages only)
export const JS_DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Get today's abbreviation matching stored day format */
function todayAbbrev(d?: Date): string {
  return JS_DAY_ABBREVS[(d ?? new Date()).getDay()];
}

export function parseBatchTiming(schedule: string | null): BatchTiming | null {
  if (!schedule) return null;
  try {
    const p = JSON.parse(schedule);
    if (p.days && p.startHour != null) return p as BatchTiming;
  } catch { /* legacy plain text */ }
  return null;
}

function to24(h: number, amPm: "AM" | "PM"): number {
  if (amPm === "AM") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

/**
 * Returns true if the given date falls on a scheduled batch day.
 * Compares using 3-letter abbreviations ("Mon", "Tue"…).
 */
export function isBatchDay(schedule: string | null, date?: Date): boolean {
  const t = parseBatchTiming(schedule);
  if (!t || !t.days || t.days.length === 0) return true; // no schedule = always allowed
  return t.days.includes(todayAbbrev(date));
}

/** Formats a 24h minute count back to 12h display */
function minsTo12h(totalMins: number): string {
  const h24 = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 > 12 ? h24 - 12 : h24 === 0 ? 12 : h24;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

/**
 * Returns whether attendance can be edited right now for a given batch.
 * Checks: (1) today is a scheduled batch day, (2) current time is within window.
 * Window: from batch start time to batch end + 2 hours.
 */
export function isAttendanceEditable(schedule: string | null): {
  editable: boolean;
  reason: string;
  openTime: string;
  lockTime: string;
} {
  const t = parseBatchTiming(schedule);
  if (!t) return { editable: true, reason: "", openTime: "", lockTime: "" };

  const startH24 = to24(t.startHour, t.startAmPm);
  const endH24 = to24(t.endHour, t.endAmPm);
  const startMins = startH24 * 60 + t.startMinute;
  const endMins = endH24 * 60 + t.endMinute;
  const cutoffMins = endMins + 120; // +2 hours

  const openTime = `${t.startHour}:${String(t.startMinute).padStart(2, "0")} ${t.startAmPm}`;
  const lockTime = minsTo12h(cutoffMins);

  // Check day of week using abbreviations
  const todayIdx = new Date().getDay();
  const todayAbbr = JS_DAY_ABBREVS[todayIdx];
  const todayFull = JS_DAY_FULL[todayIdx];

  if (!t.days.includes(todayAbbr)) {
    const daysStr = t.days.join(", ");
    return {
      editable: false,
      reason: `No class today (${todayFull}). This batch runs on: ${daysStr}.`,
      openTime,
      lockTime,
    };
  }

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (nowMins < startMins) {
    return {
      editable: false,
      reason: `Attendance opens at ${openTime} (class start time). Locks at ${lockTime}.`,
      openTime,
      lockTime,
    };
  }
  if (nowMins > cutoffMins) {
    return {
      editable: false,
      reason: `Attendance window closed at ${lockTime}.`,
      openTime,
      lockTime,
    };
  }

  return { editable: true, reason: "", openTime, lockTime };
}

export function formatTimingDisplay(schedule: string | null): string {
  const t = parseBatchTiming(schedule);
  if (!t) return schedule || "";
  const days = t.days.join(", ");
  const fmt = (h: number, m: number, ap: string) => `${h}:${String(m).padStart(2, "0")} ${ap}`;
  return `${days} · ${fmt(t.startHour, t.startMinute, t.startAmPm)} – ${fmt(t.endHour, t.endMinute, t.endAmPm)}`;
}
