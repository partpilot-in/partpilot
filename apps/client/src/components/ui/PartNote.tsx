import { FormEvent, useEffect, useState } from "react";
import { NotebookPen } from "lucide-react";
import { api } from "../../api/client";
import type { PartNote } from "../../api/types";
import { Modal } from "./Modal";
import { ErrorMessage, Spinner } from "./Spinner";
import { useToast } from "./Toast";

export interface NoteTarget {
  id: string;
  label: string;
}

interface PartNoteButtonProps {
  part: NoteTarget;
  onOpen: (part: NoteTarget) => void;
}

interface PartNoteModalProps {
  part: NoteTarget | null;
  onClose: () => void;
}

function normalizeNote(payload: unknown, partId: string): PartNote {
  const value =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  return {
    part_id: typeof value.part_id === "string" ? value.part_id : partId,
    note: typeof value.note === "string" ? value.note : "",
    partpilot_points: Array.isArray(value.partpilot_points)
      ? value.partpilot_points.filter(
          (point): point is string => typeof point === "string",
        )
      : [],
  };
}

export function PartNoteButton({ part, onOpen }: PartNoteButtonProps) {
  return (
    <button
      type="button"
      className="icon-button part-note-button"
      aria-label={`Open note for ${part.label}`}
      title="Open note"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(part);
      }}
    >
      <NotebookPen size={17} />
    </button>
  );
}

export function PartNoteModal({ part, onClose }: PartNoteModalProps) {
  const { showToast } = useToast();
  const [note, setNote] = useState("");
  const [partpilotPoints, setPartpilotPoints] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!part) return;
    let active = true;
    setNote("");
    setPartpilotPoints([]);
    setError(undefined);
    setLoading(true);

    api
      .get(`/v1/part-notes/${part.id}`)
      .then((response) => {
        if (!active) return;
        const value = normalizeNote(response.data, part.id);
        setNote(value.note);
        setPartpilotPoints(value.partpilot_points);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load this note.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [part]);

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!part) return;
    setSaving(true);
    setError(undefined);
    try {
      const response = await api.patch(`/v1/part-notes/${part.id}`, { note });
      const saved = normalizeNote(response.data, part.id);
      setNote(saved.note);
      setPartpilotPoints(saved.partpilot_points);
      showToast({ title: "Note saved", body: part.label, tone: "success" });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this note.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!part}
      title={part ? `${part.label} note` : "Part note"}
      onClose={onClose}
    >
      {loading ? (
        <Spinner message="Loading note..." />
      ) : (
        <form className="part-note-form" onSubmit={saveNote}>
          {error && <ErrorMessage message={error} />}
          <label className="field-label">
            Your note
            <textarea
              className="form-control form-control--textarea part-note-form__textarea"
              value={note}
              maxLength={20_000}
              placeholder="Add sourcing context, review reminders, or decisions about this part..."
              onChange={(event) => setNote(event.target.value)}
              disabled={saving}
              autoFocus
            />
          </label>
          <span className="part-note-form__count">
            {note.length.toLocaleString()} / 20,000
          </span>

          {partpilotPoints.length > 0 && (
            <section
              className="part-note-form__insights"
              aria-labelledby="part-note-insights-title"
            >
              <h3 id="part-note-insights-title">PartPilot points</h3>
              <ul>
                {partpilotPoints.map((point, index) => (
                  <li key={`${point}-${index}`}>{point}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="part-note-form__actions">
            <button
              type="button"
              className="button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button--primary"
              disabled={saving || !!error}
            >
              {saving ? "Saving..." : "Save note"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
