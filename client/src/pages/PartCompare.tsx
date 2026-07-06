import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useComparePartsProperties } from "../api/hooks/parts";
import { Card, EmptyState, PropertyCompareTable } from "../components/ui";

export function PartCompare() {
  const [searchParams] = useSearchParams();
  const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const parts = useComparePartsProperties(ids);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Compare parts</h1>
          <p className="page-subtitle">Parameter differences are highlighted for quick replacement review.</p>
        </div>
        <Link className="button" to="/search">
          <ArrowLeft size={16} />
          Back to search
        </Link>
      </div>
      <Card>
        {parts.length >= 2 ? (
          <PropertyCompareTable parts={parts} />
        ) : (
          <EmptyState title="Select at least two parts" body="Use Part Search to choose rows for side-by-side comparison." />
        )}
      </Card>
    </div>
  );
}
