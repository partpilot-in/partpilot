import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

interface FileDropzoneProps {
  accept: string[];
  onFileSelected: (file: File) => void;
  hint?: string;
}

export function FileDropzone({ accept, onFileSelected, hint }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function selectFile(file?: File) {
    if (file) onFileSelected(file);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  return (
    <label
      className={["file-dropzone", dragging && "file-dropzone--dragging"].filter(Boolean).join(" ")}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(",")}
        onChange={onInputChange}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />
      <FileSpreadsheet size={28} aria-hidden="true" />
      <strong>
        <Upload size={16} aria-hidden="true" /> Drop a BOM file or browse
      </strong>
      <span>{hint ?? `Accepted formats: ${accept.join(", ")}`}</span>
    </label>
  );
}
