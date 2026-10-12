use std::path::Path;

use anyhow::{Context, Result, bail};
use calamine::{Reader, open_workbook_auto};

#[derive(Debug)]
pub struct Line {
    pub row: usize,
    pub mpn: String,
    pub manufacturer: String,
    pub qty: String,
    pub designator: String,
}

fn normalize(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn field(value: &str) -> Option<usize> {
    match normalize(value).as_str() {
        "mpn"
        | "mfgpn"
        | "mfgpartnumber"
        | "mfrpn"
        | "mfrpartnumber"
        | "manufacturerpn"
        | "manufacturerpartnumber"
        | "partnumber"
        | "partno"
        | "part"
        | "vendorpn"
        | "vendorpartnumber"
        | "supplierpn"
        | "supplierpartnumber"
        | "componentnumber"
        | "orderingcode"
        | "ordercode"
        | "materialnumber" => Some(0),
        "manufacturer" | "mfg" | "mfr" | "vendor" | "supplier" | "brand" | "maker" => Some(1),
        "qty" | "quantity" | "unitqty" | "unitquantity" | "bomqty" | "usage" | "amount"
        | "count" => Some(2),
        "designator"
        | "designators"
        | "reference"
        | "references"
        | "referencedesignator"
        | "referencedesignators"
        | "refdes"
        | "ref" => Some(3),
        _ => None,
    }
}

pub fn read(path: &Path) -> Result<Vec<Line>> {
    let rows = match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "csv" => csv_rows(
            &std::fs::read_to_string(path)
                .with_context(|| format!("Cannot read {}", path.display()))?,
        )?,
        "xlsx" => {
            let mut book = open_workbook_auto(path).context("Cannot open Excel workbook")?;
            book.worksheet_range_at(0)
                .context("Workbook has no worksheets")??
                .rows()
                .map(|r| r.iter().map(ToString::to_string).collect())
                .collect()
        }
        _ => bail!("Unsupported file type; use .csv or .xlsx"),
    };
    parse_rows(rows)
}

fn csv_rows(text: &str) -> Result<Vec<Vec<String>>> {
    // Choose the delimiter whose parsed header has the most recognizable columns.
    let mut best = None;
    for delimiter in *b",;\t" {
        let parsed: Result<Vec<_>, _> = csv::ReaderBuilder::new()
            .has_headers(false)
            .flexible(true)
            .delimiter(delimiter)
            .from_reader(text.trim_start_matches('\u{feff}').as_bytes())
            .records()
            .map(|r| r.map(|r| r.iter().map(str::to_owned).collect::<Vec<_>>()))
            .collect();
        if let Ok(rows) = parsed {
            let score = rows
                .iter()
                .take(10)
                .map(|r| r.iter().filter(|v| field(v).is_some()).count())
                .max()
                .unwrap_or(0);
            if best.as_ref().is_none_or(|(s, _)| score > *s) {
                best = Some((score, rows));
            }
        }
    }
    best.map(|(_, rows)| rows).context("Cannot parse CSV")
}

fn parse_rows(rows: Vec<Vec<String>>) -> Result<Vec<Line>> {
    let header = rows
        .iter()
        .take(10)
        .position(|r| r.iter().any(|v| field(v) == Some(0)))
        .context(
            "No MPN header found in the first 10 rows. Use MPN or Manufacturer Part Number.",
        )?;
    let mut columns = [None; 4];
    for (index, name) in rows[header].iter().enumerate() {
        if let Some(f) = field(name) {
            if columns[f].is_some() {
                bail!("Ambiguous duplicate column: {name}");
            }
            columns[f] = Some(index);
        }
    }
    let mut lines = Vec::new();
    for (index, row) in rows.iter().enumerate().skip(header + 1) {
        if row.iter().all(|v| v.trim().is_empty()) {
            continue;
        }
        let get = |f: usize| {
            columns[f]
                .and_then(|i| row.get(i))
                .map(|v| v.trim().to_owned())
                .unwrap_or_default()
        };
        let mpn = get(0);
        if mpn.is_empty() {
            bail!("Missing MPN on row {}", index + 1);
        }
        let qty = get(2);
        if !qty.is_empty() && !qty.parse::<u64>().is_ok_and(|q| q > 0) {
            bail!(
                "Invalid quantity on row {}: {qty}; expected a positive whole number",
                index + 1
            );
        }
        lines.push(Line {
            row: index + 1,
            mpn,
            manufacturer: get(1),
            qty: if qty.is_empty() { "1".into() } else { qty },
            designator: get(3),
        });
    }
    if lines.is_empty() {
        bail!("No BOM data rows found");
    }
    Ok(lines)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn delimiters_preamble_and_quotes() {
        for separator in [",", ";", "\t"] {
            let csv = format!(
                "\u{feff}Example BOM\nManufacturer Part Number{separator}Qty{separator}Reference\nAMS1117{separator}2{separator}\"U1,U2\"\n"
            );
            let lines = parse_rows(csv_rows(&csv).unwrap()).unwrap();
            assert_eq!(lines[0].mpn, "AMS1117");
            assert_eq!(lines[0].designator, "U1,U2");
            assert_eq!(lines[0].row, 3);
        }
    }
    #[test]
    fn rejects_missing_mpn_and_invalid_quantity() {
        for csv in [
            "MPN,Qty\n,2",
            "MPN,Qty\nABC,-1",
            "MPN,Qty\nABC,1.5",
            "Description\nABC",
            "MPN,Part Number\nABC,DEF",
        ] {
            assert!(parse_rows(csv_rows(csv).unwrap()).is_err(), "{csv}");
        }
    }
}
