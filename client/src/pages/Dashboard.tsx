import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { useProjects } from "../api/hooks/boms";
import { useProjectParts } from "../api/hooks/parts";
import type { Part } from "../api/types";
import { EmptyState, ErrorMessage, ScoreRing, Spinner } from "../components/ui";
import { getGreeting } from "../lib/format";
import { readManualParts } from "../lib/myPartsStorage";
import { useImportantParts } from "../lib/useImportantParts";

interface ManufacturerNewsItem {
  impact: string;
  source: string;
  time: string;
  title: string;
}

interface MetalPrice {
  change: string;
  metal: string;
  price: string;
}

const metalPrices: MetalPrice[] = [
  { metal: "LME Copper", price: "$9,640/mt", change: "+1.2%" },
  { metal: "LME Aluminum", price: "$2,520/mt", change: "-0.4%" },
  { metal: "LME Tin", price: "$33,800/mt", change: "+0.8%" },
  { metal: "LME Nickel", price: "$15,980/mt", change: "-1.1%" },
  { metal: "LME Zinc", price: "$2,910/mt", change: "+0.3%" },
  { metal: "LME Lead", price: "$2,060/mt", change: "-0.2%" },
];

function normalizeManufacturer(value: string) {
  return value.trim();
}

export function Dashboard() {
  const navigate = useNavigate();
  const { ids: importantIds, parts: importantParts } = useImportantParts();
  const { data: projects, loading: projLoading, error: projError } = useProjects();
  const [selectedManufacturer, setSelectedManufacturer] = useState("");
  const projectParts = useProjectParts(projects);
  const manualParts = useMemo(() => readManualParts(), []);
  const parts = useMemo(() => {
    const rows = new Map<string, Part>();
    [...projectParts, ...manualParts, ...importantParts].forEach((part) => rows.set(part.id, part));
    return Array.from(rows.values());
  }, [importantParts, manualParts, projectParts]);
  const flaggedAttentionParts = useMemo(
    () =>
      parts.filter(
        (part) =>
          importantIds.has(part.id) ||
          part.score < 75 ||
          part.lifecycle_stage === "obsolete" ||
          part.lifecycle_stage === "last_time_buy" ||
          part.lifecycle_stage === "nrnd",
      ),
    [importantIds, parts],
  );
  const attentionParts = useMemo(() => {
    return [...(flaggedAttentionParts.length ? flaggedAttentionParts : parts)].sort(
      (a, b) => Number(importantIds.has(b.id)) - Number(importantIds.has(a.id)) || a.score - b.score,
    );
  }, [flaggedAttentionParts, importantIds, parts]);
  const attentionRows = useMemo(() => attentionParts.slice(0, 7), [attentionParts]);
  const lowestScore = useMemo(() => (parts.length ? Math.min(...parts.map((part) => part.score)) : 0), [parts]);
  const manufacturers = useMemo(() => {
    const counts = new Map<string, number>();
    parts.forEach((part) => {
      const manufacturer = normalizeManufacturer(part.manufacturer);
      if (!manufacturer || manufacturer.toLowerCase() === "unknown") return;
      counts.set(manufacturer, (counts.get(manufacturer) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([manufacturer, count]) => ({ count, manufacturer }));
  }, [parts]);
  const dashboardStats = useMemo(
    () => [
      { label: "Parts", value: parts.length.toLocaleString() },
      { label: "Need attention", value: flaggedAttentionParts.length.toLocaleString() },
      { label: "Lowest score", value: parts.length ? String(lowestScore) : "-" },
      { label: "Manufacturers", value: manufacturers.length.toLocaleString() },
    ],
    [flaggedAttentionParts.length, lowestScore, manufacturers.length, parts.length],
  );
  const activeManufacturer =
    manufacturers.find((item) => item.manufacturer === selectedManufacturer)?.manufacturer ?? manufacturers[0]?.manufacturer ?? "";
  const newsItems = useMemo<ManufacturerNewsItem[]>(
    () =>
      activeManufacturer
        ? [
            {
              title: `Strait of Hormuz blockage raises freight risk for ${activeManufacturer} supply lanes`,
              source: "Global Supply Desk",
              time: "2h ago",
              impact: "Watch logistics lead times",
            },
            {
              title: `${activeManufacturer} distributors flag allocation pressure on high-volume components`,
              source: "Electronics Market Wire",
              time: "5h ago",
              impact: "Review reorder points",
            },
            {
              title: `Port congestion adds two-week variance to semiconductor shipments tied to ${activeManufacturer}`,
              source: "Component Brief",
              time: "Yesterday",
              impact: "Check alternates",
            },
            {
              title: `Copper and air freight costs lift near-term pricing assumptions for ${activeManufacturer} parts`,
              source: "Procurement Monitor",
              time: "Yesterday",
              impact: "Reprice active BOMs",
            },
          ]
        : [],
    [activeManufacturer],
  );

  return (
    <div className="dashboard-grid">
      <section className="dashboard-command">
        <div>
          <h1>{getGreeting()}</h1>
          <p>Parts risk, market signals, and manufacturer news at a glance.</p>
        </div>
      </section>

      <section className="dashboard-summary-grid" aria-label="Dashboard summary">
        {dashboardStats.map((stat) => (
          <div className="dashboard-stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </section>

      <section className="dashboard-overview" aria-label="Dashboard overview">
        <section className="stack alternates-section dashboard-attention">
          <h2 className="section-title">Parts needing attention</h2>
          {projLoading ? (
            <Spinner message="Scanning parts..." />
          ) : projError ? (
            <ErrorMessage message={projError} />
          ) : attentionRows.length ? (
            <div className="attention-card-grid">
              {attentionRows.map((part) => (
                <button
                  key={part.id}
                  type="button"
                  className="attention-card"
                  onClick={() => navigate(`/parts/${part.id}`)}
                >
                  <span className="attention-card__important" aria-label={importantIds.has(part.id) ? "Important" : "Not important"}>
                    {importantIds.has(part.id) ? <Star size={16} fill="currentColor" /> : <Star size={16} />}
                  </span>
                  <span className="attention-card__part">
                    <strong>{part.mpn}</strong>
                    <small>{part.manufacturer}</small>
                  </span>
                  <span className="attention-card__score">
                    <ScoreRing value={part.score} size="sm" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No parts need attention" body="Important or lower-score parts will appear here." />
          )}
        </section>

        <section className="dashboard-side-column" aria-label="Market context">
          <section className="market-prices" aria-label="LME prices">
            <div>
              <h2 className="section-title">LME prices</h2>
              <p className="manufacturer-news__subtitle">Electronics metals, USD per metric ton.</p>
            </div>
            <div className="metal-price-grid">
              {metalPrices.map((metal) => (
                <div className="metal-price" key={metal.metal}>
                  <span>{metal.metal}</span>
                  <strong>{metal.price}</strong>
                  <small className={metal.change.startsWith("-") ? "metal-price__change--down" : "metal-price__change--up"}>
                    {metal.change}
                  </small>
                </div>
              ))}
            </div>
          </section>

          <aside className="manufacturer-news" aria-label="Manufacturer news">
            <div>
              <h2 className="section-title">Manufacturer news</h2>
              <p className="manufacturer-news__subtitle">Latest coverage tied to manufacturers in My Parts.</p>
            </div>
            {manufacturers.length ? (
              <>
                <div className="news-tabs" role="tablist" aria-label="Manufacturer news tabs">
                  {manufacturers.map((item) => (
                    <button
                      key={item.manufacturer}
                      type="button"
                      className={["news-tab", item.manufacturer === activeManufacturer && "news-tab--active"].filter(Boolean).join(" ")}
                      role="tab"
                      aria-selected={item.manufacturer === activeManufacturer}
                      onClick={() => setSelectedManufacturer(item.manufacturer)}
                    >
                      <span>{item.manufacturer}</span>
                      <small>{item.count}</small>
                    </button>
                  ))}
                </div>
                {newsItems.length ? (
                  <ul className="news-list">
                    {newsItems.map((article) => (
                      <li key={article.title}>
                        <span className="news-list__title">{article.title}</span>
                        <small>{[article.source, article.time, article.impact].join(" - ")}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="manufacturer-news__empty">No recent news found for {activeManufacturer}.</p>
                )}
              </>
            ) : (
              <p className="manufacturer-news__empty">Add parts with manufacturer names to see related news.</p>
            )}
          </aside>
        </section>
      </section>
    </div>
  );
}
