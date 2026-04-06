import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/ThemeProvider";

// Critical landing page — loaded eagerly
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// All other pages — lazy loaded to reduce initial JS bundle
const AdminDemo = lazy(() => import("./pages/demo/AdminDemo"));
const StudentBatchApply = lazy(() => import("./pages/StudentBatchApply"));

const RoleSelection = lazy(() => import("./pages/RoleSelection"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminBatches = lazy(() => import("./pages/AdminBatches"));
const AdminStudents = lazy(() => import("./pages/AdminStudents"));
const AdminAttendance = lazy(() => import("./pages/AdminAttendance"));
const AdminFees = lazy(() => import("./pages/AdminFees"));
const AdminAnnouncements = lazy(() => import("./pages/AdminAnnouncements"));
const AdminTests = lazy(() => import("./pages/AdminTests"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminApprovals = lazy(() => import("./pages/AdminApprovals"));
const AdminTeam = lazy(() => import("./pages/AdminTeam"));
const BatchWorkspace = lazy(() => import("./pages/BatchWorkspace"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const TeacherSettings = lazy(() => import("./pages/TeacherSettings"));
const StudentSettings = lazy(() => import("./pages/StudentSettings"));
const TeacherAttendance = lazy(() => import("./pages/TeacherAttendance"));
const TeacherAnnouncements = lazy(() => import("./pages/TeacherAnnouncements"));
const TeacherTests = lazy(() => import("./pages/TeacherTests"));
const TeacherHomework = lazy(() => import("./pages/TeacherHomework"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const StudentFees = lazy(() => import("./pages/StudentFees"));
const StudentAttendance = lazy(() => import("./pages/StudentAttendance"));
const StudentTests = lazy(() => import("./pages/StudentTests"));
const StudentHomework = lazy(() => import("./pages/StudentHomework"));
const StudentAnnouncements = lazy(() => import("./pages/StudentAnnouncements"));
const ParentDashboard = lazy(() => import("./pages/ParentDashboard"));
const ParentFees = lazy(() => import("./pages/ParentFees"));
const AdminAuth = lazy(() => import("./pages/auth/AdminAuth"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const TeacherAuth = lazy(() => import("./pages/auth/TeacherAuth"));
const StudentAuth = lazy(() => import("./pages/auth/StudentAuth"));
const ParentAuth = lazy(() => import("./pages/auth/ParentAuth"));
const SuperAdminAuth = lazy(() => import("./pages/auth/SuperAdminAuth"));
const OwnerAuth = lazy(() => import("./pages/auth/OwnerAuth"));
const OwnerDashboard = lazy(() => import("./pages/OwnerDashboard"));
const CityPartnerApply = lazy(() => import("./pages/CityPartnerApply"));
const Install = lazy(() => import("./pages/Install"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="batchhub-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-screen">
                <div className="w-7 h-7 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/role-select" element={<RoleSelection />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Demo routes — pure fake data, no DB */}
              <Route path="/demo/admin" element={<AdminDemo />} />
              {/* Admin */}
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/batches" element={<AdminBatches />} />
              <Route path="/admin/students" element={<AdminStudents />} />
              <Route path="/admin/attendance" element={<AdminAttendance />} />
              <Route path="/admin/fees" element={<AdminFees />} />
              <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              <Route path="/admin/tests" element={<AdminTests />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/approvals" element={<AdminApprovals />} />
              <Route path="/admin/team" element={<AdminTeam />} />
              <Route path="/admin/batch-applications" element={<AdminApprovals />} />
              <Route path="/auth/admin" element={<AdminAuth />} />
              <Route path="/auth/superadmin" element={<SuperAdminAuth />} />
              <Route path="/superadmin" element={<SuperAdminDashboard />} />
              <Route path="/auth/teacher" element={<TeacherAuth />} />
              <Route path="/auth/student" element={<StudentAuth />} />
              <Route path="/auth/parent" element={<ParentAuth />} />
              <Route path="/auth/owner" element={<OwnerAuth />} />
              <Route path="/owner" element={<OwnerDashboard />} />
              <Route path="/apply/city-partner" element={<CityPartnerApply />} />
              <Route path="/install" element={<Install />} />
              <Route path="/batch/:id" element={<BatchWorkspace />} />
              {/* Teacher */}
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/teacher/settings" element={<TeacherSettings />} />
              <Route path="/teacher/attendance" element={<TeacherAttendance />} />
              <Route path="/teacher/announcements" element={<TeacherAnnouncements />} />
              <Route path="/teacher/tests" element={<TeacherTests />} />
              <Route path="/teacher/homework" element={<TeacherHomework />} />
              {/* Student */}
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/settings" element={<StudentSettings />} />
              <Route path="/student/attendance" element={<StudentAttendance />} />
              <Route path="/student/tests" element={<StudentTests />} />
              <Route path="/student/homework" element={<StudentHomework />} />
              <Route path="/student/announcements" element={<StudentAnnouncements />} />
              <Route path="/student/apply-batch" element={<StudentBatchApply />} />
              <Route path="/student/fees" element={<StudentFees />} />
              {/* Parent */}
              <Route path="/parent" element={<ParentDashboard />} />
              <Route path="/parent/fees" element={<ParentFees />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
