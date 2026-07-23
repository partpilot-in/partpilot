import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ClipboardList, LayoutDashboard, Package, Search } from "lucide-react";
import { TabNav, TopAppBar } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { MyParts } from "./pages/MyParts";
import { PartProcure } from "./pages/PartProcure";
import { PartCompare } from "./pages/PartCompare";
import { PartDetail } from "./pages/PartDetail";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { BomCompare } from "./pages/BomCompare";
import { BomEdit } from "./pages/BomEdit";
import { BomUpload } from "./pages/BomUpload";
import { Watchlist } from "./pages/Watchlist";

const tabs = [
  { key: "dashboard", label: "Dashboard", to: "/dashboard", icon: <LayoutDashboard size={22} /> },
  { key: "my-parts", label: "My Parts", to: "/my-parts", icon: <Package size={22} /> },
  { key: "search", label: "PartProcure", to: "/search", icon: <Search size={22} /> },
  { key: "projects", label: "Projects", to: "/projects", icon: <ClipboardList size={22} /> },
];

function activeTabForPath(pathname: string) {
  if (pathname.startsWith("/my-parts")) return "my-parts";
  if (pathname.startsWith("/search") || pathname.startsWith("/parts")) return "search";
  if (pathname.startsWith("/projects")) return "projects";
  return "dashboard";
}

function AppLayout() {
  const location = useLocation();

  return (
    <>
      <TopAppBar
        organizationSlug="partpilot-hq"
        user={{ name: "Tirrek Payne" }}
      />
      <TabNav tabs={tabs} activeKey={activeTabForPath(location.pathname)} />
      <main className="page-shell">
        <Outlet />
      </main>
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-parts" element={<MyParts />} />
        <Route path="/search" element={<PartProcure />} />
        <Route path="/search/compare" element={<PartCompare />} />
        <Route path="/parts/:id" element={<PartDetail />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/upload" element={<BomUpload />} />
        <Route path="/projects/compare" element={<BomCompare />} />
        <Route path="/projects/:id/edit" element={<BomEdit />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
