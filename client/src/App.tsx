import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ClipboardList, LayoutDashboard, Search } from "lucide-react";
import { TabNav, TopAppBar } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { PartSearch } from "./pages/PartSearch";
import { PartCompare } from "./pages/PartCompare";
import { PartDetail } from "./pages/PartDetail";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { BomCompare } from "./pages/BomCompare";
import { BomUpload } from "./pages/BomUpload";
import { Watchlist } from "./pages/Watchlist";

const tabs = [
  { key: "dashboard", label: "Dashboard", to: "/dashboard", icon: <LayoutDashboard size={22} /> },
  { key: "search", label: "Part Search", to: "/search", icon: <Search size={22} /> },
  { key: "projects", label: "Projects / BOM", to: "/projects", icon: <ClipboardList size={22} /> },
];

function activeTabForPath(pathname: string) {
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
        <Route path="/search" element={<PartSearch />} />
        <Route path="/search/compare" element={<PartCompare />} />
        <Route path="/parts/:id" element={<PartDetail />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/upload" element={<BomUpload />} />
        <Route path="/projects/compare" element={<BomCompare />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
