import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, GitCompareArrows, Pencil, Upload } from "lucide-react";
import { useProject, useProjects, useUploadBom } from "../api/hooks/boms";
import type { BomLine, Project } from "../api/types";
import { exportBomCsv } from "../components/BomEditor";
import {
  Card,
  ComplianceBadge,
  DataTable,
  EmptyState,
  FileDropzone,
  LifecycleBadge,
  Modal,
  ScoreRing,
  useToast,
  type Column,
} from "../components/ui";
import { currencyFormatter, formatDate } from "../lib/format";

export function ProjectDetail() {
  const { id } = useParams();
  const project = useProject(id);
  const projects = useProjects();
  const navigate = useNavigate();
  const { uploadBom } = useUploadBom();
  const { showToast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareTarget, setCompareTarget] = useState<string>("");

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
      render: (row) => currencyFormatter.format(row.unit_price),
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

  async function onFileSelected(file: File) {
    showToast({ title: "Uploading BOM", body: file.name });
    const uploaded = await uploadBom(file);
    showToast({ title: "BOM uploaded", body: `${uploaded.name} is ready to review.`, tone: "success" });
    setUploadOpen(false);
    navigate(`/projects/${uploaded.id}`);
  }

  function compareWith(projectToCompare: Project) {
    if (!project) return;
    navigate(`/projects/compare?a=${project.id}&b=${projectToCompare.id}`);
  }

  function exportProjectBom() {
    if (!project) return;
    exportBomCsv(project.name, project.lines);
    showToast({ title: "CSV exported", body: `${project.name} downloaded.`, tone: "success" });
  }

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        body="The mock BOM list does not include this project."
        action={
          <Link className="button" to="/projects">
            Back to projects
          </Link>
        }
      />
    );
  }

  const totalCost = project.lines.reduce((total, line) => total + line.qty * line.unit_price, 0);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle">
            {project.part_count} parts - uploaded {formatDate(project.uploaded_at)}
          </p>
        </div>
        <div className="inline-stack">
          <Link className="button" to="/projects">
            <ArrowLeft size={16} />
            Projects
          </Link>
          <button type="button" className="button" onClick={() => setCompareOpen(true)}>
            <GitCompareArrows size={16} />
            Compare BOM
          </button>
          <Link className="button" to={`/projects/${project.id}/edit`}>
            <Pencil size={16} />
            Edit BOM
          </Link>
          <button type="button" className="button" onClick={exportProjectBom}>
            <Download size={16} />
            Export CSV
          </button>
          <button type="button" className="button button--primary" onClick={() => setUploadOpen(true)}>
            <Upload size={16} />
            Upload new BOM
          </button>
        </div>
      </div>

      <Card title="BOM lines">
        <DataTable
          columns={columns}
          rows={project.lines}
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
                <span>{currencyFormatter.format(totalCost)}</span>
              </td>
              <td />
              <td />
              <td />
            </tr>
          }
        />
      </Card>

      <Modal open={uploadOpen} title="Upload new BOM" onClose={() => setUploadOpen(false)}>
        <FileDropzone accept={[".csv", ".xlsx"]} onFileSelected={onFileSelected} />
      </Modal>

      <Modal open={compareOpen} title="Compare with another BOM" onClose={() => setCompareOpen(false)}>
        <div className="stack" style={{ gap: 16 }}>
          <select
            className="form-control"
            value={compareTarget}
            onChange={(event) => setCompareTarget(event.target.value)}
            aria-label="Select BOM to compare"
          >
            <option value="">Choose a project</option>
            {projects
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
                const target = projects.find((candidate) => candidate.id === compareTarget);
                if (target) compareWith(target);
              }}
            >
              <GitCompareArrows size={16} />
              Compare
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
