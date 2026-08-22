use std::collections::HashSet;

use crate::domain::{AlternateMatchKind, NormalizedMpn, ParamValue, Part, PartId, PartParameters};

#[derive(Debug, Clone, PartialEq)]
pub struct MatchCandidate {
    pub candidate: PartId,
    pub kind: AlternateMatchKind,
    pub similarity: f32,
}

pub fn find_alternates(
    target: &Part,
    target_params: &PartParameters,
    pool: &[(Part, PartParameters)],
) -> Vec<MatchCandidate> {
    let mut out = Vec::new();
    let mut same_family_matches = HashSet::new();

    for (candidate, params) in pool {
        if candidate.id == target.id {
            continue;
        }
        if shares_family_prefix(&target.mpn, &candidate.mpn) && same_package(target_params, params)
        {
            let similarity =
                parametric_similarity(target.category.as_deref(), target_params, params);
            if similarity > 0.8 {
                same_family_matches.insert(candidate.id.clone());
                out.push(MatchCandidate {
                    candidate: candidate.id.clone(),
                    kind: AlternateMatchKind::SameFamily,
                    similarity,
                });
            }
        }
    }

    for (candidate, params) in pool {
        if candidate.id == target.id || same_family_matches.contains(&candidate.id) {
            continue;
        }
        if candidate.category == target.category {
            let similarity =
                parametric_similarity(target.category.as_deref(), target_params, params);
            if similarity > 0.9 {
                out.push(MatchCandidate {
                    candidate: candidate.id.clone(),
                    kind: AlternateMatchKind::FormFitFunction,
                    similarity,
                });
            }
        }
    }

    out.sort_by(|left, right| {
        right
            .similarity
            .total_cmp(&left.similarity)
            .then_with(|| match_priority(right.kind).cmp(&match_priority(left.kind)))
    });
    out
}

fn shares_family_prefix(left: &NormalizedMpn, right: &NormalizedMpn) -> bool {
    let left_stem = family_stem(&left.0);
    let right_stem = family_stem(&right.0);
    left_stem.len() >= 3 && left_stem == right_stem
}

fn family_stem(mpn: &str) -> &str {
    mpn.split('-').next().unwrap_or(mpn)
}

fn same_package(left: &PartParameters, right: &PartParameters) -> bool {
    match (package_value(left), package_value(right)) {
        (Some(left), Some(right)) => left.eq_ignore_ascii_case(right),
        _ => false,
    }
}

fn package_value(params: &PartParameters) -> Option<&str> {
    get_text(params, &["package", "case_package", "mounting_package"])
}

fn parametric_similarity(
    category: Option<&str>,
    left: &PartParameters,
    right: &PartParameters,
) -> f32 {
    match category.map(|category| category.to_ascii_lowercase()) {
        Some(category) if category.contains("resistor") => resistor_similarity(left, right),
        Some(category) if category.contains("regulator") => regulator_similarity(left, right),
        _ => generic_similarity(left, right),
    }
}

fn resistor_similarity(left: &PartParameters, right: &PartParameters) -> f32 {
    let resistance = number_similarity(
        get_number(left, &["resistance_ohms", "resistance"]),
        get_number(right, &["resistance_ohms", "resistance"]),
    );
    let tolerance = number_similarity(
        get_number(left, &["tolerance_percent", "tolerance"]),
        get_number(right, &["tolerance_percent", "tolerance"]),
    );
    let package = exact_text_similarity(package_value(left), package_value(right));
    weighted_average(&[(resistance, 0.60), (tolerance, 0.25), (package, 0.15)])
        .unwrap_or_else(|| generic_similarity(left, right))
}

fn regulator_similarity(left: &PartParameters, right: &PartParameters) -> f32 {
    let voltage = number_similarity(
        get_number(left, &["output_voltage_v", "output_voltage", "voltage"]),
        get_number(right, &["output_voltage_v", "output_voltage", "voltage"]),
    );
    let current = number_similarity(
        get_number(left, &["output_current_a", "output_current", "current"]),
        get_number(right, &["output_current_a", "output_current", "current"]),
    );
    let package = exact_text_similarity(package_value(left), package_value(right));
    weighted_average(&[(voltage, 0.45), (current, 0.40), (package, 0.15)])
        .unwrap_or_else(|| generic_similarity(left, right))
}

fn generic_similarity(left: &PartParameters, right: &PartParameters) -> f32 {
    let mut scores = Vec::new();

    for (key, left_value) in &left.0 {
        if let Some(right_value) = right.0.get(key) {
            match (left_value, right_value) {
                (ParamValue::Number(left), ParamValue::Number(right)) => {
                    scores.push(relative_number_similarity(*left, *right));
                }
                (ParamValue::Text(left), ParamValue::Text(right)) => {
                    scores.push(if left.eq_ignore_ascii_case(right) {
                        1.0
                    } else {
                        0.0
                    });
                }
                (ParamValue::Bool(left), ParamValue::Bool(right)) => {
                    scores.push(if left == right { 1.0 } else { 0.0 });
                }
                _ => {}
            }
        }
    }

    if scores.is_empty() {
        0.0
    } else {
        scores.iter().sum::<f32>() / scores.len() as f32
    }
}

fn get_number(params: &PartParameters, aliases: &[&str]) -> Option<f64> {
    aliases.iter().find_map(|alias| match params.0.get(*alias) {
        Some(ParamValue::Number(value)) => Some(*value),
        _ => None,
    })
}

fn get_text<'a>(params: &'a PartParameters, aliases: &[&str]) -> Option<&'a str> {
    aliases.iter().find_map(|alias| match params.0.get(*alias) {
        Some(ParamValue::Text(value)) => Some(value.as_str()),
        _ => None,
    })
}

fn number_similarity(left: Option<f64>, right: Option<f64>) -> Option<f32> {
    Some(relative_number_similarity(left?, right?))
}

fn relative_number_similarity(left: f64, right: f64) -> f32 {
    if !left.is_finite() || !right.is_finite() {
        return 0.0;
    }

    let scale = left.abs().max(right.abs()).max(1.0);
    (1.0 - ((left - right).abs() / scale)).clamp(0.0, 1.0) as f32
}

fn exact_text_similarity(left: Option<&str>, right: Option<&str>) -> Option<f32> {
    Some(if left?.eq_ignore_ascii_case(right?) {
        1.0
    } else {
        0.0
    })
}

fn weighted_average(values: &[(Option<f32>, f32)]) -> Option<f32> {
    let mut total = 0.0;
    let mut weight_total = 0.0;
    for (value, weight) in values {
        if let Some(value) = value {
            total += value * weight;
            weight_total += weight;
        }
    }

    if weight_total == 0.0 {
        None
    } else {
        Some(total / weight_total)
    }
}

fn match_priority(kind: AlternateMatchKind) -> u8 {
    match kind {
        AlternateMatchKind::ManufacturerCrossRef => 3,
        AlternateMatchKind::SameFamily => 2,
        AlternateMatchKind::FormFitFunction => 1,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::find_alternates;
    use crate::domain::{
        AlternateMatchKind, NormalizedManufacturer, NormalizedMpn, ParamValue, Part, PartId,
        PartParameters,
    };

    fn part(id: u128, mpn: &str, category: &str) -> Part {
        Part {
            id: PartId(uuid::Uuid::from_u128(id)),
            mpn: NormalizedMpn(mpn.to_string()),
            manufacturer: NormalizedManufacturer("ACME".to_string()),
            description: None,
            category: Some(category.to_string()),
            component_metadata: serde_json::json!({}),
        }
    }

    fn resistor_params(resistance: f64, tolerance: f64, package: &str) -> PartParameters {
        PartParameters(HashMap::from([
            (
                "resistance_ohms".to_string(),
                ParamValue::Number(resistance),
            ),
            (
                "tolerance_percent".to_string(),
                ParamValue::Number(tolerance),
            ),
            ("package".to_string(), ParamValue::Text(package.to_string())),
        ]))
    }

    #[test]
    fn finds_same_family_matches_before_generic_form_fit_matches() {
        let target = part(1, "RC0603", "resistor");
        let same_family = part(2, "RC0603-ALT", "resistor");
        let form_fit = part(3, "ERJ0603", "resistor");
        let wrong_package = part(4, "RC0603-WIDE", "resistor");

        let matches = find_alternates(
            &target,
            &resistor_params(10_000.0, 1.0, "0603"),
            &[
                (same_family.clone(), resistor_params(10_100.0, 1.0, "0603")),
                (form_fit.clone(), resistor_params(10_000.0, 1.0, "0603")),
                (wrong_package, resistor_params(10_000.0, 1.0, "0805")),
            ],
        );

        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].candidate, form_fit.id);
        assert_eq!(matches[0].kind, AlternateMatchKind::FormFitFunction);
        assert_eq!(matches[1].candidate, same_family.id);
        assert_eq!(matches[1].kind, AlternateMatchKind::SameFamily);
    }
}
