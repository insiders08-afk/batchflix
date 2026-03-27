/**
 * AdminDemo — mirrors the real test institute dashboard with hardcoded data.
 * NEVER touches Supabase or shows real institute data.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, CalendarCheck, IndianRupee, CheckCircle2,
  Megaphone, Clock, AlertTriangle, ArrowUpRight, Zap, Home
} from "lucide-react";

const fakeBatches = [
  { id: "b1", name: "Maths 9", teacher: "Lavii Singh", students: 4, course: "Maths" },
  { id: "b2", name: "Social 9", teacher: "Krisss", students: 4, course: "Social" },
];

const fakeAnnouncements = [
  { id: "a1", title: "No Class — Social 9 — Monday, 16 March", by: "admin fake", ago: "Just now" },
];

const stats = [
  { title: "Total Students", value: "4", icon: Users, bg: "bg-primary/10", color: "text-primary" },
  { title: "Active Batches", value: "2", icon: CalendarCheck, bg: "bg-success/10", color: "text-success" },
  { title: "Today's Attendance", value: "Not taken yet", icon: CheckCircle2, bg: "bg-accent/10", color: "text-accent" },
  { title: "Unpaid Fees", value: "1", icon: IndianRupee, bg: "bg-destructive/10", color: "text-destructive" },
];

export default function AdminDemo() {
  const [tab, setTab] = useState<"dashboard" | "batches" | "students" | "attendance">("dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Demo Banner */}
      <div className="bg-accent text-white text-center text-xs py-2 font-medium">
        🎭 Demo Mode — This is sample data from a test institute.
      </div>

      <div className="flex h-[calc(100vh-32px)]">
        {/* Sidebar */}
        <aside className="w-56 bg-card border-r border-border/50 flex flex-col p-4 gap-1 shrink-0">
          <div className="flex items-center gap-2 mb-4 px-1">
            <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-display font-bold text-base text-gradient">BatchHub</span>
          </div>

          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide px-2 mb-0.5">Admin</p>
          <p className="text-xs font-semibold px-2 mb-2 truncate">TesT InsiTiTuTe, Bareilly</p>

          {[
            { label: "Overview", key: "dashboard" },
            { label: "Batches", key: "batches" },
            { label: "Students", key: "students" },
            { label: "Attendance", key: "attendance" },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setTab(item.key as typeof tab)}
              className={`text-sm text-left px-3 py-2 rounded-lg transition-colors ${
                tab === item.key ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}

          <div className="mt-auto space-y-2">
            <Link to="/">
              <Button variant="outline" className="w-full gap-2 h-9 text-xs border-primary/30 text-primary hover:bg-primary/10">
                <Home className="w-3.5 h-3.5" /> Back to Homepage
              </Button>
            </Link>
            <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
              <p className="text-xs font-semibold">admin fake</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {tab === "dashboard" && (
            <div className="space-y-5 max-w-4xl">
              <h1 className="text-xl font-display font-bold">Overview</h1>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {stats.map((s, i) => (
                  <motion.div key={s.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                    <Card className="p-5 shadow-card border-border/50">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center`}>
                          <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                      </div>
                      <div className="text-2xl font-display font-bold leading-tight">{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.title}</div>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-5 shadow-card border-border/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display font-semibold">Recent Announcements</h3>
                    <Button variant="ghost" size="sm" className="text-primary h-7 text-xs">View all <ArrowUpRight className="w-3 h-3 ml-1" /></Button>
                  </div>
                  <div className="space-y-3">
                    {fakeAnnouncements.map(a => (
                      <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/40">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Megaphone className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{a.title}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {a.ago} · {a.by}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 shadow-card border-border/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display font-semibold">Alerts</h3>
                    <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs">1 unpaid</Badge>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm">1 student(s) have unpaid fees</p>
                      <Button variant="ghost" size="sm" className="text-destructive h-6 text-xs p-0 mt-1">View fees →</Button>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Active Batches */}
              <Card className="p-5 shadow-card border-border/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold">Active Batches</h3>
                  <Button variant="ghost" size="sm" className="text-primary h-7 text-xs">Manage <ArrowUpRight className="w-3 h-3 ml-1" /></Button>
                </div>
                <div className="space-y-3">
                  {fakeBatches.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center text-white text-xs font-bold">
                          {b.name.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{b.name}</p>
                          <p className="text-xs text-muted-foreground">{b.teacher} · {b.students} students</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 text-xs">Open</Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {tab === "batches" && (
            <div className="space-y-5 max-w-3xl">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-display font-bold">Batches</h1>
                <Button className="gradient-hero text-white border-0 hover:opacity-90 h-9 text-sm">+ Create Batch</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fakeBatches.map((b, i) => (
                  <motion.div key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                    <Card className="p-5 shadow-card border-border/50">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center text-white font-bold text-sm">
                          {b.name.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{b.name}</p>
                          <Badge variant="secondary" className="text-xs">{b.course}</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">{b.teacher} · {b.students} students</p>
                      <Button variant="outline" className="w-full h-8 text-xs">Open Workspace</Button>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {tab === "students" && (
            <div className="space-y-5 max-w-3xl">
              <h1 className="text-xl font-display font-bold">Students</h1>
              <div className="space-y-2">
                {[
                  { id: "s1", name: "Shiv", batch: "Maths 9" },
                  { id: "s2", name: "Ramesh", batch: "Maths 9" },
                  { id: "s3", name: "Student A", batch: "Social 9" },
                  { id: "s4", name: "Student B", batch: "Social 9" },
                ].map((s, i) => (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <Card className="p-4 shadow-card border-border/50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {s.name[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.batch}</p>
                        </div>
                      </div>
                      <Badge className="text-xs bg-success/10 text-success border-success/20">Active</Badge>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {tab === "attendance" && (
            <div className="space-y-5 max-w-3xl">
              <h1 className="text-xl font-display font-bold">Today's Attendance</h1>
              <Card className="p-6 text-center shadow-card border-border/50">
                <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Attendance not taken yet for today.</p>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
