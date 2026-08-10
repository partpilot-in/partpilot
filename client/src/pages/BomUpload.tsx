import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Download, Pencil, Save, X } from "lucide-react";
import { useCreateBom } from "../api/hooks/boms";
import {
  BomEditor,
  createEditableBomLine,
  editableToBomLines,
  exportBomCsv,
  type EditableBomLine,
} from "../components/BomEditor";
import { useToast } from "../components/ui";

export function BomUpload() {
  const { createBom } = useCreateBom();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [bomName, setBomName] = useState("Untitled");
  const [nameDraft, setNameDraft] = useState("Untitled");
  const [renaming, setRenaming] = useState(false);
  const [rows, setRows] = useState<EditableBomLine[]>(() => [createEditableBomLine(1)]);

  function buildManualLines() {
    return editableToBomLines(rows, `manual-${Date.now()}`);
  }

  async function saveManualBom() {
    const lines = buildManualLines();
    if (!lines.length) {
      showToast({ title: "Add at least one line", body: "Enter an MPN or description before saving." });
      return;
    }
    const project = await createBom({ name: bomName, lines });
    showToast({ title: "BOM created", body: `${project.name} is ready to review.`, tone: "success" });
    navigate(`/projects/${project.id}`);
  }

  function exportManualBom() {
    const lines = buildManualLines();
    exportBomCsv(bomName, lines);
    showToast({ title: "CSV exported", body: `${bomName || "BOM"} downloaded.`, tone: "success" });
  }

  function saveBomName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = nameDraft.trim() || "Untitled";
    setBomName(nextName);
    setNameDraft(nextName);
    setRenaming(false);
  }

  function cancelRename() {
    setNameDraft(bomName);
    setRenaming(false);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          {renaming ? (
            <form className="project-title-edit" onSubmit={saveBomName}>
              <input
                className="form-control project-title-input"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                aria-label="BOM name"
                autoFocus
              />
              <button type="submit" className="icon-button" aria-label="Save BOM name">
                <Check size={18} />
              </button>
              <button type="button" className="icon-button" aria-label="Cancel BOM name edit" onClick={cancelRename}>
                <X size={18} />
              </button>
            </form>
          ) : (
            <div className="project-title-row">
              <h1 className="page-title">{bomName}</h1>
              <button
                type="button"
                className="icon-button"
                aria-label="Edit BOM name"
                onClick={() => {
                  setNameDraft(bomName);
                  setRenaming(true);
                }}
              >
                <Pencil size={18} />
              </button>
            </div>
          )}
          <p className="page-subtitle">Build a BOM directly in PartPilot.</p>
        </div>
        <div className="inline-stack">
          <Link className="button" to="/projects">
            <ArrowLeft size={16} />
            Back
          </Link>
          <button type="button" className="button" onClick={exportManualBom}>
            <Download size={16} />
            Export CSV
          </button>
          <button type="button" className="button button--primary" onClick={saveManualBom}>
            <Save size={16} />
            Save BOM
          </button>
        </div>
      </div>
      <BomEditor rows={rows} onRowsChange={setRows} />
    </div>
  );
}
