import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Download, GitCompareArrows, MoreVertical, Pencil, Trash2, X } from "lucide-react";
import { useDeleteBom, useProject, useProjects, useRenameBom } from "../api/hooks/boms";
import type { BomLine } from "../api/types";
import { exportBomCsv } from "../components/BomEditor";
import {
  ComplianceBadge,
  DataTable,
  EmptyState,
  ErrorMessage,
  LifecycleBadge,
  Modal,
  ScoreRing,
  Spinner,
  useToast,
  type Column,
} from "../components/ui";
import { createCurrencyFormatter, formatDate } from "../lib/format";
import { useCurrencyPreference } from "../lib/useCurrencyPreference";
import { useUsdExchangeRate } from "../lib/useExchangeRate";

export function ProjectDetail() {
  const { id } = useParams();
  const { data: project, loading, error, refetch } = useProject(id);
  const { data: projects } = useProjects();
  const navigate = useNavigate();
  const { renameBom } = useRenameBom();
  const { deleteBom } = useDeleteBom();
  const { showToast } = useToast();
  const { currency } = useCurrencyPreference();
  const exchangeRate = useUsdExchangeRate(currency);
  const displayCurrency = exchangeRate.loading || exchangeRate.error ? "USD" : currency;
  const displayRate = exchangeRate.loading || exchangeRate.error ? 1 : exchangeRate.rate;
  const bomCurrencyFormatter = createCurrencyFormatter(displayCurrency);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareTarget, setCompareTarget] = useState<string>("");
  const [renaming, setRenaming] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project) setProjectName(project.name);
  }, [project]);

  useEffect(() => {
    function closeActionsMenu(event: MouseEvent) {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }

    function closeActionsMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActionsOpen(false);
    }

    document.addEventListener("mousedown", closeActionsMenu);
    document.addEventListener("keydown", closeActionsMenuOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeActionsMenu);
      document.removeEventListener("keydown", closeActionsMenuOnEscape);
    };
  }, []);

  const columns: Column<BomLine>[] = [
    { key: "line_no", header: "#", sortable: true, numeric: true },
    { key: "description", header: "Description", sortable: true },
    { key: "manufacturer", header: "Manufacturer", sortable: true },
    { key: "country_of_origin", header: "Made In", sortable: true },
    { key: "category", header: "Category", sortable: true },
    { key: "qty", header: "Qty", sortable: true, numeric: true },
    {
      key: "unit_price",
      header: "Price",
      sortable: true,
      numeric: true,
      render: (row) => bomCurrencyFormatter.format(row.unit_price * displayRate),
    },
    {
      key: "compliance",
      header: "Compliance",
      sortable: true,
      render: (row) => <ComplianceBadge statuses={row.compliance} />,
    },
    {
      key: "lifecycle_stage",
      header: "Lifecycle",
      sortable: true,
      render: (row) => <LifecycleBadge stage={row.lifecycle_stage} />,
    },
    {
      key: "score",
      header: "PartPilot Score",
      sortable: true,
      numeric: true,
      render: (row) => <ScoreRing value={row.score} size="sm" />,
    },
  ];

  function exportProjectBom() {
    if (!project) return;
    exportBomCsv(project.name, Array.isArray(project.lines) ? project.lines : []);
    showToast({ title: "CSV exported", body: `${project.name} downloaded.`, tone: "success" });
  }

  async function saveProjectName(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    try {
      const renamed = await renameBom(project.id, projectName);
      setRenaming(false);
      setProjectName(renamed.name);
      refetch();
      showToast({ title: "Project renamed", body: renamed.name, tone: "success" });
    } catch (renameError) {
      showToast({ title: "Could not rename project", body: renameError instanceof Error ? renameError.message : "Please try again." });
    }
  }

  function cancelRename() {
    if (project) setProjectName(project.name);
    setRenaming(false);
  }

  async function confirmDeleteProject() {
    if (!project) return;
    try {
      await deleteBom(project.id);
      setDeleteOpen(false);
      showToast({ title: "Project deleted", body: `${project.name} was removed.`, tone: "success" });
      navigate("/projects");
    } catch (deleteError) {
      showToast({ title: "Could not delete project", body: deleteError instanceof Error ? deleteError.message : "Please try again." });
    }
  }

  if (loading) {
    return <Spinner message="Loading project..." />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        body="This project does not exist."
        action={
          <Link className="button" to="/projects">
            Back to projects
          </Link>
        }
      />
    );
  }

  const projectLines = Array.isArray(project.lines) ? project.lines : [];
  const totalCost = projectLines.reduce((total, line) => total + line.qty * line.unit_price, 0);
  const convertedTotalCost = totalCost * displayRate;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          {renaming ? (
            <form className="project-title-edit" onSubmit={saveProjectName}>
              <input
                className="form-control project-title-input"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                aria-label="Project name"
                autoFocus
              />
              <button type="submit" className="icon-button" aria-label="Save project name">
                <Check size={18} />
              </button>
              <button type="button" className="icon-button" aria-label="Cancel project name edit" onClick={cancelRename}>
                <X size={18} />
              </button>
            </form>
          ) : (
            <div className="project-title-row">
              <h1 className="page-title">{project.name}</h1>
              <button type="button" className="icon-button" aria-label="Edit project name" onClick={() => setRenaming(true)}>
                <Pencil size={18} />
              </button>
            </div>
          )}
          <p className="page-subtitle">
            {projectLines.length || project.part_count} parts – uploaded {formatDate(project.uploaded_at)}
          </p>
          {currency !== "USD" && (
            <p className="page-subtitle currency-note">
              {exchangeRate.loading
                ? `Loading live USD to ${currency} rate...`
                : exchangeRate.error
                  ? `${exchangeRate.error}; showing stored USD values.`
                  : `Converted from USD using live USD to ${currency} rate ${exchangeRate.rate.toFixed(4)}${exchangeRate.date ? ` from ${formatDate(exchangeRate.date)}` : ""}.`}
            </p>
          )}
        </div>
        <div className="inline-stack">
          <Link className="button" to="/projects">
            <ArrowLeft size={16} />
            Projects
          </Link>
          <div className="account-menu project-actions-menu" ref={actionsMenuRef}>
            <button
              type="button"
              className="button"
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((open) => !open)}
            >
              <MoreVertical size={16} />
              Actions
            </button>
            {actionsOpen && (
              <div className="account-menu__panel project-actions-menu__panel" role="menu">
                <button
                  type="button"
                  className="account-menu__item"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    setCompareOpen(true);
                  }}
                >
                  <GitCompareArrows size={18} />
                  <span>Compare BOM</span>
                </button>
                <button
                  type="button"
                  className="account-menu__item"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    navigate(`/projects/${project.id}/edit`);
                  }}
                >
                  <Pencil size={18} />
                  <span>Edit BOM</span>
                </button>
                <button
                  type="button"
                  className="account-menu__item"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    exportProjectBom();
                  }}
                >
                  <Download size={18} />
                  <span>Export BOM</span>
                </button>
                <button
                  type="button"
                  className="account-menu__item account-menu__item--danger"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 size={18} />
                  <span>Delete Project</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={projectLines}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/parts/${row.part_id}`)}
        footer={
          <tr>
            <td />
            <td />
            <td />
            <td />
            <td />
            <td />
            <td className="data-table__numeric bom-total-cell">
              <span>{bomCurrencyFormatter.format(convertedTotalCost)}</span>
            </td>
            <td />
            <td />
            <td />
          </tr>
        }
      />

      <Modal open={compareOpen} title="Compare with another BOM" onClose={() => setCompareOpen(false)}>
        <div className="stack" style={{ gap: 16 }}>
          <select
            className="form-control"
            value={compareTarget}
            onChange={(event) => setCompareTarget(event.target.value)}
            aria-label="Select BOM to compare"
          >
            <option value="">Choose a project</option>
            {(projects ?? [])
              .filter((candidate) => candidate.id !== project.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
          </select>
          <div className="inline-stack">
            <button
              type="button"
              className="button button--primary"
              disabled={!compareTarget}
              onClick={() => {
                if (compareTarget) {
                  navigate(`/projects/compare?a=${project.id}&b=${compareTarget}`);
                }
              }}
            >
              <GitCompareArrows size={16} />
              Compare
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteOpen} title="Delete project" onClose={() => setDeleteOpen(false)}>
        <div className="stack" style={{ gap: 16 }}>
          <p className="modal-copy">
            Delete {project.name}? This removes the project and its BOM lines from My Parts.
          </p>
          <div className="inline-stack">
            <button type="button" className="button button--danger" onClick={confirmDeleteProject}>
              <Trash2 size={16} />
              Delete Project
            </button>
            <button type="button" className="button" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
