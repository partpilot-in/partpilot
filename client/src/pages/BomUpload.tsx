import { useNavigate } from "react-router-dom";
import { useUploadBom } from "../api/hooks/boms";
import { Card, FileDropzone, useToast } from "../components/ui";

export function BomUpload() {
  const { uploadBom } = useUploadBom();
  const { showToast } = useToast();
  const navigate = useNavigate();

  async function onFileSelected(file: File) {
    showToast({ title: "Uploading BOM", body: file.name });
    const project = await uploadBom(file);
    showToast({ title: "BOM uploaded", body: `${project.name} is ready to review.`, tone: "success" });
    navigate(`/projects/${project.id}`);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Upload BOM</h1>
          <p className="page-subtitle">Drop a CSV or XLSX file to create a mocked project.</p>
        </div>
      </div>
      <Card>
        <FileDropzone accept={[".csv", ".xlsx"]} onFileSelected={onFileSelected} />
      </Card>
    </div>
  );
}
