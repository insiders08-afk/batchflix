import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, GraduationCap, BookOpen, Users, UserCircle, ArrowRight, Zap } from "lucide-react";
import InstallButton from "@/components/InstallButton";

const roles = [
  {
    id: "admin",
    icon: Users,
    title: "Admin",
    description: "Full institute control. Manage batches, teachers, students, fees and view analytics.",
    tagline: "Continue as Admin if you are the institute owner and want to register your institute on BatchHub.",
    path: "/auth/admin",
    badge: "Institute Owner",
    gradient: "from-primary to-primary-glow",
  },
  {
    id: "teacher",
    icon: BookOpen,
    title: "Teacher",
    description: "Manage your batches, mark attendance, post announcements, create tests, and upload homework.",
    tagline: "Continue as Teacher and get connected with your institute.",
    path: "/auth/teacher",
    badge: null,
    gradient: "from-success to-emerald-400",
  },
  {
    id: "student",
    icon: GraduationCap,
    title: "Student",
    description: "Access batch chat, homework, announcements, tests, and see your performance and rankings.",
    tagline: "Continue as Student and get connected with your institute.",
    path: "/auth/student",
    badge: null,
    gradient: "from-accent to-orange-400",
  },
  {
    id: "parent",
    icon: UserCircle,
    title: "Parent",
    description: "Monitor your child's attendance, performance, fees, and batch announcements.",
    tagline: "Continue as Parent and see your student's activity in their institute.",
    path: "/auth/parent",
    badge: null,
    gradient: "from-violet-500 to-purple-600",
  },
];

export default function RoleSelection() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar */}
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

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">
              Who are you joining as?
            </h1>
            <p className="text-muted-foreground text-lg">
              Select your role to access the right dashboard
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {roles.map((role, i) => (
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Link to={role.path}>
                  <div className="group relative bg-card border border-border/60 rounded-xl p-6 text-center hover:border-primary/40 hover:shadow-lg transition-all duration-200 hover:-translate-y-1 cursor-pointer h-full flex flex-col">
                    {role.badge && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                        <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full">
                          {role.badge}
                        </span>
                      </div>
                    )}

                    <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-gradient-to-br ${role.gradient} shadow-lg`}>
                      <role.icon className="w-7 h-7 text-white" />
                    </div>

                    <h2 className="font-display font-bold text-xl mb-2">{role.title}</h2>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-3">{role.description}</p>

                    <p className="text-xs text-muted-foreground/70 italic leading-relaxed mb-5 flex-1">
                      {role.tagline}
                    </p>

                    <Button
                      className={`w-full font-medium transition-all bg-gradient-to-r ${role.gradient} text-white border-0 hover:opacity-90 shadow-sm`}
                      size="sm"
                    >
                      Continue as {role.title}
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center text-sm text-muted-foreground mt-8"
          >
            Already have an account?{" "}
            <Link to="/auth/admin" className="text-primary font-medium hover:underline">
              Sign in here
            </Link>
          </motion.p>
        </div>
      </div>
    </div>
  );
}
