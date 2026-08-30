import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  Save,
  Upload,
  X,
} from "lucide-react";
import { useCreateBom, useUploadBom } from "../api/hooks/boms";
import {
  BOM_FIELD_OPTIONS,
  buildBomLines,
  inspectBomFile,
  validateBomMapping,
  type BomField,
  type BomFieldMapping,
  type BomImportPreview,
  type BomMappingIssue,
} from "../api/bomParser";
import {
  BomEditor,
  createEditableBomLine,
  editableToBomLines,
  exportBomCsv,
  type EditableBomLine,
} from "../components/BomEditor";
import {
  ErrorMessage,
  FileDropzone,
  Spinner,
  useToast,
} from "../components/ui";
import { supportedCurrencies, type CurrencyCode } from "../lib/format";
import { useCurrencyPreference } from "../lib/useCurrencyPreference";
import { useUsdExchangeRate } from "../lib/useExchangeRate";

function mappingIssueText(issue: BomMappingIssue) {
  if (issue.mappingMissing) return `${issue.label} is not mapped.`;
  return `${issue.label} is empty in ${issue.missingRows} ${issue.missingRows === 1 ? "row" : "rows"}.`;
}

function detectBomCurrency(
  preview: BomImportPreview,
): CurrencyCode | undefined {
  const priceColumn = preview.columns.find(
    (column) => column.suggestedField === "unit_price",
  );
  if (!priceColumn) return undefined;
  const sourceText = [priceColumn.header, ...priceColumn.samples]
    .join(" ")
    .toUpperCase();
  const explicitCode = supportedCurrencies.find(({ code }) =>
    new RegExp(`\\b${code}\\b`).test(sourceText),
  );
  if (explicitCode) return explicitCode.code;
  if (sourceText.includes("₹")) return "INR";
  if (sourceText.includes("€")) return "EUR";
  if (sourceText.includes("£")) return "GBP";
  if (sourceText.includes("¥")) return "JPY";
  if (sourceText.includes("$")) return "USD";
  return undefined;
}

export function BomUpload() {
  const { createBom } = useCreateBom();
  const { uploadBom } = useUploadBom();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const uploadMode = searchParams.get("mode") === "upload";
  const { currency: preferredCurrency } = useCurrencyPreference();
  const [sourceCurrency, setSourceCurrency] =
    useState<CurrencyCode>(preferredCurrency);
  const sourceExchangeRate = useUsdExchangeRate(
    uploadMode ? sourceCurrency : "USD",
  );
  const [bomName, setBomName] = useState("Untitled");
  const [nameDraft, setNameDraft] = useState("Untitled");
  const [renaming, setRenaming] = useState(false);
  const [rows, setRows] = useState<EditableBomLine[]>(() => [
    createEditableBomLine(1),
  ]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BomImportPreview | null>(null);
  const [mapping, setMapping] = useState<BomFieldMapping>({});
  const [inspecting, setInspecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadFile) setSourceCurrency(preferredCurrency);
  }, [preferredCurrency, uploadFile]);

  function buildManualLines() {
    return editableToBomLines(rows, `manual-${Date.now()}`);
  }

  async function saveManualBom() {
    const lines = buildManualLines();
    if (!lines.length) {
      showToast({
        title: "Add at least one line",
        body: "Enter an MPN or description before saving.",
      });
      return;
    }
    const project = await createBom({ name: bomName, lines });
    showToast({
      title: "BOM created",
      body: `${project.name} is ready to review.`,
      tone: "success",
    });
    navigate(`/projects/${project.id}`);
  }

  function exportManualBom() {
    const lines = buildManualLines();
    exportBomCsv(bomName, lines);
    showToast({
      title: "CSV exported",
      body: `${bomName || "BOM"} downloaded.`,
      tone: "success",
    });
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

  async function inspectUpload(file: File) {
    setUploadFile(file);
    setPreview(null);
    setUploadError(null);
    setInspecting(true);
    try {
      const nextPreview = await inspectBomFile(file);
      setPreview(nextPreview);
      setMapping({ ...nextPreview.suggestedMapping });
      setSourceCurrency(detectBomCurrency(nextPreview) ?? preferredCurrency);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The selected BOM could not be read.";
      setUploadError(message);
      showToast({ title: "Could not read BOM", body: message });
    } finally {
      setInspecting(false);
    }
  }

  function changeMapping(columnIndex: number, value: string) {
    const field = value ? (value as BomField) : undefined;
    setMapping((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (field && next[Number(key)] === field) delete next[Number(key)];
      });
      if (field) next[columnIndex] = field;
      else delete next[columnIndex];
      return next;
    });
  }

  function resetUpload() {
    setUploadFile(null);
    setPreview(null);
    setMapping({});
    setUploadError(null);
  }

  async function confirmUpload() {
    if (!uploadFile || !preview) return;
    const validation = validateBomMapping(preview, mapping);
    if (validation.errors.length) {
      showToast({
        title: "Required BOM fields are missing",
        body: mappingIssueText(validation.errors[0]),
      });
      return;
    }

    const lines = buildBomLines(preview, mapping);
    if (!lines.length) {
      showToast({
        title: "No BOM lines detected",
        body: "Check the MPN or Description mapping and try again.",
      });
      return;
    }

    const hasMappedPrice = Object.values(mapping).includes("unit_price");
    const exchangeRateReady =
      sourceExchangeRate.currency === sourceCurrency &&
      !sourceExchangeRate.loading &&
      !sourceExchangeRate.error;
    if (hasMappedPrice && sourceCurrency !== "USD" && !exchangeRateReady) {
      showToast({
        title: "Currency conversion unavailable",
        body: sourceExchangeRate.loading
          ? "Wait for the exchange rate to load."
          : "Try again or select USD as the source currency.",
      });
      return;
    }

    const normalizedLines =
      hasMappedPrice && sourceCurrency !== "USD"
        ? lines.map((line) => ({
            ...line,
            unit_price: line.unit_price / sourceExchangeRate.rate,
          }))
        : lines;

    setUploading(true);
    try {
      const project = await uploadBom(uploadFile, {
        name: preview.name,
        lines: normalizedLines,
      });
      showToast({
        title: "BOM uploaded",
        body: `${project.name} is ready to review.`,
        tone: "success",
      });
      navigate(`/projects/${project.id}`);
    } catch (error) {
      showToast({
        title: "Could not upload BOM",
        body: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  if (uploadMode) {
    const validation = preview
      ? validateBomMapping(preview, mapping)
      : { errors: [], warnings: [] };
    const importLineCount = preview
      ? buildBomLines(preview, mapping).length
      : 0;
    const hasMappedPrice = Object.values(mapping).includes("unit_price");
    const requiresCurrencyConversion =
      hasMappedPrice && sourceCurrency !== "USD";
    const rateMatchesCurrency = sourceExchangeRate.currency === sourceCurrency;
    const currencyReady =
      !requiresCurrencyConversion ||
      (rateMatchesCurrency &&
        !sourceExchangeRate.loading &&
        !sourceExchangeRate.error);
    const canImport =
      validation.errors.length === 0 && importLineCount > 0 && currencyReady;

    return (
      <div className="stack bom-import-page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Upload BOM</h1>
            <p className="page-subtitle">
              {preview && uploadFile
                ? `${uploadFile.name} · ${preview.dataRowCount} ${preview.dataRowCount === 1 ? "row" : "rows"} detected`
                : "Upload a CSV or XLSX file, then confirm the detected columns."}
            </p>
          </div>
          <Link className="button" to="/projects">
            <ArrowLeft size={16} />
            Back
          </Link>
        </div>

        {!preview && !inspecting && !uploadError && (
          <FileDropzone
            accept={[".csv", ".xlsx"]}
            onFileSelected={inspectUpload}
            hint="PartPilot will detect your column headings before anything is imported."
          />
        )}

        {inspecting && (
          <Spinner
            message={`Detecting fields in ${uploadFile?.name ?? "BOM"}...`}
          />
        )}

        {uploadError && !inspecting && (
          <div className="stack bom-import-error">
            <ErrorMessage message={uploadError} />
            <button type="button" className="button" onClick={resetUpload}>
              <RefreshCw size={16} />
              Choose another file
            </button>
          </div>
        )}

        {preview && uploadFile && (
          <section className="bom-mapping" aria-labelledby="bom-mapping-title">
            <div className="bom-mapping__intro">
              <div>
                <h2 id="bom-mapping-title">Confirm detected fields</h2>
                <p>
                  Suggested matches are already selected. Change a match only
                  when a source heading means something else.
                </p>
              </div>
              <button
                type="button"
                className="button"
                onClick={resetUpload}
                disabled={uploading}
              >
                <RefreshCw size={16} />
                Change file
              </button>
            </div>

            <div className="bom-mapping__notices" aria-live="polite">
              {validation.errors.length > 0 && (
                <div
                  className="bom-mapping__notice bom-mapping__notice--error"
                  role="alert"
                >
                  <AlertCircle size={20} aria-hidden="true" />
                  <div>
                    <strong>Required fields need attention</strong>
                    <ul>
                      {validation.errors.map((issue) => (
                        <li key={issue.field}>{mappingIssueText(issue)}</li>
                      ))}
                    </ul>
                    <p>
                      Designator and MPN are required to identify every BOM
                      line.
                    </p>
                  </div>
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div className="bom-mapping__notice bom-mapping__notice--warning">
                  <AlertTriangle size={20} aria-hidden="true" />
                  <div>
                    <strong>Recommended fields are missing</strong>
                    <ul>
                      {validation.warnings.map((issue) => (
                        <li key={issue.field}>{mappingIssueText(issue)}</li>
                      ))}
                    </ul>
                    <p>
                      You can still import, but these lines may initially
                      contain less detail.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="bom-mapping__currency">
              <div>
                <label htmlFor="bom-price-currency">Unit price currency</label>
                <span>
                  {hasMappedPrice
                    ? "Choose the currency used by the uploaded Unit price column."
                    : "This will apply if you map a Unit price column."}
                </span>
              </div>
              <div className="bom-mapping__currency-control">
                <select
                  id="bom-price-currency"
                  className="form-control"
                  value={sourceCurrency}
                  onChange={(event) =>
                    setSourceCurrency(event.target.value as CurrencyCode)
                  }
                  disabled={uploading}
                >
                  {supportedCurrencies.map((currency) => (
                    <option value={currency.code} key={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
                {hasMappedPrice && sourceCurrency !== "USD" && (
                  <span
                    className={
                      sourceExchangeRate.error
                        ? "bom-mapping__currency-status bom-mapping__currency-status--error"
                        : "bom-mapping__currency-status"
                    }
                  >
                    {!rateMatchesCurrency || sourceExchangeRate.loading
                      ? `Loading ${sourceCurrency} exchange rate...`
                      : sourceExchangeRate.error
                        ? `${sourceExchangeRate.error}. Select USD or try again.`
                        : `${sourceCurrency} prices will retain their value when displayed in ${sourceCurrency}.`}
                  </span>
                )}
              </div>
            </div>

            <div
              className="bom-mapping__table"
              role="table"
              aria-label="Detected BOM column mappings"
            >
              <div
                className="bom-mapping__row bom-mapping__row--header"
                role="row"
              >
                <span role="columnheader">Detected column</span>
                <span role="columnheader">Example from file</span>
                <span role="columnheader">PartPilot field</span>
              </div>
              {preview.columns.map((column) => {
                const selectedField = mapping[column.index];
                const suggested =
                  selectedField && selectedField === column.suggestedField;
                return (
                  <div
                    className="bom-mapping__row"
                    role="row"
                    key={`${column.index}-${column.header}`}
                  >
                    <div className="bom-mapping__source" role="cell">
                      <FileSpreadsheet size={17} aria-hidden="true" />
                      <strong>{column.header}</strong>
                    </div>
                    <div className="bom-mapping__samples" role="cell">
                      {column.samples.length ? (
                        column.samples.join(" · ")
                      ) : (
                        <span>No sample value</span>
                      )}
                    </div>
                    <div className="bom-mapping__field" role="cell">
                      <select
                        className="form-control"
                        aria-label={`Map ${column.header} to PartPilot field`}
                        value={selectedField ?? ""}
                        onChange={(event) =>
                          changeMapping(column.index, event.target.value)
                        }
                        disabled={uploading}
                      >
                        <option value="">Do not import</option>
                        {BOM_FIELD_OPTIONS.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span
                        className={
                          suggested
                            ? "bom-mapping__status bom-mapping__status--suggested"
                            : "bom-mapping__status"
                        }
                      >
                        {suggested ? (
                          <>
                            <CheckCircle2 size={14} /> Suggested match
                          </>
                        ) : selectedField ? (
                          "Manually matched"
                        ) : (
                          "Not imported"
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bom-mapping__actions">
              {validation.errors.length > 0 && (
                <p>Resolve required field errors to continue.</p>
              )}
              {!validation.errors.length && !importLineCount && (
                <p>No complete Designator and MPN rows were found.</p>
              )}
              {!validation.errors.length &&
                importLineCount > 0 &&
                !currencyReady && (
                  <p>A currency conversion rate is required to continue.</p>
                )}
              <button
                type="button"
                className="button button--primary"
                onClick={confirmUpload}
                disabled={!canImport || uploading}
              >
                <Upload size={16} />
                {uploading
                  ? "Importing..."
                  : `Import ${importLineCount} ${importLineCount === 1 ? "row" : "rows"}`}
              </button>
            </div>
          </section>
        )}
      </div>
    );
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
              <button
                type="submit"
                className="icon-button"
                aria-label="Save BOM name"
              >
                <Check size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Cancel BOM name edit"
                onClick={cancelRename}
              >
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
          <button
            type="button"
            className="button button--primary"
            onClick={saveManualBom}
          >
            <Save size={16} />
            Save BOM
          </button>
        </div>
      </div>
      <BomEditor rows={rows} onRowsChange={setRows} />
    </div>
  );
}
