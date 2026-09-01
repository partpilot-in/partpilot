use std::collections::BTreeSet;

use serde_json::{Map, Value, json};

pub const DATASHEET_SCHEMA_VERSION: &str = "0.3";

const ROOT_OBJECT_SECTIONS: &[&str] = &[
    "identification",
    "electrical",
    "mechanical",
    "thermal",
    "material",
    "environmental",
    "reliability",
    "regulatory",
    "manufacturing",
    "commercial",
    "packaging",
    "documentation",
    "edaModels",
];

const EDA_MODEL_KEYS: &[&str] = &[
    "bsdl",
    "ibis",
    "spice",
    "svd",
    "symbol",
    "footprint",
    "threeDModel",
];

const DOCUMENT_TYPES: &[&str] = &[
    "Datasheet",
    "Application Note",
    "Technical Note",
    "Errata",
    "PCN",
];

const DOCUMENT_FIELDS: &[&str] = &[
    "documentType",
    "title",
    "documentNumber",
    "revision",
    "date",
    "url",
];

const REVISION_HISTORY_FIELDS: &[&str] = &["revision", "date", "notes"];

/// Normalizes the partial JSON projection used by migration 0017 and validates
/// its canonical Documentation and EDA model structures.
pub fn normalize_component_metadata(mut metadata: Value) -> Result<Value, String> {
    if !metadata.is_object() {
        return Err("component_metadata must be a JSON object".to_owned());
    }
    if metadata.as_object().is_some_and(Map::is_empty) {
        return Ok(metadata);
    }

    let eda_models = normalized_eda_models(&metadata);
    let documents = metadata
        .get("documentation")
        .and_then(Value::as_object)
        .map(normalized_document_entries);

    let root = metadata.as_object_mut().expect("object checked above");
    if root
        .get("version")
        .and_then(Value::as_str)
        .is_none_or(|version| version.trim().is_empty())
        && !root.get("version").is_some_and(|value| !value.is_string())
    {
        root.insert("version".to_owned(), json!("1"));
    }
    root.insert("schemaVersion".to_owned(), json!(DATASHEET_SCHEMA_VERSION));

    if !eda_models.is_empty() {
        root.insert("edaModels".to_owned(), Value::Object(eda_models));
    }
    if let Some(documents) = documents
        && !documents.is_empty()
        && let Some(documentation) = root.get_mut("documentation").and_then(Value::as_object_mut)
    {
        documentation.insert("documents".to_owned(), Value::Array(documents));
    }

    validate_component_metadata(&metadata)?;
    Ok(metadata)
}

pub fn validate_component_metadata(metadata: &Value) -> Result<(), String> {
    let root = metadata
        .as_object()
        .ok_or_else(|| "component_metadata must be a JSON object".to_owned())?;
    if root.is_empty() {
        return Ok(());
    }

    if !root.get("version").is_some_and(Value::is_string) {
        return Err("component_metadata.version must be a string".to_owned());
    }
    if root.get("schemaVersion").and_then(Value::as_str) != Some(DATASHEET_SCHEMA_VERSION) {
        return Err(format!(
            "component_metadata.schemaVersion must equal {DATASHEET_SCHEMA_VERSION:?}"
        ));
    }

    for section in ROOT_OBJECT_SECTIONS {
        if root.get(*section).is_some_and(|value| !value.is_object()) {
            return Err(format!("component_metadata.{section} must be an object"));
        }
    }

    if let Some(eda_models) = root.get("edaModels").and_then(Value::as_object) {
        for (model_type, urls) in eda_models {
            if !EDA_MODEL_KEYS.contains(&model_type.as_str()) {
                return Err(format!(
                    "component_metadata.edaModels contains unsupported key {model_type:?}"
                ));
            }
            validate_uri_array(urls, &format!("component_metadata.edaModels.{model_type}"))?;
        }
    }

    if let Some(documentation) = root.get("documentation").and_then(Value::as_object) {
        if let Some(documents) = documentation.get("documents") {
            let documents = documents.as_array().ok_or_else(|| {
                "component_metadata.documentation.documents must be an array".to_owned()
            })?;
            for (index, entry) in documents.iter().enumerate() {
                validate_document_entry(entry, index)?;
            }
        }
        if let Some(certificates) = documentation.get("complianceCertificates") {
            validate_uri_array(
                certificates,
                "component_metadata.documentation.complianceCertificates",
            )?;
        }
        if let Some(history) = documentation.get("revisionHistory") {
            validate_revision_history(history)?;
        }
    }

    Ok(())
}

fn normalized_eda_models(metadata: &Value) -> Map<String, Value> {
    let mut normalized = Map::new();
    for key in EDA_MODEL_KEYS {
        let mut urls = BTreeSet::new();
        collect_uris(metadata.pointer(&format!("/edaModels/{key}")), &mut urls);
        collect_uris(
            metadata.pointer(&format!("/documentation/edaModels/{key}")),
            &mut urls,
        );
        collect_uris(
            metadata.pointer(&format!("/documentation/{key}")),
            &mut urls,
        );
        if !urls.is_empty() {
            normalized.insert(
                (*key).to_owned(),
                Value::Array(urls.into_iter().map(Value::String).collect()),
            );
        }
    }
    normalized
}

fn normalized_document_entries(documentation: &Map<String, Value>) -> Vec<Value> {
    let mut entries = documentation
        .get("documents")
        .and_then(|documents| {
            documents.as_array().or_else(|| {
                documents
                    .as_object()
                    .and_then(|documents| documents.get("document"))
                    .and_then(Value::as_array)
            })
        })
        .into_iter()
        .flatten()
        .filter(|entry| entry.is_object())
        .cloned()
        .collect::<Vec<_>>();

    let legacy_sources = [
        ("Datasheet", &["datasheetUrl"][..]),
        (
            "Application Note",
            &["applicationNotes", "applicationNote"][..],
        ),
        ("Technical Note", &["technicalNotes", "technicalNote"][..]),
        ("Errata", &["errata"][..]),
        ("PCN", &["changeNotifications", "pcn"][..]),
    ];

    for (document_type, source_keys) in legacy_sources {
        let mut urls = BTreeSet::new();
        for source_key in source_keys {
            collect_uris(documentation.get(*source_key), &mut urls);
        }
        for url in urls {
            let mut entry = Map::from_iter([
                ("documentType".to_owned(), json!(document_type)),
                ("url".to_owned(), json!(url)),
            ]);
            if document_type == "Datasheet"
                && let Some(revision) = documentation
                    .get("datasheetRevision")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|revision| !revision.is_empty())
            {
                entry.insert("revision".to_owned(), json!(revision));
            }
            let entry = Value::Object(entry);
            if !entries.contains(&entry) {
                entries.push(entry);
            }
        }
    }

    entries.sort_by(|left, right| {
        left.get("documentType")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .cmp(
                right
                    .get("documentType")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            )
            .then_with(|| {
                left.get("url")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .cmp(right.get("url").and_then(Value::as_str).unwrap_or_default())
            })
    });
    entries
}

fn collect_uris(value: Option<&Value>, urls: &mut BTreeSet<String>) {
    match value {
        Some(Value::String(url)) => {
            if !url.trim().is_empty() {
                urls.insert(url.trim().to_owned());
            }
        }
        Some(Value::Array(values)) => {
            for value in values {
                if let Some(url) = value.as_str().map(str::trim).filter(|url| !url.is_empty()) {
                    urls.insert(url.to_owned());
                }
            }
        }
        _ => {}
    }
}

fn validate_uri_array(value: &Value, path: &str) -> Result<(), String> {
    let values = value
        .as_array()
        .ok_or_else(|| format!("{path} must be an array of URI strings"))?;
    if let Some(index) = values
        .iter()
        .position(|value| value.as_str().is_none_or(|url| url.trim().is_empty()))
    {
        return Err(format!("{path}[{index}] must be a non-empty URI string"));
    }
    Ok(())
}

fn validate_document_entry(entry: &Value, index: usize) -> Result<(), String> {
    let path = format!("component_metadata.documentation.documents[{index}]");
    let entry = entry
        .as_object()
        .ok_or_else(|| format!("{path} must be an object"))?;
    let document_type = entry
        .get("documentType")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{path}.documentType must be a string"))?;
    if !DOCUMENT_TYPES.contains(&document_type) {
        return Err(format!("{path}.documentType is unsupported"));
    }
    if entry
        .get("url")
        .and_then(Value::as_str)
        .is_none_or(|url| url.trim().is_empty())
    {
        return Err(format!("{path}.url must be a non-empty URI string"));
    }
    for (field, value) in entry {
        if !DOCUMENT_FIELDS.contains(&field.as_str()) {
            return Err(format!("{path} contains unsupported field {field:?}"));
        }
        if !value.is_string() {
            return Err(format!("{path}.{field} must be a string"));
        }
    }
    Ok(())
}

fn validate_revision_history(value: &Value) -> Result<(), String> {
    let history = value.as_array().ok_or_else(|| {
        "component_metadata.documentation.revisionHistory must be an array".to_owned()
    })?;
    for (index, entry) in history.iter().enumerate() {
        let path = format!("component_metadata.documentation.revisionHistory[{index}]");
        let entry = entry
            .as_object()
            .ok_or_else(|| format!("{path} must be an object"))?;
        for (field, value) in entry {
            if !REVISION_HISTORY_FIELDS.contains(&field.as_str()) {
                return Err(format!("{path} contains unsupported field {field:?}"));
            }
            if !value.is_string() {
                return Err(format!("{path}.{field} must be a string"));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_legacy_datasheet_and_eda_fields() {
        let normalized = normalize_component_metadata(json!({
            "documentation": {
                "datasheetUrl": " https://example.com/part.pdf ",
                "datasheetRevision": " Rev B ",
                "applicationNotes": ["https://example.com/app-note.pdf"],
                "symbol": "https://example.com/symbol.kicad_sym",
                "edaModels": {
                    "footprint": ["https://example.com/package.kicad_mod"]
                }
            },
            "edaModels": {
                "symbol": ["https://example.com/symbol.kicad_sym"],
                "threeDModel": ["https://example.com/package.step"]
            }
        }))
        .expect("valid metadata");

        assert_eq!(normalized["version"], "1");
        assert_eq!(normalized["schemaVersion"], DATASHEET_SCHEMA_VERSION);
        assert_eq!(
            normalized["documentation"]["documents"][1],
            json!({
                "documentType": "Datasheet",
                "revision": "Rev B",
                "url": "https://example.com/part.pdf"
            })
        );
        assert_eq!(
            normalized["edaModels"]["symbol"],
            json!(["https://example.com/symbol.kicad_sym"])
        );
        assert_eq!(
            normalized["edaModels"]["footprint"],
            json!(["https://example.com/package.kicad_mod"])
        );
    }

    #[test]
    fn rejects_invalid_canonical_document_entries() {
        let error = normalize_component_metadata(json!({
            "documentation": {
                "documents": [{
                    "documentType": "White Paper",
                    "url": "https://example.com/white-paper.pdf"
                }]
            }
        }))
        .expect_err("unsupported document type");

        assert!(error.contains("documentType is unsupported"));
    }

    #[test]
    fn rejects_unknown_eda_model_keys() {
        let error = normalize_component_metadata(json!({
            "edaModels": { "gerber": ["https://example.com/model.zip"] }
        }))
        .expect_err("unsupported EDA key");

        assert!(error.contains("unsupported key"));
    }
}
