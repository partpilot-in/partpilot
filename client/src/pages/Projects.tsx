import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilePlus2, GitCompareArrows, Upload, X } from "lucide-react";
import { useProjects, useUploadBom } from "../api/hooks/boms";
import { Card, ErrorMessage, FileDropzone, Modal, ScoreRing, Spinner, useToast } from "../components/ui";
import { formatDate } from "../lib/format";

export function Projects() {
  const { data: projects, loading, error } = useProjects();
  const navigate = useNavigate();
  const { uploadBom } = useUploadBom();
  const { showToast } = useToast();
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [uploadOpen, setUploadOpen] = useState(false);

  function toggleProject(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function onFileSelected(file: File) {
    showToast({ title: "Uploading BOM", body: file.name });
    const project = await uploadBom(file);
    showToast({ title: "BOM uploaded", body: `${project.name} is ready to review.`, tone: "success" });
    setUploadOpen(false);
    navigate(`/projects/${project.id}`);
  }

  const compareIds = Array.from(selectedIds);
  const canCompare = compareIds.length === 2;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Review uploaded BOMs and compare lifecycle changes across revisions.</p>
        </div>
        <div className="inline-stack">
          <Link className="button" to="/projects/upload">
            <FilePlus2 size={16} />
            Create BOM
          </Link>
          <button type="button" className="button button--primary" onClick={() => setUploadOpen(true)}>
            <Upload size={16} />
            Upload BOM
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner message="Loading projects..." />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <section className="project-grid" aria-label="Uploaded BOM projects">
          {(projects ?? []).map((project) => (
            <Card key={project.id} className="project-card">
              <div className="project-card__top">
                <div>
                  <h3>
                    <Link to={`/projects/${project.id}`}>{project.name}</Link>
                  </h3>
                  <p>
                    {project.part_count} parts – uploaded {formatDate(project.uploaded_at)}
                  </p>
                </div>
                <input
                  type="checkbox"
                  aria-label={`Select ${project.name} for comparison`}
                  checked={selectedIds.has(project.id)}
                  onChange={() => toggleProject(project.id)}
                />
              </div>
              <div className="metric-row">
                <span className="metric-row__label">Lowest score</span>
                <ScoreRing value={project.lowest_score} size="lg" />
              </div>
              <div className="metric-row">
                <span className="metric-row__label">Owner</span>
                <strong>{project.owner}</strong>
              </div>
            </Card>
          ))}
        </section>
      )}

      {selectedIds.size > 0 && (
        <div className="floating-bar" role="region" aria-label="Compare selected BOMs">
          <span>{selectedIds.size} projects selected</span>
          <div className="inline-stack">
            <Link
              className="button button--primary"
              aria-disabled={!canCompare}
              to={canCompare ? `/projects/compare?a=${compareIds[0]}&b=${compareIds[1]}` : "#"}
              onClick={(event) => {
                if (!canCompare) event.preventDefault();
              }}
            >
              <GitCompareArrows size={16} />
              Compare selected
            </Link>
            <button type="button" className="button" onClick={() => setSelectedIds(new Set())}>
              <X size={16} />
              Clear
            </button>
          </div>
        </div>
      )}

      <Modal open={uploadOpen} title="Upload BOM" onClose={() => setUploadOpen(false)}>
        <FileDropzone accept={[".csv", ".xlsx"]} onFileSelected={onFileSelected} />
      </Modal>
    </div>
  );
}
