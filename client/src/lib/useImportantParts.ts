import { useEffect, useMemo, useState } from "react";
import type { Part } from "../api/types";

const importantPartsStorageKey = "partpilot.importantParts";
const importantPartsChangeEvent = "partpilot:important-parts-change";

function readImportantRecords(): Record<string, Part> {
  try {
    const raw = window.localStorage.getItem(importantPartsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeImportantRecords(records: Record<string, Part>) {
  window.localStorage.setItem(importantPartsStorageKey, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(importantPartsChangeEvent));
}

export function useImportantParts() {
  const [records, setRecords] = useState<Record<string, Part>>(() => readImportantRecords());

  useEffect(() => {
    function syncImportantParts() {
      setRecords(readImportantRecords());
    }

    window.addEventListener(importantPartsChangeEvent, syncImportantParts);
    window.addEventListener("storage", syncImportantParts);

    return () => {
      window.removeEventListener(importantPartsChangeEvent, syncImportantParts);
      window.removeEventListener("storage", syncImportantParts);
    };
  }, []);

  const ids = useMemo(() => new Set(Object.keys(records)), [records]);
  const parts = useMemo(() => Object.values(records), [records]);

  function isImportant(partId: string) {
    return ids.has(partId);
  }

  function toggleImportant(part: Part) {
    const next = { ...readImportantRecords() };
    const important = !next[part.id];

    if (important) next[part.id] = part;
    else delete next[part.id];

    writeImportantRecords(next);
    setRecords(next);
    return important;
  }

  return { ids, isImportant, parts, toggleImportant };
}
