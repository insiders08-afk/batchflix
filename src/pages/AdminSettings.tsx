import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Building2, Bell, Users, Loader2, Save, Lock, Mail, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Institute = Tables<"institutes">;
type Profile = Tables<"profiles">;

const NOTIF_STORAGE_KEY = "batchhub_admin_notif_prefs";

const defaultNotifPrefs = {
  feeOverdue: true,
  lowAttendance: true,
  newStudents: false,
  testScores: true,
};

function ReadOnlyField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border/50 bg-muted/40 text-sm text-foreground/70">
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
        <span className="flex-1 truncate">{value || "—"}</span>
        <Lock className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [instituteName, setInstituteName] = useState("");

  // Admin personal profile
  const [profileId, setProfileId] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [editAdminName, setEditAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  // Notification preferences (persisted to localStorage)
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      const stored = localStorage.getItem(NOTIF_STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultNotifPrefs;
    } catch {
      return defaultNotifPrefs;
    }
  });

  const updateNotif = (key: keyof typeof defaultNotifPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated));
    toast({ title: value ? "🔔 Notification enabled" : "🔕 Notification disabled" });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: codeData } = await supabase.rpc("get_my_institute_code");
      const myInstCode = codeData as string | null;

      if (!myInstCode) {
        toast({ title: "Error", description: "Could not find your institute.", variant: "destructive" });
        return;
      }

      const [instRes, profilesRes, myProfileRes] = await Promise.all([
        supabase.from("institutes").select("*").eq("institute_code", myInstCode).maybeSingle(),
        supabase.from("profiles").select("*").eq("institute_code", myInstCode).eq("role", "admin"),
        user ? supabase.from("profiles").select("*").eq("user_id", user.id).single() : Promise.resolve({ data: null }),
      ]);

      if (instRes.data) {
        setInstitute(instRes.data);
        setInstituteName(instRes.data.institute_name);
      }
      setTeam(profilesRes.data || []);

      if (myProfileRes.data) {
        const p = myProfileRes.data;
        setProfileId(p.id);
        setAdminFullName(p.full_name);
        setEditAdminName(p.full_name);
        setAdminEmail(p.email);
      }
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInstitute = async () => {
    if (!institute) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("institutes")
        .update({ institute_name: instituteName })
        .eq("id", institute.id);
      if (error) throw error;
      toast({ title: "✅ Institute name updated!" });
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileId) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: editAdminName })
        .eq("id", profileId);
      if (error) throw error;
      setAdminFullName(editAdminName);
      toast({ title: "✅ Name updated!" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Settings">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const notifItems = [
    {
      key: "feeOverdue" as const,
      label: "Fee overdue alerts",
      desc: "Admin notified when fees are overdue by 30+ days",
    },
    {
      key: "lowAttendance" as const,
      label: "Low attendance alerts",
      desc: "Alert when student attendance drops below 75%",
    },
    {
      key: "newStudents" as const,
      label: "New student registrations",
      desc: "Notify when a new student joins the institute",
    },
    {
      key: "testScores" as const,
      label: "Test score notifications",
      desc: "Send score updates to students and parents",
    },
  ];

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-5 max-w-2xl">

        {/* Admin Personal Profile */}
        <Card className="p-5 shadow-card border-border/50">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-success-light flex items-center justify-center">
              <User className="w-4 h-4 text-success" />
            </div>
            <div>
              <h3 className="font-display font-semibold">My Profile</h3>
              <p className="text-xs text-muted-foreground">Your personal account details</p>
            </div>
          </div>

          {/* Admin badge */}
          <div className="mb-4 p-3 rounded-xl bg-primary-light border border-primary/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {editAdminName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{adminFullName}</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Institute</p>
              <p className="text-xs font-mono font-semibold text-primary">{institute?.institute_code || "—"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-primary text-xs">(editable)</span></Label>
              <Input
                value={editAdminName}
                onChange={e => setEditAdminName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
            <ReadOnlyField label="Email Address" value={adminEmail} icon={<Mail className="w-3.5 h-3.5" />} />
          </div>

          <div className="mt-4">
            <Button
              className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2"
              onClick={handleSaveProfile}
              disabled={savingProfile || editAdminName === adminFullName}
            >
              {savingProfile ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Name</>}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">To update your email, contact Super Admin.</p>
        </Card>

        {/* Institute Profile */}
        <Card className="p-5 shadow-card border-border/50">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-primary-light flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Institute Profile</h3>
              <p className="text-xs text-muted-foreground">Edit institute name; other fields are managed by Super Admin</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Institute Name <span className="text-primary text-xs">(editable)</span></Label>
              <Input
                value={instituteName}
                onChange={e => setInstituteName(e.target.value)}
                placeholder="Enter institute name"
              />
            </div>
            <ReadOnlyField label="City" value={institute?.city || ""} />
            <ReadOnlyField label="Contact Email" value={institute?.email || ""} icon={<Mail className="w-3.5 h-3.5" />} />
            <ReadOnlyField label="Contact Phone" value={institute?.phone || ""} />
            <ReadOnlyField label="Government Reg. No." value={institute?.govt_registration_no || ""} />
          </div>

          {institute && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Institute Code: <strong className="text-foreground font-mono">{institute.institute_code}</strong>
                  <span className="ml-2 inline-flex items-center gap-0.5 text-muted-foreground/60 text-[10px]">
                    <Lock className="w-2.5 h-2.5" /> read-only
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Status: <strong className={institute.status === "approved" ? "text-success" : institute.status === "pending" ? "text-accent" : "text-danger"}>{institute.status}</strong>
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <Button
              className="gradient-hero text-white border-0 shadow-primary hover:opacity-90 gap-2"
              onClick={handleSaveInstitute}
              disabled={saving || instituteName === institute?.institute_name}
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Name</>}
            </Button>
          </div>
        </Card>

        {/* Notification Preferences */}
        <Card className="p-5 shadow-card border-border/50">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-accent-light flex items-center justify-center">
              <Bell className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Notification Preferences</h3>
              <p className="text-xs text-muted-foreground">Choose which alerts you want to receive</p>
            </div>
          </div>
          <div className="space-y-3">
            {notifItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30 border border-border/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={notifPrefs[item.key]}
                  onCheckedChange={(v) => updateNotif(item.key, v)}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Preferences are saved locally on this device.</p>
        </Card>

        {/* Team Members */}
        <Card className="p-5 shadow-card border-border/50">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-success-light flex items-center justify-center">
              <Users className="w-4 h-4 text-success" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Admin Team</h3>
              <p className="text-xs text-muted-foreground">All admins in your institute</p>
            </div>
          </div>
          <div className="space-y-3">
            {team.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other admins found.</p>
            ) : (
              team.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold">
                      {m.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground capitalize">{m.role}</span>
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-4">To add co-admins, go to <strong>Team</strong> in the sidebar.</p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
