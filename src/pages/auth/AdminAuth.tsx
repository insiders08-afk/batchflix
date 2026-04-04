import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Zap, Shield, CheckCircle2, Clock, XCircle, Loader2, Eye, EyeOff, Phone, KeyRound, Search, ChevronDown } from "lucide-react";
import InstallButton from "@/components/InstallButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { INDIA_CITIES } from "@/lib/constants";
import { validatePassword, validatePhone } from "@/lib/validation";

type Screen = "register" | "login" | "pending" | "rejected" | "forgot";

// ─── City Combobox ──────────────────────────────────────────────────────────
function CityCombobox({ value, onChange }: {value: string;onChange: (city: string) => void;}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Cities list without "Other" — we allow free entry natively
  const cities = INDIA_CITIES.filter((c) => c !== "Other");

  const filtered = query.trim().length === 0 ?
  cities :
  cities.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase()));

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If user typed something not in list → treat as custom city
        if (query.trim() && !cities.includes(query.trim())) {
          onChange(query.trim());
        } else if (!query.trim()) {
          onChange("");
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [query, cities, onChange]);

  const select = (city: string) => {
    setQuery(city);
    onChange(city);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          placeholder="Type or select your city..."
          onChange={(e) => {setQuery(e.target.value);onChange(e.target.value);setOpen(true);}}
          onFocus={() => setOpen(true)}
          className="flex h-10 w-full rounded-md border border-input bg-background pl-8 pr-8 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          autoComplete="off" />
        
        <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      <AnimatePresence>
        {open &&
        <motion.ul
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg text-sm">
          
            {/* Custom entry if typed value not in list */}
            {query.trim() && !cities.includes(query.trim()) &&
          <li
            className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground text-muted-foreground italic border-b border-border/50"
            onMouseDown={() => select(query.trim())}>
            
                ➕ Use "{query.trim()}" (custom city)
              </li>
          }
            {filtered.length === 0 && !query.trim() &&
          <li className="px-3 py-2 text-muted-foreground">No cities found</li>
          }
            {filtered.map((city) =>
          <li
            key={city}
            onMouseDown={() => select(city)}
            className={`px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground ${value === city ? "bg-primary/10 font-medium text-primary" : ""}`}>
            
                {city}
              </li>
          )}
          </motion.ul>
        }
      </AnimatePresence>
    </div>);

}

// ─── Institute Code Input (uppercase-only, A-Z 0-9 hyphen) ──────────────────
function InstituteCodeInput({ value, onChange }: {value: string;onChange: (v: string) => void;}) {
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: backspace, delete, arrows, tab, home, end
    const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"];
    if (allowed.includes(e.key)) return;
    // Allow uppercase letters, digits, and a single ASCII hyphen (U+002D)
    if (/^[A-Z0-9\-]$/.test(e.key)) return;
    // Block everything else (including lowercase, special chars, long dashes)
    e.preventDefault();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip anything that's not A-Z, 0-9, or plain hyphen; auto-uppercase
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, "");
    onChange(cleaned);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").toUpperCase().replace(/[^A-Z0-9\-]/g, "");
    onChange((value + pasted).slice(0, 20));
  };

  return (
    <Input
      id="instituteId"
      name="instituteId"
      placeholder="e.g. APEX-KOTA-001"
      required
      value={value}
      onKeyDown={handleKey}
      onChange={handleChange}
      onPaste={handlePaste}
      maxLength={20}
      spellCheck={false}
      autoCapitalize="characters"
      className="font-mono tracking-wider" />);


}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminAuth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Screen>("register");
  const [loading, setLoading] = useState(false);
  const [pendingInstituteName, setPendingInstituteName] = useState("");
  const [pendingCity, setPendingCity] = useState("");
  const [superAdminPhone, setSuperAdminPhone] = useState<string | null>(null);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [regForm, setRegForm] = useState({
    ownerName: "",
    instituteName: "",
    instituteId: "",
    govtRegistrationNo: "",
    city: "",
    email: "",
    phone: "",
    password: ""
  });

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const handleRegChange = (e: React.ChangeEvent<HTMLInputElement>) =>
  setRegForm({ ...regForm, [e.target.name]: e.target.value });

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) =>
  setLoginForm({ ...loginForm, [e.target.name]: e.target.value });

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to send reset email", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Fetch the super admin phone for a city, fall back to Bareilly if not found
  const fetchSuperAdminPhone = async (city: string) => {
    if (!city) return;
    try {
      // Try exact city match first
      const { data } = await supabase.
      from("super_admin_applications").
      select("phone").
      eq("city", city).
      eq("status", "approved").
      maybeSingle();
      if (data?.phone) {setSuperAdminPhone(data.phone);return;}

      // Fallback: Bareilly super admin
      const { data: fallback } = await supabase.
      from("super_admin_applications").
      select("phone").
      eq("city", "Bareilly").
      eq("status", "approved").
      maybeSingle();
      if (fallback?.phone) setSuperAdminPhone(fallback.phone);
    } catch {






















      // silently ignore
    }};const handleRegister = async (e: React.FormEvent) => {e.preventDefault();const effectiveCity = regForm.city.trim();if (!effectiveCity) {toast({ title: "City required", description: "Please select or type your city.", variant: "destructive" });return;} // Institute code: already enforced by input, but double-check
    const code = regForm.instituteId.trim();if (!code || code.length < 3) {toast({ title: "Invalid Institute Code", description: "Must be at least 3 characters (A–Z, 0–9, hyphen).", variant: "destructive" });return;} // LIMIT-09: Validate password strength
    const pwError = validatePassword(regForm.password);if (pwError) {toast({ title: "Weak Password", description: pwError, variant: "destructive" });return;}
    // LIMIT-12: Validate phone number
    const phoneError = validatePhone(regForm.phone);
    if (phoneError) {
      toast({ title: "Invalid Phone", description: phoneError, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // BUG-02: Check institute_code uniqueness before signup
      const { data: existingInstitute } = await supabase.
      from("institutes").
      select("id").
      eq("institute_code", code).
      maybeSingle();
      if (existingInstitute) {
        toast({ title: "Code already taken", description: `Institute code "${code}" is already in use. Please choose a different one.`, variant: "destructive" });
        setLoading(false);
        return;
      }

      // Check if city has a super admin; if not, request goes to Bareilly
      const { data: cityAdmin } = await supabase.
      from("user_roles").
      select("id").
      eq("role", "super_admin").
      eq("city", effectiveCity).
      maybeSingle();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: regForm.email,
        password: regForm.password,
        options: { emailRedirectTo: `${window.location.origin}/auth/admin` }
      });
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error("No user ID returned");

      const institutePayload = {
        owner_user_id: userId,
        owner_name: regForm.ownerName,
        institute_name: regForm.instituteName,
        institute_code: code,
        govt_registration_no: regForm.govtRegistrationNo,
        city: effectiveCity,
        email: regForm.email,
        phone: regForm.phone,
        status: "pending" as const
      };
      const { error: instError } = await supabase.from("institutes").insert(institutePayload as never);
      if (instError) throw instError;

      const { error: profError } = await supabase.from("profiles").insert({
        user_id: userId,
        full_name: regForm.ownerName,
        email: regForm.email,
        phone: regForm.phone,
        role: "admin",
        institute_code: code,
        status: "pending"
      });
      if (profError) throw profError;

      // Also insert into user_roles so the login flow can verify admin access
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: "admin",
        institute_code: code,
        city: effectiveCity,
      });
      if (roleError && !roleError.message?.includes("duplicate")) throw roleError;

      setPendingInstituteName(regForm.instituteName);
      setPendingCity(effectiveCity);
      fetchSuperAdminPhone(effectiveCity);
      setStep("pending");

      if (!cityAdmin) {
        toast({
          title: "No City Partner for your city yet",
          description: `Your request will be forwarded to our Bareilly office for review. You'll be notified once approved.`
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      toast({ title: "Registration failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password
      });
      if (error) throw error;
      if (rememberMe) {
        localStorage.setItem("batchhub_remember_me", "true");
        sessionStorage.removeItem("batchhub_session_only");
      } else {
        localStorage.removeItem("batchhub_remember_me");
        sessionStorage.setItem("batchhub_session_only", "true");
      }

      const userId = data.user?.id;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();

      if (roleData) { navigate("/superadmin"); return; }

      // Check if this user has an admin role (covers dual-role users)
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      const { data: institute, error: instErr } = await supabase
        .from("institutes")
        .select("status, institute_name, city")
        .eq("owner_user_id", userId)
        .maybeSingle();

      if (instErr) throw instErr;

      if (!institute && !adminRole) {
        toast({ title: "No institute found", description: "No institute is linked to this account.", variant: "destructive" });
        return;
      }

      // If user has admin role but institute lookup found nothing (edge case), redirect anyway
      if (!institute && adminRole) {
        navigate("/admin");
        return;
      }

      setPendingInstituteName(institute.institute_name);
      setPendingCity(institute.city || "");
      if (institute.city) fetchSuperAdminPhone(institute.city);

      if (institute.status === "approved") {
        navigate("/admin");
      } else if (institute.status === "pending") {
        setStep("pending");
      } else {
        setStep("rejected");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      toast({ title: "Login failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (step === "pending") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent to-orange-400 opacity-20 animate-ping" />
            <div className="relative w-20 h-20 rounded-full gradient-hero flex items-center justify-center shadow-lg">
              <Clock className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-display font-bold mb-2">Pending City Partner Approval</h2>
          <p className="text-muted-foreground mb-4">
            <span className="font-semibold text-foreground">{pendingInstituteName}</span> has been submitted and is pending review by {pendingCity ? `the ${pendingCity} City Partner` : "your city's BatchHub partner"}.
          </p>
          <div className="bg-card border border-border/50 rounded-xl p-5 text-left space-y-3 mb-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-success-light flex items-center justify-center text-success text-xs font-bold">1</div>
              <p className="text-sm">Institute registered ✓</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">City Partner is reviewing your govt. registration...</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">3</div>
              <p className="text-sm text-muted-foreground">Access to admin dashboard granted</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">4</div>
              <p className="text-sm text-muted-foreground">
                Once approved, try <strong>signing in again</strong> to access your dashboard.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4">The City Partner for {pendingCity || "your city"} will review and approve within 24 hours.</p>
          <Link to="/"><Button variant="outline" size="sm">Back to Home</Button></Link>
        </motion.div>
      </div>);

  }

  if (step === "rejected") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-danger-light flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-danger" />
          </div>
          <h2 className="text-2xl font-display font-bold mb-2">Application Rejected</h2>
          <p className="text-muted-foreground mb-4">
            Unfortunately, <span className="font-semibold text-foreground">{pendingInstituteName}</span>'s registration was not approved. This may be due to invalid government registration details.
          </p>
          {superAdminPhone ?
          <div className="bg-card border border-border/50 rounded-xl p-4 text-left mb-4 shadow-card">
              <p className="text-sm font-semibold mb-1.5">Contact your City Partner</p>
              <p className="text-xs text-muted-foreground mb-2">Reach out to your {pendingCity} City Partner for more information:</p>
              <a href={`tel:${superAdminPhone}`} className="flex items-center gap-2 text-primary hover:underline text-sm font-medium">
                <Phone className="w-4 h-4" /> {superAdminPhone}
              </a>
            </div> :

          <p className="text-xs text-muted-foreground mb-4">Please contact your city's BatchHub partner for more information.</p>
          }
          <Link to="/"><Button variant="outline" size="sm">Back to Home</Button></Link>
        </motion.div>
      </div>);

  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border/50 bg-card">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-lg font-display font-bold text-gradient">BatchHub</span>
          </Link>
          <div className="flex items-center gap-2">
            <InstallButton />
            <Link to="/role-select">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold mb-1">Admin / Institute Owner</h1>
              <p className="text-muted-foreground text-sm">Register your institute or sign in to your dashboard</p>
            </div>

            {/* Toggle */}
            <div className="flex rounded-lg bg-muted p-1 mb-6">
              <button
                onClick={() => setStep("register")}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${step === "register" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>
                
                Register Institute
              </button>
              <button
                onClick={() => setStep("login")}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${step === "login" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>
                
                Sign In
              </button>
            </div>

            <Card className="p-6 shadow-card border-border/50">
              {step === "register" ?
              <form onSubmit={handleRegister} className="space-y-4">
                  <div className="p-3 bg-primary-light border border-primary/20 rounded-lg mb-2">
                    <p className="text-xs text-primary font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Your institute will be reviewed by your city's BatchHub partner before going live.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="ownerName">Owner's Full Name *</Label>
                      <Input id="ownerName" name="ownerName" placeholder="Rajesh Kumar" required onChange={handleRegChange} value={regForm.ownerName} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="instituteName">Institute Name *</Label>
                      <Input id="instituteName" name="instituteName" placeholder="Apex Classes" required onChange={handleRegChange} value={regForm.instituteName} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Institute Code */}
                    <div className="space-y-1.5">
                      <Label htmlFor="instituteId">Institute ID / Code *</Label>
                      <InstituteCodeInput
                      value={regForm.instituteId}
                      onChange={(v) => setRegForm((f) => ({ ...f, instituteId: v }))} />
                    
                      <p className="text-xs text-muted-foreground">
                        Capital letters A–Z, digits 0–9 and hyphens (-) only. <span className="text-danger font-medium">Cannot be changed later.</span>
                      </p>
                    </div>

                    {/* City Combobox */}
                    <div className="space-y-1.5">
                      <Label>City *</Label>
                      <CityCombobox
                      value={regForm.city}
                      onChange={(city) => setRegForm((f) => ({ ...f, city }))} />
                    
                      <p className="text-xs text-muted-foreground">
                        Type to search or enter any city name. <span className="text-danger font-medium">Cannot be changed later.</span>
                      </p>
                    </div>
                  </div>

                  {/* Govt Registration */}
                  <div className="space-y-1.5">
                    <Label htmlFor="govtRegistrationNo">Government Registration / Trust No. *</Label>
                    <Input
                    id="govtRegistrationNo"
                    name="govtRegistrationNo"
                    placeholder="e.g. MH/2015/0012345"
                    required
                    onChange={handleRegChange}
                    value={regForm.govtRegistrationNo} />
                  
                    <div className="space-y-0.5">
                      <p className="bg-primary-light text-secondary-foreground text-xs">
                        Your government-issued institute registration / trust number for real-world verification.
                      </p>
                      <p className="text-xs font-medium rounded px-2 py-1 mt-1 text-accent font-mono bg-muted-foreground">
                        💡 Don't have one yet? Enter any placeholder (e.g. <span className="font-mono">TBD-001</span>) — you can update it anytime from your Admin Settings.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email *</Label>
                      <Input id="email" name="email" type="email" placeholder="owner@apex.com" required onChange={handleRegChange} value={regForm.email} />
                      <p className="text-xs text-muted-foreground/70">Cannot be changed later.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Mobile Number *</Label>
                      <Input id="phone" name="phone" type="tel" placeholder="9876543210" required onChange={handleRegChange} value={regForm.phone} />
                    </div>
                  </div>

                  {/* Editable fields note */}
                  <div className="p-3 bg-muted/60 rounded-lg border border-border/40">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-foreground">You can edit later:</span> Institute name, Owner's full name, Government registration number, and Mobile number — from your Admin Settings.<br />
                      <span className="font-semibold text-foreground">Cannot be changed:</span> Institute code, City, and Email address.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">Set Password *</Label>
                    <div className="relative">
                      <Input
                      id="password"
                      name="password"
                      type={showRegPassword ? "text" : "password"}
                      placeholder="Min 8 chars, upper+lower+digit"
                      required
                      minLength={8}
                      onChange={handleRegChange}
                      value={regForm.password}
                      className="pr-10" />
                    
                      <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full gradient-hero text-white border-0 hover:opacity-90 h-11 font-semibold">
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Registering...</> : "Register My Institute"}
                  </Button>
                </form> :
              step === "forgot" ?
              <div className="space-y-4">
                  {forgotSent ?
                <div className="text-center py-4 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-success-light flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-7 h-7 text-success" />
                      </div>
                      <p className="font-semibold">Reset email sent!</p>
                      <p className="text-sm text-muted-foreground">Check your inbox for the password reset link.</p>
                      <button className="text-sm text-primary hover:underline" onClick={() => {setForgotSent(false);setStep("login");}}>
                        Back to Sign In
                      </button>
                    </div> :

                <form onSubmit={handleForgotPassword} className="space-y-4">
                      <p className="text-sm text-muted-foreground">Enter your registered email and we'll send a reset link.</p>
                      <div className="space-y-1.5">
                        <Label htmlFor="forgotEmail">Email Address *</Label>
                        <Input id="forgotEmail" type="email" placeholder="owner@apex.com" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                      </div>
                      <Button type="submit" disabled={loading} className="w-full gradient-hero text-white border-0 hover:opacity-90 h-11 font-semibold">
                        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><KeyRound className="w-4 h-4 mr-2" />Send Reset Link</>}
                      </Button>
                      <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setStep("login")}>
                        ← Back to Sign In
                      </button>
                    </form>
                }
                </div> :

              <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="loginEmail">Email *</Label>
                    <Input id="loginEmail" name="email" type="email" placeholder="owner@apex.com" required onChange={handleLoginChange} value={loginForm.email} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="loginPassword">Password *</Label>
                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setStep("forgot")}>
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                      id="loginPassword"
                      name="password"
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="Your password"
                      required
                      onChange={handleLoginChange}
                      value={loginForm.password}
                      className="pr-10" />
                    
                      <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded" />
                  
                    <span className="text-sm text-muted-foreground">Keep me signed in</span>
                    {!rememberMe && <span className="text-xs text-muted-foreground/60 ml-auto">(session only)</span>}
                  </label>
                  <Button type="submit" disabled={loading} className="w-full gradient-hero text-white border-0 hover:opacity-90 h-11 font-semibold">
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</> : "Sign In to Dashboard"}
                  </Button>
                </form>
              }
            </Card>
          </motion.div>
        </div>
      </div>
    </div>);

}