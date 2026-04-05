import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function CityPartnerApply() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to the new unified City Partner application/login page
    navigate("/auth/superadmin?mode=apply");
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        <h2 className="text-xl font-display font-bold">Redirecting...</h2>
        <p className="text-muted-foreground text-sm">We've updated our City Partner portal. Moving you to the new application page.</p>
      </div>
    </div>
  );
}
