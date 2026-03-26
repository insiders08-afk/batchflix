/**
 * Shared validation helpers used across all auth pages.
 */

/** Institute code: 3-20 chars, uppercase letters, digits, hyphens only */
const INSTITUTE_CODE_RE = /^[A-Z0-9][A-Z0-9\-]{2,19}$/;

export function validateInstituteCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!code) return "Institute code is required";
  if (code.length < 3) return "Must be at least 3 characters";
  if (code.length > 20) return "Must be at most 20 characters";
  if (!INSTITUTE_CODE_RE.test(code))
    return "Only letters, numbers and hyphens allowed (e.g. APEX-KOTA-01)";
  return null; // valid
}

/** Password: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit */
export function validatePassword(pw: string): string | null {
  if (!pw) return "Password is required";
  if (pw.length < 8) return "Must be at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Must contain at least one uppercase letter";
  if (!/[a-z]/.test(pw)) return "Must contain at least one lowercase letter";
  if (!/[0-9]/.test(pw)) return "Must contain at least one number";
  return null; // valid
}

/** Indian phone: exactly 10 digits (after stripping +91/0 prefix & spaces) */
export function validatePhone(phone: string): string | null {
  if (!phone) return null; // phone is optional in some forms
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+91") && cleaned.length === 13 && /^\+\d+$/.test(cleaned)) return null;
  if (cleaned.startsWith("0") && cleaned.length === 11 && /^\d+$/.test(cleaned)) return null;
  if (/^\d{10}$/.test(cleaned)) return null;
  return "Enter a valid 10-digit phone number";
}

/** Helper to format institute_code to uppercase */
export function normalizeInstituteCode(code: string): string {
  return code.trim().toUpperCase();
}
