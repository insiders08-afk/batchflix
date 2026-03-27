import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Download, Share2, Plus, CheckCircle2, ArrowLeft, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);

    // Capture install prompt (Android/Chrome)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Detect already installed
    window.addEventListener("appinstalled", () => setInstalled(true));

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
    setInstalling(false);
  };

  const androidSteps = [
    { icon: "1", text: "Open BatchHub in Chrome browser" },
    { icon: "2", text: 'Tap the three-dot menu (⋮) in the top-right corner' },
    { icon: "3", text: 'Tap "Add to Home screen"' },
    { icon: "4", text: 'Tap "Add" to confirm' },
    { icon: "5", text: "BatchHub icon appears on your home screen!" },
  ];

  const iosSteps = [
    { icon: "1", text: "Open BatchHub in Safari (not Chrome)" },
    { icon: "2", text: 'Tap the Share button (□↑) at the bottom of the screen' },
    { icon: "3", text: 'Scroll down and tap "Add to Home Screen"' },
    { icon: "4", text: 'Tap "Add" in the top-right corner' },
    { icon: "5", text: "BatchHub icon appears on your home screen!" },
  ];

  if (isStandalone || installed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-xs"
        >
          <div className="w-20 h-20 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-6 shadow-primary/40 shadow-xl">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-display font-bold text-2xl mb-2">Already Installed!</h1>
          <p className="text-muted-foreground text-sm mb-6">
            BatchHub is running as an app on your device. Enjoy the full experience!
          </p>
          <Link to="/">
            <Button className="gradient-hero text-white border-0 hover:opacity-90 gap-2">
              <Zap className="w-4 h-4" /> Open BatchHub
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border/50 px-4 h-14 flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon" className="w-9 h-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-display font-bold">Install BatchHub</span>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="gradient-hero rounded-2xl p-6 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-display font-bold text-2xl mb-2">Install as App</h1>
            <p className="text-white/80 text-sm">
              Add BatchHub to your home screen for a faster, app-like experience — no Play Store needed.
            </p>
          </div>
        </motion.div>

        {/* Benefits */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Works Offline", emoji: "📶" },
              { label: "No Browser Bar", emoji: "📱" },
              { label: "Fast Launch", emoji: "⚡" },
            ].map((b) => (
              <Card key={b.label} className="p-3 shadow-card border-border/50">
                <div className="text-2xl mb-1">{b.emoji}</div>
                <p className="text-xs font-medium text-muted-foreground">{b.label}</p>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* Android native install button */}
        {deferredPrompt && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="p-5 shadow-card border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-primary/10 text-primary border-primary/20">Android</Badge>
                <span className="text-sm font-medium">One-tap install available!</span>
              </div>
              <Button
                onClick={handleInstall}
                disabled={installing}
                className="w-full gradient-hero text-white border-0 hover:opacity-90 gap-2 h-11"
              >
                <Download className="w-4 h-4" />
                {installing ? "Installing..." : "Install BatchHub Now"}
              </Button>
            </Card>
          </motion.div>
        )}

        {/* Android manual steps */}
        {(isAndroid || !isIOS) && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="p-5 shadow-card border-border/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="text-lg">🤖</div>
                <h2 className="font-display font-semibold">Android (Chrome)</h2>
              </div>
              <div className="space-y-3">
                {androidSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                      {step.icon}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{step.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* iOS steps */}
        {(isIOS || !isAndroid) && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
            <Card className="p-5 shadow-card border-border/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="text-lg">🍎</div>
                <h2 className="font-display font-semibold">iPhone / iPad (Safari)</h2>
              </div>
              <div className="space-y-3">
                {iosSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full gradient-hero flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                      {step.icon}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{step.text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border/40 flex items-start gap-2">
                <Share2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  The Share button (□↑) is at the bottom center of Safari on iPhone, and at the top right on iPad.
                </p>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Go to app */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
          <Link to="/">
            <Button variant="outline" className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5">
              <Plus className="w-4 h-4" /> Continue to BatchHub
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
