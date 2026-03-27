import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Zap, Eye, EyeOff, Loader2, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Supabase sets session from the recovery link hash
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValidSession(true);
        setCheckingSession(false);
      } else if (session && event === "SIGNED_IN") {
        // might arrive as signed in from recovery link
        setIsValidSession(true);
        setCheckingSession(false);
      }
    });

    // Also check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidSession(true);
      }
      setCheckingSession(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Minimum 8 characters required.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast({ title: "✅ Password updated successfully!" });
      setTimeout(() => navigate("/role-select"), 2500);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update password", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border/50 bg-card">
        <div className="container mx-auto flex items-center h-14 px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-lg font-display font-bold text-gradient">BatchHub</span>
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4 shadow-lg">
                <KeyRound className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold mb-1">Set New Password</h1>
              <p className="text-muted-foreground text-sm">Enter your new password below</p>
            </div>

            <Card className="p-6 shadow-card border-border/50">
              {done ? (
                <div className="text-center py-4 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-success-light flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-success" />
                  </div>
                  <p className="font-semibold">Password Updated!</p>
                  <p className="text-sm text-muted-foreground">Redirecting you to login...</p>
                </div>
              ) : !isValidSession ? (
                <div className="text-center py-4 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-danger-light flex items-center justify-center mx-auto">
                    <AlertCircle className="w-8 h-8 text-danger" />
                  </div>
                  <p className="font-semibold">Invalid or Expired Link</p>
                  <p className="text-sm text-muted-foreground">This reset link has expired. Please request a new one.</p>
                  <Link to="/role-select">
                    <Button variant="outline" size="sm" className="mt-2">Back to Login</Button>
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="newpass">New Password *</Label>
                    <div className="relative">
                      <Input
                        id="newpass"
                        type={showPass ? "text" : "password"}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        required minLength={8}
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmpass">Confirm Password *</Label>
                    <div className="relative">
                      <Input
                        id="confirmpass"
                        type={showConfirm ? "text" : "password"}
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        placeholder="Repeat your password"
                        required
                        className={`pr-10 ${confirm && confirm !== password ? "border-danger" : ""}`}
                      />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirm && confirm !== password && (
                      <p className="text-xs text-danger">Passwords do not match</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || !password || !confirm}
                    className="w-full gradient-hero text-white border-0 hover:opacity-90 h-11 font-semibold"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</> : "Update Password"}
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
