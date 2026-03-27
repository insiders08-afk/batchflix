import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Building2, Lock, Loader2, Save, Mail, IdCard, GraduationCap, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

function ReadOnlyField({ label, value, icon, mono = false }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border/50 bg-muted/40 text-sm text-foreground/70">
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
        <span className={`flex-1 truncate ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
        <Lock className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
      </div>
    </div>
  );
}

export default function StudentSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [instituteName, setInstituteName] = useState("");
  const [instituteCode, setInstituteCode] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [batchCount, setBatchCount] = useState(0);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const [profileRes, batchRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("students_batches").select("id", { count: "exact" }).eq("student_id", user.id),
      ]);

      if (profileRes.data) {
        const profile = profileRes.data;
        setProfileId(profile.id);
        setFullName(profile.full_name);
        setEditName(profile.full_name);
        setEmail(profile.email);
        setPhone(profile.phone || "");
        setEditPhone(profile.phone || "");
        setInstituteCode(profile.institute_code || "");
        // Read student ID directly from profile (no extra pending_requests query)
        setStudentId((profile as Record<string, unknown>).role_based_code as string || "");

        if (profile.institute_code) {
          const { data: inst } = await supabase
            .from("institutes")
            .select("institute_name, city")
            .eq("institute_code", profile.institute_code)
            .single();
          if (inst) setInstituteName(`${inst.institute_name}${inst.city ? ", " + inst.city : ""}`);
        }
      }

      setBatchCount(batchRes.count || 0);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profileId) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (editPhone !== phone) updates.phone = editPhone;
      if (editName !== fullName) updates.full_name = editName;

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profileId);

      if (error) throw error;
      setPhone(editPhone);
      setFullName(editName);
      toast({ title: "✅ Profile updated!" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = editPhone !== phone || editName !== fullName;

  if (loading) {
    return (
      <DashboardLayout title="Settings" role="student">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Settings" role="student">
      <div className="space-y-5 max-w-xl">

        {/* Student Profile Card */}
        <Card className="p-5 shadow-card border-border/50">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-primary-light flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold">My Profile</h3>
              <p className="text-xs text-muted-foreground">Your student account details</p>
            </div>
          </div>

          {/* Student ID badge */}
          <div className="mb-5 p-3 rounded-xl bg-primary-light border border-primary/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {editName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground">Student · {batchCount} batch{batchCount !== 1 ? "es" : ""}</p>
            </div>
            {studentId && (
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Student ID</p>
                <p className="text-xs font-mono font-semibold text-primary">{studentId}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name — editable */}
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-primary text-xs">(editable)</span></Label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Enter full name"
              />
            </div>

            <ReadOnlyField label="Email Address" value={email} icon={<Mail className="w-3.5 h-3.5" />} />

            {/* Phone — editable */}
            <div className="space-y-1.5">
              <Label>Phone Number <span className="text-primary text-xs">(editable)</span></Label>
              <Input
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>

            {studentId ? (
              <ReadOnlyField label="Student ID / Roll No." value={studentId} icon={<Hash className="w-3.5 h-3.5" />} />
            ) : (
              <ReadOnlyField label="System ID" value={userId.slice(0, 8).toUpperCase()} icon={<IdCard className="w-3.5 h-3.5" />} mono />
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            To update your email, contact your institute admin.
          </p>
        </Card>

        {/* Institute Info */}
        <Card className="p-5 shadow-card border-border/50">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-accent-light flex items-center justify-center">
              <Building2 className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="font-display font-semibold">My Institute</h3>
              <p className="text-xs text-muted-foreground">Institute you're enrolled in</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField label="Institute Name" value={instituteName} icon={<Building2 className="w-3.5 h-3.5" />} />
            <ReadOnlyField label="Institute Code" value={instituteCode} icon={<IdCard className="w-3.5 h-3.5" />} />
          </div>
        </Card>

      </div>
    </DashboardLayout>
  );
}
