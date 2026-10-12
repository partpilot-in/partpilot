use crate::api::Part;
use comfy_table::{
    ContentArrangement, Table, modifiers::UTF8_ROUND_CORNERS, presets::UTF8_FULL_CONDENSED,
};
use serde_json::Value;

pub fn clean(value: &str) -> String {
    value.chars().filter(|c| !c.is_control()).collect()
}

pub fn table(headers: &[&str]) -> Table {
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL_CONDENSED)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_content_arrangement(ContentArrangement::Dynamic);
    if table.width().is_none() {
        table.set_width(100);
    }
    table.set_header(headers);
    table
}

fn label(key: &str) -> String {
    let known = match key {
        "rohsCompliant" => "RoHS compliant",
        "reachCompliant" => "REACH compliant",
        "eccn" | "eccnClassification" => "Export classification (ECCN)",
        "htsCode" => "Customs code (HTS)",
        "leadTimeWeeks" => "Lead time",
        "manufacturerStockQuantity" => "Manufacturer stock",
        "minimumOrderQuantity" => "Minimum order",
        "standardPackQuantity" => "Pack size",
        "nonCancellableNonReturnable" => "Non-cancellable / non-returnable",
        "normallyStocking" => "Normally stocked",
        "backOrderAllowed" => "Backorders accepted",
        "alternatePartNumbers" => "Other part numbers",
        "alternateSources" => "Other ordering codes",
        "manufacturerPartNumber" => "Part number",
        "genericPartFamily" => "Part family",
        "url" => "Link",
        "sku" => "SKU",
        "datasheetUrl" => "Datasheet",
        "productPageUrl" => "Product page",
        "imageUrl" => "Product image",
        "videoUrl" => "Video",
        "edaModels" => "Design models",
        "threeDModel" => "3D model",
        "moistureSensitivityLevel" => "Moisture sensitivity",
        _ => "",
    };
    if !known.is_empty() {
        return known.into();
    }
    let chars: Vec<_> = key.chars().collect();
    let mut result = String::new();
    for (i, &c) in chars.iter().enumerate() {
        if c == '_' || c == '-' {
            result.push(' ');
            continue;
        }
        if c.is_uppercase()
            && i > 0
            && (chars[i - 1].is_lowercase() || chars.get(i + 1).is_some_and(|c| c.is_lowercase()))
        {
            result.push(' ');
        }
        if i == 0 {
            result.extend(c.to_uppercase());
        } else {
            result.extend(c.to_lowercase());
        }
    }
    clean(&result)
}

fn display(value: &Value) -> String {
    match value {
        Value::Null => "Unknown".into(),
        Value::Bool(true) => "Yes".into(),
        Value::Bool(false) => "No".into(),
        Value::Number(n) => n
            .as_f64()
            .map(|n| n.to_string())
            .unwrap_or_else(|| n.to_string()),
        Value::String(v) if v.trim().is_empty() || v == "-" => "Unknown".into(),
        Value::String(v) => clean(v),
        Value::Array(values) => values.iter().map(display).collect::<Vec<_>>().join("\n"),
        Value::Object(map) if map.contains_key("value") => {
            let mut text = display(&map["value"]);
            if let Some(unit) = map.get("unit").and_then(Value::as_str) {
                text.push_str(&format!(" {}", clean(unit)));
            }
            for key in [
                "tolerance",
                "minValue",
                "typValue",
                "maxValue",
                "conditionOfApplication",
            ] {
                if let Some(value) = map.get(key) {
                    text.push_str(&format!("; {}: {}", label(key), display(value)));
                }
            }
            text
        }
        Value::Object(map) => map
            .iter()
            .filter(|(key, _)| !internal(key))
            .map(|(key, value)| format!("{}: {}", label(key), display(value)))
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

fn internal(key: &str) -> bool {
    matches!(
        key,
        "schemaVersion" | "version" | "dataType" | "irdi" | "source"
    )
}

pub fn metadata(part: &Part, path: &str) -> String {
    part.component_metadata
        .pointer(path)
        .map(display)
        .unwrap_or_else(|| "Unknown".into())
}

pub fn summary(part: &Part) -> Vec<String> {
    vec![
        clean(&part.mpn),
        clean(&part.manufacturer),
        metadata(part, "/commercial/lifecycleStatus"),
        metadata(part, "/environmental/rohsCompliant"),
        metadata(part, "/environmental/reachCompliant"),
    ]
}

fn properties(rows: &mut Vec<[String; 2]>, key: &str, value: &Value) {
    if internal(key) || value.is_null() {
        return;
    }
    if key == "additionalProperties" {
        if let Some(items) = value.as_array() {
            for item in items {
                let name = item
                    .get("definition")
                    .and_then(Value::as_str)
                    .unwrap_or("Specification");
                let value = display(item);
                if value != "Unknown" && !rows.iter().any(|r| r[1] == value) {
                    rows.push([clean(name), value]);
                }
            }
        }
        return;
    }
    if let Value::Object(map) = value
        && !map.contains_key("value")
    {
        for (child, value) in map {
            let mut nested = Vec::new();
            properties(&mut nested, child, value);
            for [name, value] in nested {
                rows.push([format!("{} — {name}", label(key)), value]);
            }
        }
        return;
    }
    let mut text = display(value);
    if key == "leadTimeWeeks" && text != "Unknown" {
        text.push_str(" weeks");
    }
    if !text.is_empty() {
        rows.push([label(key), text]);
    }
}

fn section(output: &mut String, title: &str, rows: Vec<[String; 2]>) {
    if rows.is_empty() {
        return;
    }
    let mut t = table(&["Property", "Value"]);
    for row in rows {
        t.add_row(row);
    }
    output.push_str(&format!("\n{title}\n{t}\n"));
}

fn collection(output: &mut String, title: &str, value: Option<&Value>, columns: &[(&str, &str)]) {
    let Some(items) = value.and_then(Value::as_array).filter(|v| !v.is_empty()) else {
        return;
    };
    let mut t = table(&columns.iter().map(|(_, title)| *title).collect::<Vec<_>>());
    for item in items {
        t.add_row(
            columns
                .iter()
                .map(|(key, _)| display(&item[*key]))
                .collect::<Vec<_>>(),
        );
    }
    output.push_str(&format!("\n{title}\n{t}\n"));
}

pub fn scan(parts: &[Part]) -> String {
    let mut output = String::new();
    if parts.len() > 1 {
        let mut t = table(&["MPN", "Manufacturer", "Lifecycle", "RoHS", "REACH"]);
        for part in parts {
            t.add_row(summary(part));
        }
        output.push_str(&format!("{t}\n"));
    }
    for part in parts {
        let m = &part.component_metadata;
        let maker = m
            .pointer("/identification/manufacturer")
            .and_then(Value::as_str)
            .unwrap_or(&part.manufacturer);
        output.push_str(&format!("\n{} · {}\n", clean(&part.mpn), clean(maker)));
        section(
            &mut output,
            "Overview",
            vec![
                ["Description".into(), clean(&part.description)],
                ["Category".into(), clean(&part.category)],
                [
                    "Lifecycle".into(),
                    metadata(part, "/commercial/lifecycleStatus"),
                ],
                [
                    "RoHS compliant".into(),
                    metadata(part, "/environmental/rohsCompliant"),
                ],
                [
                    "REACH compliant".into(),
                    metadata(part, "/environmental/reachCompliant"),
                ],
                [
                    "Risk score".into(),
                    part.score
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "Unknown".into()),
                ],
            ],
        );
        for (key, title) in [
            ("electrical", "Electrical specifications"),
            ("mechanical", "Package & dimensions"),
            ("thermal", "Temperature"),
            ("environmental", "Environmental compliance"),
            ("regulatory", "Trade & compliance"),
            ("material", "Materials & handling"),
            ("reliability", "Reliability"),
            ("manufacturing", "Manufacturing"),
            ("commercial", "Availability & ordering"),
            ("packaging", "Packaging"),
            ("identification", "Part identification"),
        ] {
            let Some(map) = m.get(key).and_then(Value::as_object) else {
                continue;
            };
            let mut rows = Vec::new();
            for (field, value) in map {
                if matches!(
                    (key, field.as_str()),
                    (
                        "commercial",
                        "priceBreaks" | "distributors" | "lifecycleStatus"
                    ) | ("environmental", "rohsCompliant" | "reachCompliant")
                        | (
                            "identification",
                            "description"
                                | "manufacturer"
                                | "manufacturerPartNumber"
                                | "genericPartFamily"
                        )
                ) {
                    continue;
                }
                if key == "identification"
                    && field == "eccnClassification"
                    && m.pointer("/regulatory/eccn") == Some(value)
                {
                    continue;
                }
                if key == "commercial"
                    && field == "alternateSources"
                    && m.pointer("/identification/alternatePartNumbers") == Some(value)
                {
                    continue;
                }
                if field != "additionalProperties" {
                    properties(&mut rows, field, value);
                }
            }
            if let Some(value) = map.get("additionalProperties") {
                properties(&mut rows, "additionalProperties", value);
            }
            section(&mut output, title, rows);
        }
        collection(
            &mut output,
            "Distributor offers",
            m.pointer("/commercial/distributors"),
            &[
                ("name", "Distributor"),
                ("packageType", "Packaging"),
                ("sku", "Order code"),
                ("stockQuantity", "In stock"),
                ("minimumOrderQuantity", "Min. order"),
            ],
        );
        collection(
            &mut output,
            "Price breaks",
            m.pointer("/commercial/priceBreaks"),
            &[
                ("quantity", "Quantity from"),
                ("unitPrice", "Price per unit"),
                ("currency", "Currency"),
            ],
        );
        // Keep resource URLs intact for copying and deduplicate legacy/canonical links.
        let mut links: Vec<(String, String)> = Vec::new();
        fn collect_links(value: &Value, name: &str, links: &mut Vec<(String, String)>) {
            match value {
                Value::String(url) if url.starts_with("https://") || url.starts_with("http://") => {
                    let url = clean(url);
                    if !links.iter().any(|(_, existing)| existing == &url) {
                        links.push((name.to_owned(), url));
                    }
                }
                Value::Array(items) => {
                    for item in items {
                        collect_links(item, name, links);
                    }
                }
                Value::Object(map) => {
                    if let Some(url) = map.get("url") {
                        let title = map
                            .get("title")
                            .or_else(|| map.get("documentType"))
                            .and_then(Value::as_str)
                            .unwrap_or(name);
                        collect_links(url, &clean(title), links);
                    } else {
                        for (key, value) in map {
                            collect_links(value, &label(key), links);
                        }
                    }
                }
                _ => {}
            }
        }
        for key in ["documentation", "edaModels"] {
            if let Some(value) = m.get(key) {
                collect_links(value, &label(key), &mut links);
            }
        }
        if !links.is_empty() {
            output.push_str("\nDocuments & links\n");
            for (name, url) in links {
                output.push_str(&format!("  {name}\n  {url}\n\n"));
            }
        }
    }
    output.push_str("\nUnknown means the API did not provide that value.\n");
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn production_resistor_response_is_readable() {
        let response: Value =
            serde_json::from_str(include_str!("../tests/fixtures/crgsp0603f100k.json")).unwrap();
        let parts: Vec<Part> = serde_json::from_value(response["data"].clone()).unwrap();
        let text = scan(&parts);
        assert!(text.contains("CRGSP0603F100K"));
        assert!(text.contains("Price breaks"));
        assert!(!text.contains("[{"));
        assert!(!text.contains("commercial."));
        println!("{text}");
    }

    #[test]
    fn nested_data_is_readable_without_json_or_raw_paths() {
        let part: Part = serde_json::from_value(serde_json::json!({"mpn":"ABC", "manufacturer":"M", "component_metadata":{
            "environmental":{"rohsCompliant":false},
            "commercial":{"lifecycleStatus":"Active","leadTimeWeeks":23.0,"priceBreaks":[{"quantity":10,"unitPrice":0.081,"currency":"USD"}],"distributors":[{"name":"DigiKey","sku":"ABC-ND","stockQuantity":5000}]},
            "electrical":{"resistance":{"value":"100","unit":"kΩ"},"additionalProperties":[{"definition":"Tolerance","value":"±1%","dataType":"STRING"}]},
            "documentation":{"documents":[{"documentType":"Datasheet","url":"https://example.com/d.pdf"}]},"schemaVersion":"0.3"
        }})).unwrap();
        let text = scan(&[part]);
        for expected in [
            "No",
            "Unknown",
            "Active",
            "23 weeks",
            "Price breaks",
            "0.081",
            "Distributor offers",
            "100 kΩ",
            "Tolerance",
            "±1%",
            "https://example.com/d.pdf",
        ] {
            assert!(text.contains(expected), "Missing {expected}: {text}");
        }
        for raw in [
            "commercial.",
            "unitPrice",
            "additionalProperties",
            "schemaVersion",
            "[{",
            "\"value\"",
            "dataType",
        ] {
            assert!(!text.contains(raw), "Found {raw}");
        }
        assert_eq!(clean("a\u{1b}\n\rb"), "ab");
    }
}
