import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Crown,
  LogOut,
  Users,
  Building2,
  MapPin,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  Loader2,
  Phone,
  Mail,
  Briefcase,
  ArrowLeft,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Application = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  city: string;
  facial_image_url: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type Stats = {
  totalInstitutes: number;
  pendingInstitutes: number;
  approvedInstitutes: number;
  totalSuperAdmins: number;
  totalCities: number;
};

type DrilldownItem = { label: string; sublabel?: string };

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalInstitutes: 0,
    pendingInstitutes: 0,
    approvedInstitutes: 0,
    totalSuperAdmins: 0,
    totalCities: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [ownerName, setOwnerName] = useState<string>("Krishna");
  const [drilldown, setDrilldown] = useState<{ title: string; items: DrilldownItem[] } | null>(null);
  const [allInstitutes, setAllInstitutes] = useState<
    { id: string; institute_name: string; owner_name: string; city: string | null; status: string }[]
  >([]);
  const [allSuperAdmins, setAllSuperAdmins] = useState<{ city: string | null }[]>([]);

  useEffect(() => {
    checkOwnerAccess();
  }, []);

  const checkOwnerAccess = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth/owner");
      return;
    }

    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "app_owner")
      .maybeSingle();

    if (!role) {
      navigate("/auth/owner");
      return;
    }

    // Fetch owner name
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
    if (profile?.full_name) setOwnerName(profile.full_name);

    fetchAll();
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [appsRes, institutesRes, rolesRes] = await Promise.all([
        supabase.from("super_admin_applications").select("*").order("created_at", { ascending: false }),
        supabase.from("institutes").select("id, institute_name, owner_name, city, status"),
        supabase.from("user_roles").select("role, city").eq("role", "super_admin"),
      ]);

      if (appsRes.data) setApplications(appsRes.data);

      const institutes = (institutesRes.data || []) as {
        id: string;
        institute_name: string;
        owner_name: string;
        city: string | null;
        status: string;
      }[];
      const superAdmins = rolesRes.data || [];
      const cities = new Set(superAdmins.map((r) => r.city).filter(Boolean));

      setAllInstitutes(institutes);
      setAllSuperAdmins(superAdmins);

      setStats({
        totalInstitutes: institutes.length,
        pendingInstitutes: institutes.filter((i) => i.status === "pending").length,
        approvedInstitutes: institutes.filter((i) => i.status === "approved").length,
        totalSuperAdmins: superAdmins.length,
        totalCities: cities.size,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatClick = (type: string) => {
    let title = "";
    let items: DrilldownItem[] = [];

    switch (type) {
      case "totalInstitutes":
        title = "All Institutes";
        items = allInstitutes.map((i) => ({
          label: i.institute_name,
          sublabel: `Owner: ${i.owner_name} · City: ${i.city || "—"} · ${i.status}`,
        }));
        break;
      case "pendingInstitutes":
        title = "Pending Institutes";
        items = allInstitutes
          .filter((i) => i.status === "pending")
          .map((i) => ({ label: i.institute_name, sublabel: `Owner: ${i.owner_name} · City: ${i.city || "—"}` }));
        break;
      case "approvedInstitutes":
        title = "Approved Institutes";
        items = allInstitutes
          .filter((i) => i.status === "approved")
          .map((i) => ({ label: i.institute_name, sublabel: `Owner: ${i.owner_name} · City: ${i.city || "—"}` }));
        break;
      case "totalSuperAdmins":
        title = "City Super Admins";
        items = allSuperAdmins.map((sa) => ({ label: `City: ${sa.city || "—"}`, sublabel: "Super Admin" }));
        break;
      case "totalCities": {
        const cities = [...new Set(allSuperAdmins.map((sa) => sa.city).filter(Boolean))] as string[];
        title = "Active Cities";
        items = cities.map((city) => ({
          label: city,
          sublabel: `${allInstitutes.filter((i) => i.city === city).length} institute(s)`,
        }));
        break;
      }
    }
    setDrilldown({ title, items });
  };

  const approveApplication = async (app: Application) => {
    setActionLoading(app.id);
    try {
      // 1. Check if city is still available
      const { data: existingAdmin } = await supabase
        .from("user_roles")
        .select("id")
        .eq("role", "super_admin")
        .eq("city", app.city)
        .maybeSingle();

      if (existingAdmin) {
        toast({
          title: "City already has a Super Admin",
          description: `${app.city} already has an approved city partner. Only one super admin is allowed per city.`,
          variant: "destructive",
        });
        setActionLoading(null);
        return;
      }

      // 2. Find the user ID from the profiles table (registered during application)
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", app.email)
        .eq("role", "super_admin")
        .maybeSingle();

      if (profileError || !userProfile) {
        throw new Error("Could not find the registered user account for this application.");
      }

      const userId = userProfile.user_id;

      // 3. Grant the super_admin role in user_roles
      const { error: roleError } = await supabase.from("user_roles").upsert(
        {
          user_id: userId,
          role: "super_admin",
          city: app.city,
        },
        { onConflict: "user_id,role" }
      );
      if (roleError) throw roleError;

      // 4. Update profile status to approved
      const { error: statusError } = await supabase
        .from("profiles")
        .update({ status: "approved" })
        .eq("user_id", userId);
      if (statusError) throw statusError;

      // 5. Update application status
      const { error: updateError } = await supabase
        .from("super_admin_applications")
        .update({
          status: "approved",
          notes: `Approved on ${new Date().toLocaleDateString("en-IN")} by ${ownerName}.`,
        })
        .eq("id", app.id);

      if (updateError) throw updateError;

      toast({
        title: "Application approved ✓",
        description: `${app.full_name} is now the City Partner for ${app.city}. They can now log in with their password.`,
      });
      
      fetchAll();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to approve";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const rejectApplication = async (app: Application) => {
    setActionLoading(app.id);
    try {
      // Update application status
      const { error } = await supabase.from("super_admin_applications").update({ status: "rejected" }).eq("id", app.id);
      if (error) throw error;

      // Also update profile status so login shows "rejected" screen
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", app.email)
        .eq("role", "super_admin")
        .maybeSingle();
      
      if (userProfile) {
        await supabase.from("profiles").update({ status: "rejected" }).eq("user_id", userProfile.user_id);
      }

      toast({ title: "Application rejected", description: `${app.full_name}'s application has been rejected.` });
      fetchAll();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reject";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const filteredApps = applications.filter((a) => (filter === "all" ? true : a.status === filter));

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge className="bg-success/10 text-success border-success/20">Approved</Badge>;
    if (status === "rejected")
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Rejected</Badge>;
    return <Badge className="bg-accent/10 text-accent border-accent/20">Pending</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Crown className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <span className="font-display font-bold text-gradient">BatchHub Owner Portal</span>
              <span className="text-muted-foreground text-sm ml-2 hidden sm:inline">· {ownerName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Home
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Stats — clickable */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8"
            >
              {[
                {
                  label: "Total Institutes",
                  value: stats.totalInstitutes,
                  icon: Building2,
                  color: "text-primary",
                  key: "totalInstitutes",
                },
                {
                  label: "Pending Review",
                  value: stats.pendingInstitutes,
                  icon: Clock,
                  color: "text-accent",
                  key: "pendingInstitutes",
                },
                {
                  label: "Approved",
                  value: stats.approvedInstitutes,
                  icon: CheckCircle,
                  color: "text-success",
                  key: "approvedInstitutes",
                },
                {
                  label: "Super Admins",
                  value: stats.totalSuperAdmins,
                  icon: Users,
                  color: "text-primary",
                  key: "totalSuperAdmins",
                },
                {
                  label: "Cities Active",
                  value: stats.totalCities,
                  icon: Globe,
                  color: "text-purple-500",
                  key: "totalCities",
                },
              ].map((stat) => (
                <Card
                  key={stat.label}
                  className="border-border/50 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
                  onClick={() => handleStatClick(stat.key)}
                >
                  <CardContent className="p-4 flex flex-col gap-1">
                    <stat.icon className={`w-5 h-5 ${stat.color} mb-1`} />
                    <p className="text-2xl font-bold font-display">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>

            {/* Drilldown panel */}
            <AnimatePresence>
              {drilldown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6"
                >
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-base font-display">
                        {drilldown.title} ({drilldown.items.length})
                      </CardTitle>
                      <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setDrilldown(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {drilldown.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No items found.</p>
                      ) : (
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {drilldown.items.map((item, i) => (
                            <div key={i} className="flex flex-col py-1.5 px-2 rounded-lg hover:bg-muted/50">
                              <span className="text-sm font-medium">{item.label}</span>
                              {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* City Super Admin Applications */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-display font-bold">City Partner Applications</h2>
                <div className="flex gap-2">
                  {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filter === f ? "default" : "outline"}
                      onClick={() => setFilter(f)}
                      className="capitalize text-xs h-8"
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </div>

              {filteredApps.length === 0 ? (
                <Card className="border-border/50 border-dashed">
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No {filter !== "all" ? filter : ""} applications yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredApps.map((app) => (
                    <Card key={app.id} className="border-border/50 overflow-hidden">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <Avatar className="w-16 h-16 rounded-xl border border-border/50 flex-shrink-0">
                            <AvatarImage src={app.facial_image_url || ""} alt={app.full_name} />
                            <AvatarFallback className="rounded-xl bg-muted text-lg font-bold">
                              {app.full_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold font-display truncate">{app.full_name}</span>
                              {statusBadge(app.status)}
                            </div>
                            <div className="space-y-0.5 text-sm text-muted-foreground">
                              <p className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5" />
                                {app.email}
                              </p>
                              <p className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5" />
                                {app.phone}
                              </p>
                              <p className="flex items-center gap-1.5">
                                <Briefcase className="w-3.5 h-3.5" />
                                {app.position}
                              </p>
                              <p className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                {app.city}
                              </p>
                            </div>
                            {app.notes && (
                              <p className="text-xs text-muted-foreground mt-2 bg-muted rounded p-2 font-mono break-all">
                                {app.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        {app.status === "pending" && (
                          <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                            <Button
                              size="sm"
                              className="flex-1 bg-success hover:bg-success/90 text-white border-0 gap-1.5"
                              disabled={actionLoading === app.id}
                              onClick={() => approveApplication(app)}
                            >
                              {actionLoading === app.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5"
                              disabled={actionLoading === app.id}
                              onClick={() => rejectApplication(app)}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
