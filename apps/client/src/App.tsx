import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ClipboardList, LayoutDashboard, Package } from "lucide-react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Spinner, TabNav, TopAppBar } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { MyParts } from "./pages/MyParts";
import { PartProcure } from "./pages/PartProcure";
import { PartCompare } from "./pages/PartCompare";
import { PartDetail } from "./pages/PartDetail";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { ResetPassword } from "./pages/ResetPassword";
import { BomCompare } from "./pages/BomCompare";
import { BomEdit } from "./pages/BomEdit";
import { BomUpload } from "./pages/BomUpload";
import { SettingsPage } from "./pages/Settings";

const tabs = [
  {
    key: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    icon: <LayoutDashboard size={22} />,
  },
  {
    key: "my-parts",
    label: "My Parts",
    to: "/my-parts",
    icon: <Package size={22} />,
  },
  {
    key: "projects",
    label: "Projects",
    to: "/projects",
    icon: <ClipboardList size={22} />,
  },
  {
    key: "kicad",
    label: "KiCad",
    icon: <img src="/kicad-logo.png" alt="" width={22} height={22} />,
    disabled: true,
  },
];

function activeTabForPath(pathname: string) {
  if (pathname.startsWith("/settings")) return "settings";
  if (
    pathname.startsWith("/my-parts") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/parts")
  )
    return "my-parts";
  if (pathname.startsWith("/projects")) return "projects";
  return "dashboard";
}

function AppLayout() {
  const location = useLocation();
  const { signOut, user } = useAuth();

  return (
    <>
      <TopAppBar user={user} onSignOut={signOut} />
      <TabNav tabs={tabs} activeKey={activeTabForPath(location.pathname)} />
      <main className="page-shell">
        <Outlet />
      </main>
    </>
  );
}

function AuthenticatedRoutes() {
  const location = useLocation();
  const { loading, passwordRecovery, user } = useAuth();

  if (passwordRecovery || location.pathname === "/reset-password")
    return <ResetPassword />;

  if (loading) {
    return (
      <main className="auth-shell">
        <Spinner message="Opening workspace" />
      </main>
    );
  }

  if (!user) return <Login />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-parts" element={<MyParts />} />
        <Route path="/my-parts/compare" element={<PartCompare />} />
        <Route path="/search" element={<PartProcure />} />
        <Route path="/search/compare" element={<PartCompare />} />
        <Route path="/parts/lookup" element={<PartDetail />} />
        <Route path="/parts/:id" element={<PartDetail />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/upload" element={<BomUpload />} />
        <Route path="/projects/compare" element={<BomCompare />} />
        <Route path="/projects/:id/edit" element={<BomEdit />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AuthenticatedRoutes />
    </AuthProvider>
  );
}
