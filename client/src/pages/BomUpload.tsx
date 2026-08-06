import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Save } from "lucide-react";
import { useCreateBom, useUploadBom } from "../api/hooks/boms";
import {
  BomEditor,
  createEditableBomLine,
  editableToBomLines,
  exportBomCsv,
  type EditableBomLine,
} from "../components/BomEditor";
import { Card, FileDropzone, useToast } from "../components/ui";

export function BomUpload() {
  const { uploadBom } = useUploadBom();
  const { createBom } = useCreateBom();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [bomName, setBomName] = useState("Untitled");
  const [rows, setRows] = useState<EditableBomLine[]>([
    {
      ...createEditableBomLine(1),
      mpn: "LM317T",
      description: "Adjustable voltage regulator",
      manufacturer: "Texas Instruments",
      country_of_origin: "US",
      category: "Regulator",
      qty: 4,
      unit_price: 0.42,
    },
  ]);

  async function onFileSelected(file: File) {
    showToast({ title: "Uploading BOM", body: file.name });
    const project = await uploadBom(file);
    showToast({ title: "BOM uploaded", body: `${project.name} is ready to review.`, tone: "success" });
    navigate(`/projects/${project.id}`);
  }

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

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Create BOM</h1>
          <p className="page-subtitle">Upload a file or build a BOM directly in PartPilot.</p>
        </div>
        <Link className="button" to="/projects">
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>
      <Card title="Upload BOM">
        <FileDropzone accept={[".csv", ".xlsx"]} onFileSelected={onFileSelected} />
      </Card>

      <Card
        title="Create in app"
        action={
          <div className="inline-stack">
            <button type="button" className="button" onClick={exportManualBom}>
              <Download size={16} />
              Export CSV
            </button>
            <button type="button" className="button button--primary" onClick={saveManualBom}>
              <Save size={16} />
              Save BOM
            </button>
          </div>
        }
      >
        <div className="stack" style={{ gap: 16 }}>
          <label className="field-label">
            BOM name
            <input className="form-control" value={bomName} onChange={(event) => setBomName(event.target.value)} />
          </label>
          <BomEditor rows={rows} onRowsChange={setRows} />
        </div>
      </Card>
    </div>
  );
}
