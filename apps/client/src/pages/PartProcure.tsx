import { Navigate, useLocation } from "react-router-dom";

export function PartProcure() {
  const location = useLocation();
  return <Navigate to={`/my-parts${location.search}`} replace />;
}
