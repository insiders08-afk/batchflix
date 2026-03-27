import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Zap, MapPin, Loader2, Camera, CheckCircle, Upload, AlertCircle, ArrowLeft, ChevronDown } from "lucide-react";
import InstallButton from "@/components/InstallButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { INDIA_CITIES } from "@/lib/constants";

export default function CityPartnerApply() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [checkingCity, setCheckingCity] = useState(false);
  const [cityTaken, setCityTaken] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    position: "",
    city: "",
  });
  const [citySearch, setCitySearch] = useState("");
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleCityChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const city = e.target.value;
    setForm({ ...form, city });
    setCityTaken(false);

    if (!city) return;

    setCheckingCity(true);
    try {
      // Check if this city already has an approved super_admin
      const { data } = await supabase
        .from("user_roles")
        .select("id")
        .eq("role", "super_admin")
        .eq("city", city)
        .maybeSingle();

      if (data) setCityTaken(true);
    } catch {
      // silently ignore check errors
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.city) {
      toast({ title: "City required", description: "Please select your city.", variant: "destructive" });
      return;
    }
    if (cityTaken) {
      toast({ title: "City not available", description: `${form.city} already has a City Partner.`, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Double-check city availability before submit
      const { data: existing } = await supabase
        .from("user_roles")
        .select("id")
        .eq("role", "super_admin")
        .eq("city", form.city)
        .maybeSingle();

      if (existing) {
        setCityTaken(true);
        toast({ title: "City not available", description: `${form.city} already has a City Partner. Please choose another city.`, variant: "destructive" });
        setLoading(false);
        return;
      }

      // INC-09 fix: gracefully handle missing 'applicant-photos' storage bucket
      let facial_image_url: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("applicant-photos")
          .upload(fileName, photoFile, { cacheControl: "3600", upsert: false });
        if (uploadError) {
          // Bucket may not exist — warn user but allow application to proceed without photo
          console.warn("[CityPartnerApply] Photo upload failed:", uploadError.message);
          toast({ title: "Photo upload skipped", description: "Could not upload photo (storage not configured). Your application will be submitted without it.", variant: "default" });
        } else {
          const { data: urlData } = supabase.storage.from("applicant-photos").getPublicUrl(uploadData.path);
          facial_image_url = urlData.publicUrl;
        }
      }

      const { error } = await supabase.from("super_admin_applications").insert({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        position: form.position,
        city: form.city,
        facial_image_url,
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submission failed";
      toast({ title: "Submission failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-success-light flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-2xl font-display font-bold mb-2">Application Submitted!</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Your application to become the City Partner for <strong>{form.city}</strong> has been received.
            Our team will review it and get back to you at <strong>{form.email}</strong>.
          </p>
          <Link to="/">
            <Button variant="outline" className="w-full">Return to Homepage</Button>
          </Link>
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
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4 shadow-lg">
                <MapPin className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold mb-1">Become a City Partner</h1>
              <p className="text-muted-foreground text-sm">
                Manage all coaching institutes in your city on BatchHub
              </p>
            </div>

            <Card className="p-6 shadow-card border-border/50">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Photo Upload */}
                <div className="flex flex-col items-center gap-3 pb-4 border-b border-border/50">
                  <div
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer flex items-center justify-center bg-muted overflow-hidden"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <Camera className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Face Photo</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  <Button type="button" variant="outline" size="sm" className="gap-2 text-xs h-8" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" />
                    {photoPreview ? "Change Photo" : "Upload Face Photo"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">Required for identity verification. Max 5MB.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input id="full_name" name="full_name" placeholder="Your full name" required value={form.full_name} onChange={handleChange} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input id="email" name="email" type="email" placeholder="your@email.com" required value={form.email} onChange={handleChange} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input id="phone" name="phone" type="tel" placeholder="+91 98765 43210" required value={form.phone} onChange={handleChange} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="position">Your Position / Role *</Label>
                  <Input id="position" name="position" placeholder="e.g. Business Development Manager, Entrepreneur" required value={form.position} onChange={handleChange} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="city">City *</Label>
                  <div className="relative">
                    <Input
                      id="city"
                      placeholder="Type or select your city..."
                      value={citySearch || form.city}
                      autoComplete="off"
                      onChange={async e => {
                        const val = e.target.value;
                        setCitySearch(val);
                        setForm({ ...form, city: val });
                        setCityDropdownOpen(true);
                        if (val) {
                          setCityTaken(false);
                          setCheckingCity(true);
                          try {
                            const { data } = await supabase
                              .from("user_roles")
                              .select("id")
                              .eq("role", "super_admin")
                              .eq("city", val)
                              .maybeSingle();
                            if (data) setCityTaken(true);
                          } catch { } finally { setCheckingCity(false); }
                        }
                      }}
                      onFocus={() => setCityDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setCityDropdownOpen(false), 150)}
                      required
                      className="pr-8"
                    />
                    {checkingCity ? (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    )}
                    {cityDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border/60 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {INDIA_CITIES
                          .filter(c => c !== "Other" && (!citySearch || c.toLowerCase().includes(citySearch.toLowerCase())))
                          .map(city => (
                            <button
                              key={city}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                              onMouseDown={async () => {
                                setForm({ ...form, city });
                                setCitySearch("");
                                setCityDropdownOpen(false);
                                setCheckingCity(true);
                                try {
                                  const { data } = await supabase.from("user_roles").select("id").eq("role", "super_admin").eq("city", city).maybeSingle();
                                  setCityTaken(!!data);
                                } catch { } finally { setCheckingCity(false); }
                              }}
                            >
                              {city}
                            </button>
                          ))}
                        {citySearch && !INDIA_CITIES.some(c => c.toLowerCase() === citySearch.toLowerCase() && c !== "Other") && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors text-primary font-medium"
                            onMouseDown={() => {
                              setForm({ ...form, city: citySearch });
                              setCitySearch("");
                              setCityDropdownOpen(false);
                              setCityTaken(false);
                            }}
                          >
                            {citySearch}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {cityTaken && form.city && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-danger-light border border-danger/20">
                      <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
                      <p className="text-xs text-danger font-medium">
                        <strong>{form.city}</strong> already has a City Partner. This city is not available.
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading || cityTaken || checkingCity}
                  className="w-full gradient-hero text-white border-0 hover:opacity-90 h-11 font-semibold mt-2"
                >
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit Application"}
                </Button>
              </form>
            </Card>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Already approved?{" "}
              <Link to="/auth/superadmin" className="text-primary hover:underline">City Partner Login →</Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
