import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Save } from "lucide-react";
import { useProject, useUpdateBom } from "../api/hooks/boms";
import {
  BomEditor,
  bomLineToEditable,
  editableToBomLines,
  exportBomCsv,
  type EditableBomLine,
} from "../components/BomEditor";
import {
  Card,
  EmptyState,
  ErrorMessage,
  Spinner,
  useToast,
} from "../components/ui";

export function BomEdit() {
  const { id } = useParams();
  const { data: project, loading, error } = useProject(id);
  const { updateBom } = useUpdateBom();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [bomName, setBomName] = useState("");
  const [rows, setRows] = useState<EditableBomLine[]>([]);

  useEffect(() => {
    if (!project) return;
    setBomName(project.name);
    setRows(project.lines.map(bomLineToEditable));
  }, [project]);

  if (loading) {
    return <Spinner message="Loading BOM..." />;
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

  const activeProject = project;

  function buildLines() {
    return editableToBomLines(rows, activeProject.id);
  }

  async function saveBom() {
    const lines = buildLines();
    if (!lines.length) {
      showToast({
        title: "Add at least one line",
        body: "Enter an MPN or description before saving.",
      });
      return;
    }
    try {
      const updated = await updateBom(activeProject.id, {
        name: bomName,
        lines,
      });
      showToast({
        title: "BOM updated",
        body: `${updated.name} now has ${updated.part_count} parts.`,
        tone: "success",
      });
      navigate(`/projects/${updated.id}`);
    } catch (saveError) {
      showToast({
        title: "Could not save BOM",
        body:
          saveError instanceof Error ? saveError.message : "Please try again.",
      });
    }
  }

  function exportBom() {
    exportBomCsv(bomName || activeProject.name, buildLines());
    showToast({
      title: "CSV exported",
      body: `${bomName || activeProject.name} downloaded.`,
      tone: "success",
    });
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit BOM</h1>
          <p className="page-subtitle">
            Update BOM lines directly in PartPilot.
          </p>
        </div>
        <Link className="button" to={`/projects/${activeProject.id}`}>
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>

      <Card
        title="Edit in app"
        action={
          <div className="inline-stack">
            <button type="button" className="button" onClick={exportBom}>
              <Download size={16} />
              Export CSV
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={saveBom}
            >
              <Save size={16} />
              Save BOM
            </button>
          </div>
        }
      >
        <div className="stack" style={{ gap: 16 }}>
          <label className="field-label">
            BOM name
            <input
              className="form-control"
              value={bomName}
              onChange={(event) => setBomName(event.target.value)}
            />
          </label>
          <BomEditor rows={rows} onRowsChange={setRows} />
        </div>
      </Card>
    </div>
  );
}
