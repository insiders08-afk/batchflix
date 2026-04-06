import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Zap,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Building2,
  LogOut,
  Loader2,
  RefreshCw,
  MapPin,
  ArrowLeft,
  Phone,
  Mail,
  Hash,
  ShieldOff,
  Plus,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { INDIA_CITIES } from "@/lib/constants";

type Institute = Tables<"institutes">;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h}h ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [adminCity, setAdminCity] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [selectedInstitute, setSelectedInstitute] = useState<Institute | null>(null);
  // BUG-05 fix: persist custom cities to localStorage instead of session-only state
  const [extraCities, setExtraCities] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("batchhub_extra_cities");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [newCityInput, setNewCityInput] = useState("");

  // Sync extraCities to localStorage on change
  useEffect(() => {
    localStorage.setItem("batchhub_extra_cities", JSON.stringify(extraCities));
  }, [extraCities]);

  useEffect(() => {
    const checkAccess = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth/superadmin");
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, city")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();

      if (!roleData) {
        navigate("/");
        return;
      }
      const city = (roleData as { role: string; city?: string | null }).city ?? null;
      setAdminCity(city);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.full_name) setAdminName(profile.full_name);

      setChecking(false);
      fetchInstitutes(city);
    };
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const fetchInstitutes = async (city?: string | null) => {
    setLoading(true);
    try {
      let query = supabase.from("institutes").select("*").order("created_at", { ascending: false });
      if (city) query = query.eq("city" as never, city as never);
      const { data, error } = await query;
      if (error) throw error;
      setInstitutes(data || []);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // INC-05: Deactivate an approved institute
  const handleDeactivate = async (inst: Institute) => {
    if (!confirm(`Deactivate ${inst.institute_name}? The admin will no longer have access until re-approved.`)) return;
    setActionLoading(inst.id);
    try {
      await supabase.from("institutes").update({ status: "rejected" }).eq("id", inst.id);
      if (inst.owner_user_id) {
        await supabase.from("user_roles").delete().eq("user_id", inst.owner_user_id).eq("role", "admin");
        await supabase.from("profiles").update({ status: "rejected" }).eq("user_id", inst.owner_user_id);
      }
      toast({ title: "Institute deactivated", description: `${inst.institute_name} has been deactivated.` });
      setInstitutes((prev) => prev.map((i) => (i.id === inst.id ? { ...i, status: "rejected" } : i)));
      setSelectedInstitute(null);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Deactivation failed",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (inst: Institute, action: "approved" | "rejected") => {
    setActionLoading(inst.id);
    try {
      const { error: instError } = await supabase.from("institutes").update({ status: action }).eq("id", inst.id);
      if (instError) throw instError;

      if (action === "approved" && inst.owner_user_id) {
        const { error: roleError } = await supabase.from("user_roles").upsert(
          {
            user_id: inst.owner_user_id,
            role: "admin",
            institute_code: inst.institute_code,
          },
          { onConflict: "user_id,role" },
        );
        if (roleError) throw roleError;
        await supabase.from("profiles").update({ status: "approved" }).eq("user_id", inst.owner_user_id);

        // Auto-add city if not in known list
        const city = (inst as never as { city?: string }).city;
        if (city && !INDIA_CITIES.includes(city) && !extraCities.includes(city)) {
          setExtraCities((prev) => [...prev, city]);
        }

        toast({ title: "✅ Approved!", description: `${inst.institute_name} is now live on BatchHub.` });
      } else {
        if (inst.owner_user_id) {
          await supabase.from("profiles").update({ status: "rejected" }).eq("user_id", inst.owner_user_id);
        }
        toast({ title: "Rejected", description: `${inst.institute_name} registration has been rejected.` });
      }

      setInstitutes((prev) => prev.map((i) => (i.id === inst.id ? { ...i, status: action } : i)));
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Action failed",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const pendingCount = institutes.filter((i) => i.status === "pending").length;
  const approvedCount = institutes.filter((i) => i.status === "approved").length;
  const approvedInstitutes = institutes.filter((i) => i.status === "approved");

  const filteredApprovals = institutes.filter((i) => {
    const matchesFilter = approvalFilter === "all" || i.status === approvalFilter;
    const matchesSearch =
      i.institute_name.toLowerCase().includes(search.toLowerCase()) ||
      i.institute_code.toLowerCase().includes(search.toLowerCase()) ||
      i.owner_name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredInstitutes = approvedInstitutes.filter(
    (i) =>
      i.institute_name.toLowerCase().includes(search.toLowerCase()) ||
      i.owner_name.toLowerCase().includes(search.toLowerCase()),
  );

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border/50 bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-lg font-display font-bold text-gradient">BatchHub</span>
            </Link>
            <Badge className="bg-primary-light text-primary border-0 text-xs ml-1">Super Admin</Badge>
            {adminCity && (
              <Badge className="bg-muted text-muted-foreground border-0 text-xs flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" />
                {adminCity}
              </Badge>
            )}
            {adminName && <span className="text-sm text-muted-foreground hidden sm:inline">· {adminName}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <ArrowLeft className="w-4 h-4" /> Home
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => fetchInstitutes(adminCity)} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2 text-muted-foreground">
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">
                City Partner Panel{adminCity ? ` — ${adminCity}` : ""}
              </h1>
              <p className="text-muted-foreground text-sm">
                {adminCity ? `Managing institutes in ${adminCity}` : "Manage and approve all institutes"}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Institutes", value: institutes.length, color: "text-foreground" },
            { label: "Pending Approval", value: pendingCount, color: "text-accent" },
            { label: "Live on BatchHub", value: approvedCount, color: "text-success" },
          ].map((s) => (
            <Card key={s.label} className="p-4 shadow-card border-border/50 text-center">
              <p className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by institute name, code, owner..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="approvals">
          <TabsList className="mb-5 w-full sm:w-auto">
            <TabsTrigger value="approvals" className="flex-1 sm:flex-none">
              Approvals
              {pendingCount > 0 && (
                <span className="ml-2 text-xs font-bold bg-danger text-white rounded-full w-5 h-5 inline-flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="institutes" className="flex-1 sm:flex-none">
              Institutes ({approvedCount})
            </TabsTrigger>
            <TabsTrigger value="cities" className="flex-1 sm:flex-none">
              <MapPin className="w-3.5 h-3.5 mr-1.5" /> Cities
            </TabsTrigger>
          </TabsList>

          {/* Approvals Tab */}
          <TabsContent value="approvals">
            <div className="flex gap-2 mb-4 flex-wrap">
              {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                <Button
                  key={f}
                  variant={approvalFilter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setApprovalFilter(f)}
                  className={approvalFilter === f ? "gradient-hero text-white border-0" : ""}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  <span className="ml-1.5 text-xs opacity-70">
                    ({institutes.filter((i) => f === "all" || i.status === f).length})
                  </span>
                </Button>
              ))}
            </div>

            {loading ? (
              <Card className="p-10 text-center">
                <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
              </Card>
            ) : filteredApprovals.length === 0 ? (
              <Card className="p-10 text-center shadow-card border-border/50">
                <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">No institutes found</p>
                <p className="text-muted-foreground text-sm">
                  No {approvalFilter === "all" ? "" : approvalFilter} institute registrations yet.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredApprovals.map((inst, i) => (
                  <motion.div
                    key={inst.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Card className="p-5 shadow-card border-border/50 hover:border-primary/20 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0 shadow">
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold">{inst.institute_name}</span>
                            <Badge className="text-xs bg-muted text-muted-foreground border-0 font-mono">
                              {inst.institute_code}
                            </Badge>
                            {inst.status === "pending" && (
                              <Badge className="text-xs bg-accent-light text-accent border-0 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" /> Pending
                              </Badge>
                            )}
                            {inst.status === "approved" && (
                              <Badge className="text-xs bg-success-light text-success border-0 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Live
                              </Badge>
                            )}
                            {inst.status === "rejected" && (
                              <Badge className="text-xs bg-danger-light text-danger border-0 flex items-center gap-1">
                                <XCircle className="w-2.5 h-2.5" /> Rejected
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              Owner: <strong className="text-foreground">{inst.owner_name}</strong>
                            </span>
                            <span>
                              Govt Reg: <strong className="text-foreground">{inst.govt_registration_no}</strong>
                            </span>
                            <span>
                              Email: <strong className="text-foreground">{inst.email}</strong>
                            </span>
                            <span>
                              Phone: <strong className="text-foreground">{inst.phone}</strong>
                            </span>
                            <span className="text-muted-foreground/60">Submitted {timeAgo(inst.created_at)}</span>
                          </div>
                        </div>
                        {inst.status === "pending" && (
                          <div className="flex gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              disabled={actionLoading === inst.id}
                              className="bg-success-light text-success hover:bg-success hover:text-white border border-success/20 h-8 text-xs gap-1 transition-colors"
                              onClick={() => handleAction(inst, "approved")}
                            >
                              {actionLoading === inst.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}{" "}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionLoading === inst.id}
                              className="text-danger border-danger/30 hover:bg-danger-light h-8 text-xs gap-1"
                              onClick={() => handleAction(inst, "rejected")}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Institutes Tab */}
          <TabsContent value="institutes">
            {loading ? (
              <Card className="p-10 text-center">
                <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
              </Card>
            ) : filteredInstitutes.length === 0 ? (
              <Card className="p-10 text-center shadow-card border-border/50">
                <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">No approved institutes yet</p>
                <p className="text-muted-foreground text-sm">Approved institutes will appear here.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredInstitutes.map((inst, i) => (
                  <motion.div
                    key={inst.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Card
                      className="p-4 shadow-card border-border/50 hover:shadow-lg hover:border-primary/20 transition-all cursor-pointer"
                      onClick={() => setSelectedInstitute(inst)}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{inst.institute_name}</p>
                          <Badge className="text-xs bg-success-light text-success border-0 mt-0.5">Live</Badge>
                        </div>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <p className="text-muted-foreground flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{inst.owner_name}</span>
                        </p>
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <Phone className="w-3 h-3" /> {inst.phone}
                        </p>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Cities Management Tab */}
          <TabsContent value="cities">
            <div className="space-y-5 max-w-2xl">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <p className="text-sm font-semibold">Add a new city to the platform</p>
                  <p className="text-xs text-muted-foreground">
                    New cities appear in all signup dropdowns immediately.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. Ayodhya, Prayagraj..."
                      value={newCityInput}
                      onChange={(e) => setNewCityInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newCityInput.trim()) {
                          const city = newCityInput.trim();
                          if (!INDIA_CITIES.includes(city) && !extraCities.includes(city)) {
                            setExtraCities((prev) => [...prev, city]);
                            toast({ title: `✅ ${city} added to city list!` });
                          } else {
                            toast({ title: "City already exists", variant: "destructive" });
                          }
                          setNewCityInput("");
                        }
                      }}
                    />
                    <Button
                      className="gradient-hero text-white border-0 gap-1.5"
                      disabled={!newCityInput.trim()}
                      onClick={() => {
                        const city = newCityInput.trim();
                        if (!city) return;
                        if (!INDIA_CITIES.includes(city) && !extraCities.includes(city)) {
                          setExtraCities((prev) => [...prev, city]);
                          toast({ title: `✅ ${city} added!` });
                        } else {
                          toast({ title: "City already exists", variant: "destructive" });
                        }
                        setNewCityInput("");
                      }}
                    >
                      <Plus className="w-4 h-4" /> Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Custom cities added ({extraCities.length})
                </p>
                {extraCities.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No custom cities added yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {extraCities.map((city) => (
                      <div
                        key={city}
                        className="flex items-center gap-1.5 bg-primary-light text-primary rounded-full px-3 py-1 text-sm font-medium"
                      >
                        <MapPin className="w-3 h-3" />
                        {city}
                        <button
                          className="hover:text-danger transition-colors"
                          onClick={() => setExtraCities((prev) => prev.filter((c) => c !== city))}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  All platform cities ({INDIA_CITIES.length + extraCities.length})
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto p-3 bg-muted/30 rounded-lg border border-border/50">
                  {[...INDIA_CITIES.filter((c) => c !== "Other"), ...extraCities].sort().map((city) => (
                    <span
                      key={city}
                      className="text-xs bg-card border border-border/50 px-2 py-1 rounded-full text-muted-foreground"
                    >
                      {city}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-accent-light/50 border border-accent/20 rounded-lg">
                <p className="text-xs text-accent font-medium flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" />
                  <strong>Note:</strong> Custom cities are session-based. For full persistence, a Supabase{" "}
                  <code>cities</code> table is needed.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Institute Detail Dialog */}
      <Dialog open={!!selectedInstitute} onOpenChange={() => setSelectedInstitute(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Institute Details</DialogTitle>
          </DialogHeader>
          {selectedInstitute && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl gradient-hero flex items-center justify-center shadow-lg flex-shrink-0">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="font-bold text-lg">{selectedInstitute.institute_name}</p>
                  <Badge className="text-xs bg-success-light text-success border-0 mt-1">Live on BatchHub</Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { icon: Hash, label: "Institute Code", value: selectedInstitute.institute_code },
                  { icon: Building2, label: "Owner", value: selectedInstitute.owner_name },
                  { icon: Phone, label: "Phone", value: selectedInstitute.phone },
                  { icon: Mail, label: "Email", value: selectedInstitute.email },
                  { icon: MapPin, label: "City", value: selectedInstitute.city || "—" },
                  { icon: Hash, label: "Govt. Reg No", value: selectedInstitute.govt_registration_no },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                    <item.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-medium truncate">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Registered {timeAgo(selectedInstitute.created_at)}
              </p>
              {selectedInstitute.status === "approved" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading === selectedInstitute.id}
                  className="w-full text-danger border-danger/30 hover:bg-danger-light gap-2 mt-2"
                  onClick={() => handleDeactivate(selectedInstitute)}
                >
                  {actionLoading === selectedInstitute.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldOff className="w-4 h-4" />
                  )}
                  Deactivate Institute
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
