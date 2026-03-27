import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Zap, GraduationCap, Eye, EyeOff, Loader2, XCircle, CheckCircle2, KeyRound } from "lucide-react";
import InstallButton from "@/components/InstallButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validatePassword, validatePhone, normalizeInstituteCode } from "@/lib/validation";

type Screen = "register" | "login" | "forgot";
type PendingStatus = "pending" | "rejected" | "approved";

export default function StudentAuth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen>("register");
  const [pendingStatus, setPendingStatus] = useState<PendingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [submittedInstitute, setSubmittedInstitute] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [form, setForm] = useState({
    name: "",
    studentId: "",
    instituteId: "",
    batchName: "",
    phone: "",
    email: "",
    password: "",
  });
  const [loginForm, setLoginForm] = useState({ email: "", password: "", instituteCode: "" });
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });
  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setLoginForm({ ...loginForm, [e.target.name]: e.target.value });

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to send reset email",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // LIMIT-09: Validate password strength
    const pwErr = validatePassword(form.password);
    if (pwErr) {
      toast({ title: "Weak Password", description: pwErr, variant: "destructive" });
      return;
    }

    // LIMIT-12: Validate phone
    const phErr = validatePhone(form.phone);
    if (phErr) {
      toast({ title: "Invalid Phone", description: phErr, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const instituteCode = normalizeInstituteCode(form.instituteId);

      // LIMIT-06: Check institute_code exists before creating account
      const { data: institute } = await supabase
        .from("institutes")
        .select("id")
        .eq("institute_code", instituteCode)
        .maybeSingle();
      if (!institute) {
        toast({
          title: "Institute not found",
          description: `No institute with code "${instituteCode}" exists. Check with your admin for the correct code.`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { emailRedirectTo: `${window.location.origin}/auth/student` },
      });

      let userId: string;

      if (authError) {
        if (authError.message?.includes("already registered") || authError.status === 422) {
          const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
          });
          if (loginErr) throw new Error("Email already registered. Please use Sign In tab or check your password.");
          userId = loginData.user.id;

          await supabase
            .from("profiles")
            .update({ status: "pending", full_name: form.name, phone: form.phone, institute_code: instituteCode })
            .eq("user_id", userId);

          const { error: reqError } = await supabase.from("pending_requests").upsert(
            {
              user_id: userId,
              full_name: form.name,
              email: form.email,
              role: "student",
              institute_code: instituteCode,
              extra_data: { studentId: form.studentId, batchName: form.batchName, phone: form.phone },
              status: "pending",
            },
            { onConflict: "user_id,role" },
          );
          if (reqError) throw reqError;

          setCurrentUserId(userId);
          setSubmittedName(form.name);
          setSubmittedInstitute(instituteCode);
          setPendingStatus("pending");
          // Keep signed in for polling
          return;
        }
        throw authError;
      }

      userId = authData.user?.id!;
      if (!userId) throw new Error("No user ID returned");

      const { error: profError } = await supabase.from("profiles").insert({
        user_id: userId,
        full_name: form.name,
        email: form.email,
        phone: form.phone,
        role: "student",
        institute_code: instituteCode,
        status: "pending",
      });
      if (profError) throw profError;

      const { error: reqError } = await supabase.from("pending_requests").insert({
        user_id: userId,
        full_name: form.name,
        email: form.email,
        role: "student",
        institute_code: instituteCode,
        extra_data: { studentId: form.studentId, batchName: form.batchName, phone: form.phone },
        status: "pending",
      });
      if (reqError) throw reqError;

      setCurrentUserId(userId);
      setSubmittedName(form.name);
      setSubmittedInstitute(instituteCode);
      setPendingStatus("pending");
      // Keep signed in for polling
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      toast({ title: "Registration failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.instituteCode.trim()) {
      toast({
        title: "Institute ID required",
        description: "Enter your institute code to sign in.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });
      if (error) throw error;
      if (rememberMe) {
        localStorage.setItem("batchhub_remember_me", "true");
        sessionStorage.removeItem("batchhub_session_only");
      } else {
        localStorage.removeItem("batchhub_remember_me");
        sessionStorage.setItem("batchhub_session_only", "true");
      }

      const userId = data.user.id;
      const instituteCode = normalizeInstituteCode(loginForm.instituteCode);

      // Find student profile for the specific institute entered
      const { data: profile } = await supabase
        .from("profiles")
        .select("status, institute_code, full_name")
        .eq("user_id", userId)
        .eq("role", "student")
        .eq("institute_code", instituteCode)
        .maybeSingle();

      if (!profile) {
        toast({
          title: "Account not found",
          description: `No student account found for institute "${instituteCode}". Check the institute code or register first.`,
          variant: "destructive",
        });
        await supabase.auth.signOut();
        return;
      }

      if (profile.status === "approved" || profile.status === "active") {
        localStorage.setItem("batchhub_active_institute", instituteCode);
        navigate("/student");
      } else {
        setCurrentUserId(userId);
        setSubmittedName(profile.full_name);
        setSubmittedInstitute(profile.institute_code || "");
        setPendingStatus(profile.status === "rejected" ? "rejected" : "pending");
        // Keep signed in for polling
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      toast({ title: "Login failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (pendingStatus) {
    return (
      <PendingApprovalScreen
        name={submittedName}
        instituteId={submittedInstitute}
        status={pendingStatus}
        userId={currentUserId}
        onStatusChange={setPendingStatus}
        onApproved={() => navigate("/student")}
        onRetry={async () => {
          await supabase.auth.signOut();
          setPendingStatus(null);
          setScreen("register");
        }}
        onBackHome={async () => {
          await supabase.auth.signOut();
        }}
      />
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
        <div className="w-full max-w-md">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <GraduationCap className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold mb-1">Student Portal</h1>
              <p className="text-muted-foreground text-sm">Register or sign in to your student account</p>
            </div>

            <div className="flex rounded-lg bg-muted p-1 mb-6">
              <button
                onClick={() => setScreen("register")}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${screen === "register" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
              >
                Register
              </button>
              <button
                onClick={() => setScreen("login")}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${screen === "login" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
              >
                Sign In
              </button>
            </div>

            <Card className="p-6 shadow-card border-border/50">
              {screen === "register" ? (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="instituteId">Institute ID *</Label>
                    <Input
                      id="instituteId"
                      name="instituteId"
                      placeholder="e.g. APEX-KOTA-001"
                      required
                      onChange={handleChange}
                      value={form.instituteId}
                    />
                    <p className="text-xs text-muted-foreground">Provided by your institute at time of admission.</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="studentId">Student ID *</Label>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                        🔒 Permanent — cannot be changed
                      </span>
                    </div>
                    <Input
                      id="studentId"
                      name="studentId"
                      placeholder="e.g. STU-2024-045"
                      required
                      onChange={handleChange}
                      value={form.studentId}
                    />
                    <p className="text-xs text-muted-foreground">
                      Choose carefully — this ID is fixed forever and links you across all institutes.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Ravi Sharma"
                      required
                      onChange={handleChange}
                      value={form.name}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="student@email.com"
                        required
                        onChange={handleChange}
                        value={form.email}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Mobile *</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        placeholder="9876543210"
                        required
                        onChange={handleChange}
                        value={form.phone}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password *</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showRegPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        required
                        minLength={8}
                        onChange={handleChange}
                        value={form.password}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-accent to-orange-400 text-white border-0 hover:opacity-90 h-11 font-semibold"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit for Approval"
                    )}
                  </Button>
                </form>
              ) : screen === "forgot" ? (
                <div className="space-y-4">
                  {forgotSent ? (
                    <div className="text-center py-4 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-success-light flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-7 h-7 text-success" />
                      </div>
                      <p className="font-semibold">Reset email sent!</p>
                      <p className="text-sm text-muted-foreground">Check your inbox for the password reset link.</p>
                      <button
                        className="text-sm text-primary hover:underline"
                        onClick={() => {
                          setForgotSent(false);
                          setScreen("login");
                        }}
                      >
                        Back to Sign In
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Enter your registered email and we'll send a reset link.
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="forgotEmail">Email Address *</Label>
                        <Input
                          id="forgotEmail"
                          type="email"
                          placeholder="student@email.com"
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-accent to-orange-400 text-white border-0 hover:opacity-90 h-11 font-semibold"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <KeyRound className="w-4 h-4 mr-2" />
                            Send Reset Link
                          </>
                        )}
                      </Button>
                      <button
                        type="button"
                        className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setScreen("login")}
                      >
                        ← Back to Sign In
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="loginInstituteCode">Institute ID *</Label>
                    <Input
                      id="loginInstituteCode"
                      name="instituteCode"
                      placeholder="e.g. APEX-KOTA-001"
                      required
                      onChange={handleLoginChange}
                      value={loginForm.instituteCode}
                    />
                    <p className="text-xs text-muted-foreground">Enter the institute you want to sign into.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="loginEmail">Email *</Label>
                    <Input
                      id="loginEmail"
                      name="email"
                      type="email"
                      placeholder="student@email.com"
                      required
                      onChange={handleLoginChange}
                      value={loginForm.email}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="loginPassword">Password *</Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setScreen("forgot")}
                      >
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
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 accent-primary rounded"
                    />
                    <span className="text-sm text-muted-foreground">Keep me signed in</span>
                    {!rememberMe && <span className="text-xs text-muted-foreground/60 ml-auto">(session only)</span>}
                  </label>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-accent to-orange-400 text-white border-0 hover:opacity-90 h-11 font-semibold"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function PendingApprovalScreen({
  name,
  instituteId,
  status,
  userId,
  onStatusChange,
  onApproved,
  onRetry,
  onBackHome,
}: {
  name: string;
  instituteId: string;
  status: "pending" | "rejected" | "approved";
  userId: string | null;
  onStatusChange: (s: "pending" | "rejected" | "approved") => void;
  onApproved: () => void;
  onRetry: () => void;
  onBackHome: () => void;
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll every 5 seconds when pending
  useEffect(() => {
    if (status !== "pending" || !userId) return;

    const poll = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("status")
        .eq("user_id", userId)
        .eq("role", "student")
        .maybeSingle();

      if (data?.status === "approved" || data?.status === "active") {
        onStatusChange("approved");
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => onApproved(), 1800);
      } else if (data?.status === "rejected") {
        onStatusChange("rejected");
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    intervalRef.current = setInterval(poll, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, userId, onStatusChange, onApproved]);

  const isRejected = status === "rejected";
  const isApproved = status === "approved";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-sm"
      >
        <div className="relative w-20 h-20 mx-auto mb-6">
          {isApproved ? (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-20 h-20 rounded-full bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center shadow-lg"
            >
              <CheckCircle2 className="w-8 h-8 text-white" />
            </motion.div>
          ) : isRejected ? (
            <div className="relative w-20 h-20 rounded-full bg-danger-light flex items-center justify-center shadow-lg">
              <XCircle className="w-8 h-8 text-danger" />
            </div>
          ) : (
            <>
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent to-orange-400 opacity-20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center shadow-lg">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
            </>
          )}
        </div>

        {isApproved ? (
          <>
            <h2 className="text-2xl font-display font-bold mb-2 text-success">Approved! 🎉</h2>
            <p className="text-muted-foreground mb-4">
              Welcome, <span className="font-semibold text-foreground">{name}</span>! Redirecting you to your
              dashboard...
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-success mx-auto" />
          </>
        ) : isRejected ? (
          <>
            <h2 className="text-2xl font-display font-bold mb-2 text-danger">Request Rejected</h2>
            <p className="text-muted-foreground mb-4">
              Hi <span className="font-semibold text-foreground">{name}</span>, your request for{" "}
              <span className="font-semibold text-foreground">{instituteId}</span> was rejected.
            </p>
            <div className="bg-danger-light border border-danger/20 rounded-xl p-4 text-left mb-4">
              <p className="text-xs text-muted-foreground">
                Contact your institute admin for the reason. Once cleared, you can re-submit using the Register tab.
              </p>
            </div>
            <Button
              onClick={onRetry}
              className="w-full mb-2 bg-gradient-to-r from-accent to-orange-400 text-white border-0"
            >
              Re-submit Request
            </Button>
            <Button variant="outline" size="sm" onClick={onBackHome} asChild>
              <Link to="/">Back to Home</Link>
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-display font-bold mb-2">Request Submitted!</h2>
            <p className="text-muted-foreground mb-4">
              Hi <span className="font-semibold text-foreground">{name}</span>, your student access request for{" "}
              <span className="font-semibold text-foreground">{instituteId}</span> has been sent for approval.
            </p>
            <div className="bg-card border border-border/50 rounded-xl p-5 text-left space-y-3 mb-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-success-light flex items-center justify-center text-success text-xs font-bold">
                  1
                </div>
                <p className="text-sm text-foreground">Your details have been submitted ✓</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                </div>
                <p className="text-sm text-muted-foreground">Waiting for admin to approve...</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                  3
                </div>
                <p className="text-sm text-muted-foreground">You'll be automatically redirected when approved</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              This page checks for approval automatically every few seconds. <strong>Keep it open!</strong>
            </p>
            <Button variant="outline" size="sm" onClick={onBackHome} asChild>
              <Link to="/">Back to Home</Link>
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}
