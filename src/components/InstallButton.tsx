import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/**
 * Shows an "Install App" button only when the app is NOT already installed as a PWA.
 * Detects standalone mode via display-mode media query.
 */
export default function InstallButton({ className = "" }: { className?: string }) {
  const [isInstalled, setIsInstalled] = useState(true); // default hidden until check

  useEffect(() => {
    // Check if running as installed PWA (standalone)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    setIsInstalled(isStandalone);
  }, []);

  if (isInstalled) return null;

  return (
    <Link to="/install">
      <Button
        variant="outline"
        size="sm"
        className={`gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 text-xs h-8 px-3 ${className}`}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
        <span className="sm:hidden">Install</span>
      </Button>
    </Link>
  );
}
