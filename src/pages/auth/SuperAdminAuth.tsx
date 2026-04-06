import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { 
  ArrowLeft, Zap, ShieldCheck, Loader2, MapPin, Eye, EyeOff, 
  Camera, AlertCircle, ChevronDown, Clock, XCircle
} from "lucide-react";
import InstallButton from "@/components/InstallButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { INDIA_CITIES } from "@/lib/constants";
import { validatePassword, validatePhone } from "@/lib/validation";

type Screen = "login" | "register" | "pending" | "rejected" | "forgot";

// ─── City Combobox ───
function CityCombobox({ value, onChange, onCityAvailabilityCheck }: {
  value: string;
  onChange: (city: string) => void;
  onCityAvailabilityCheck: (city: string) => Promise<void>;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cities = INDIA_CITIES.filter((c) => c !== "Other");

  const filtered = query.trim().length === 0 ?
    cities :
    cities.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (query.trim() && !cities.includes(query.trim())) {
          onChange(query.trim());
          onCityAvailabilityCheck(query.trim());
        } else if (!query.trim()) {
          onChange("");
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [query, cities, onChange, onCityAvailabilityCheck]);

  const select = (city: string) => {
    setQuery(city);
    onChange(city);
    onCityAvailabilityCheck(city);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          placeholder="Search your city..."
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            onCityAvailabilityCheck(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-8 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          autoComplete="off"
        />
        <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg text-sm"
          >
            {query.trim() && !cities.includes(query.trim()) && (
              <li
                className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground text-muted-foreground italic border-b border-border/50"
                onMouseDown={() => select(query.trim())}
              >
                ➕ Select "{query.trim()}" (custom city)
              </li>
            )}
            {filtered.map((city) => (
              <li
                key={city}
                onMouseDown={() => select(city)}
                className={`px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground ${value === city ? "bg-primary/10 font-medium text-primary" : ""}`}
              >
                {city}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SuperAdminAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [step, setStep] = useState<Screen>(() => {
    const mode = searchParams.get("mode");
    return (mode === "apply" || mode === "register") ? "register" : "login";
  });

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [checkingCity, setCheckingCity] = useState(false);
  const [cityTaken, setCityTaken] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    position: "",
    city: "",
    password: ""
  });

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setLoginForm({ ...loginForm, [e.target.name]: e.target.value });

  const handleRegChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setRegForm({ ...regForm, [e.target.name]: e.target.value });

  const checkCityAvailability = async (city: string) => {
    if (!city) return;
    setCheckingCity(true);
    setCityTaken(false);
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("id")
        .eq("role", "super_admin")
        .eq("city", city)
        .maybeSingle();
      if (data) setCityTaken(true);
    } catch {
      // silently ignore
    } finally {
      setCheckingCity(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Photo too large", description: "Please upload a photo under 5MB.", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });
      if (error) throw error;

      const userId = data.user?.id;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, city")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();

      if (!roleData) {
        // Might be a pending application
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, status")
          .eq("user_id", userId)
          .maybeSingle();

        if (profile?.role === "super_admin") {
          if (profile.status === "pending") {
            setStep("pending");
          } else if (profile.status === "rejected") {
            setStep("rejected");
          } else {
            // Should have role then, but fallback
            navigate("/superadmin");
          }
          setLoading(false);
          return;
        }

        await supabase.auth.signOut();
        toast({ title: "Unauthorized", description: "Account does not have City Partner access.", variant: "destructive" });
        return;
      }

      localStorage.setItem("batchhub_remember_me", "true");
      navigate("/superadmin");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      toast({ title: "Login failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.city.trim()) {
      toast({ title: "City required", description: "Please select or type your city.", variant: "destructive" });
      return;
    }
    if (cityTaken) {
      toast({ title: "City Taken", description: "This city already has a City Partner.", variant: "destructive" });
      return;
    }
    const pwError = validatePassword(regForm.password);
    if (pwError) { toast({ title: "Weak Password", description: pwError, variant: "destructive" }); return; }

    const phoneError = validatePhone(regForm.phone);
    if (phoneError) { toast({ title: "Invalid Phone", description: phoneError, variant: "destructive" }); return; }

    setLoading(true);
    try {
      // 1. Photo upload (optional — happens before account creation, no auth needed)
      let facial_image_url: string | null = null;
      if (photoFile) {
        // Upload anonymously using signed upload or just skip to post-signup
        // For now, we pass null and the owner can request it separately
        // (storage requires auth, which we don't have yet at this step)
      }

      // 2. Call Edge Function — handles auth user creation + profile + application atomically
      // using service role key, so no RLS issues, full rollback on failure
      const { data, error } = await supabase.functions.invoke("city-partner-register", {
        body: {
          fullName: regForm.fullName,
          email: regForm.email,
          password: regForm.password,
          phone: regForm.phone,
          position: regForm.position,
          city: regForm.city,
          facial_image_url,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setStep("pending");
      toast({ title: "Application Submitted! ✓", description: "Your City Partner application is pending review. You can sign in once approved." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed. Please try again.";
      toast({ title: "Registration failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (step === "pending") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full gradient-hero flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-display font-bold mb-2">Application Pending</h2>
          <p className="text-muted-foreground mb-6">
            Your application to become the City Partner for <span className="font-semibold text-foreground">{regForm.city || "your city"}</span> has been received and is waiting for approval by the platform owner.
          </p>
          <div className="bg-card border border-border/50 rounded-xl p-5 text-left space-y-3 mb-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-success-light flex items-center justify-center text-success text-xs font-bold">1</div>
              <p className="text-sm">Account registered & application sent ✓</p>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              </div>
              <p className="text-sm">Platform Owner is reviewing details...</p>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground opacity-50">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">3</div>
              <p className="text-sm">Access to City Partner dashboard granted</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Link to="/">
              <Button variant="outline" size="sm" className="w-full h-11">
                Sign Out & Return Home
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground">
              You can check your request details later by simply signing in again. Do not apply again.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (step === "rejected") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-danger-light flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-danger" />
          </div>
          <h2 className="text-2xl font-display font-bold mb-2">Application Rejected</h2>
          <p className="text-muted-foreground mb-6">
            Your application for City Partner was not approved at this time. Please contact support for more information.
          </p>
          <Link to="/"><Button variant="outline" size="sm">Back to Home</Button></Link>
        </motion.div>
      </div>
    );
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
                <ShieldCheck className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold mb-1">City Partner Access</h1>
              <p className="text-muted-foreground text-sm">Become a city-level administrator or sign in</p>
            </div>

            <div className="flex rounded-lg bg-muted p-1 mb-6">
              <button
                onClick={() => setStep("register")}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${step === "register" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
              >
                Apply as Partner
              </button>
              <button
                onClick={() => setStep("login")}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${step === "login" || step === "forgot" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
              >
                Sign In
              </button>
            </div>

            <Card className="p-6 shadow-card border-border/50">
              {step === "register" ? (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="flex flex-col items-center gap-3 pb-4 border-b border-border/50">
                    <div
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer flex items-center justify-center bg-muted overflow-hidden"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {photoPreview ? (
                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    <p className="text-xs text-muted-foreground text-center">Face photo for identity verification (optional)</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName">Full Name *</Label>
                      <Input name="fullName" placeholder="Rahul Sharma" required value={regForm.fullName} onChange={handleRegChange} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="city">City of Interest *</Label>
                      <CityCombobox 
                        value={regForm.city} 
                        onChange={(city) => setRegForm(f => ({ ...f, city }))}
                        onCityAvailabilityCheck={checkCityAvailability}
                      />
                    </div>
                  </div>

                  {cityTaken && regForm.city && (
                    <div className="p-2.5 rounded-lg bg-danger-light border border-danger/20 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-danger" />
                      <p className="text-xs text-danger font-medium">This city already has a City Partner.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input name="phone" type="tel" placeholder="9876543210" required value={regForm.phone} onChange={handleRegChange} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="position">Current Position *</Label>
                      <Input name="position" placeholder="e.g. Entrepreneur" required value={regForm.position} onChange={handleRegChange} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input name="email" type="email" placeholder="rahul@example.com" required value={regForm.email} onChange={handleRegChange} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">Set Password *</Label>
                    <div className="relative">
                      <Input
                        name="password"
                        type={showRegPassword ? "text" : "password"}
                        placeholder="Min 8 chars, mixed case + digit"
                        required
                        value={regForm.password}
                        onChange={handleRegChange}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" disabled={loading || cityTaken || checkingCity} className="w-full gradient-hero text-white border-0 h-11 font-semibold">
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit Application"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input name="email" type="email" placeholder="partner@batchhub.app" required value={loginForm.email} onChange={handleLoginChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Your password"
                        required
                        value={loginForm.password}
                        onChange={handleLoginChange}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full gradient-hero text-white border-0 h-11 font-semibold">
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</> : "Sign In to Dashboard"}
                  </Button>
                </form>
              )}
            </Card>
            <p className="text-center text-xs text-muted-foreground mt-4">
              Need help? Contact <a href="mailto:support@batchhub.app" className="text-primary hover:underline">support@batchhub.app</a>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
