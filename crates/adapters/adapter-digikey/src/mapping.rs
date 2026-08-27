use std::collections::BTreeMap;

use chrono::{NaiveDate, Utc};
use partpilot_engine::{
    Confidence, LifecycleStage, LifecycleStatus, NormalizedManufacturer, NormalizedMpn, Part,
    PartId, PartSnapshot, SourceId,
    normalize::{AliasTable, normalize_manufacturer, normalize_mpn},
};
use serde_json::{Map, Value, json};
use uuid::Uuid;

use crate::client::{ParameterValue, Product, ProductDetailsResponse, ProductVariation};

pub(crate) fn matches_requested_part(
    product: &Product,
    mpn: &NormalizedMpn,
    manufacturer: &NormalizedManufacturer,
) -> bool {
    let response_mpn = normalize_mpn(&product.manufacturer_product_number);
    let response_manufacturer =
        normalize_manufacturer(&product.manufacturer.name, &AliasTable::seed_default());
    response_mpn == *mpn && (manufacturer.0.is_empty() || response_manufacturer == *manufacturer)
}

pub(crate) fn to_part_snapshot(
    details: &ProductDetailsResponse,
    mpn: &NormalizedMpn,
    source_id: SourceId,
    fallback_currency: &str,
) -> PartSnapshot {
    let product = &details.product;
    let today = Utc::now().date_naive();
    let last_time_buy_date = product.date_last_buy_chance.map(|date| date.date_naive());
    let (stage, confidence) = lifecycle_stage(product, last_time_buy_date, today);
    let response_manufacturer =
        normalize_manufacturer(&product.manufacturer.name, &AliasTable::seed_default());
    let stable_key = format!("{}:{}", response_manufacturer.0, mpn.0);
    let part_id = PartId(Uuid::new_v5(&Uuid::NAMESPACE_URL, stable_key.as_bytes()));
    let currency = details
        .search_locale_used
        .as_ref()
        .and_then(|locale| locale.currency.as_deref())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback_currency);
    let description = product.description.as_ref().and_then(|description| {
        non_empty(description.detailed_description.as_deref())
            .or_else(|| non_empty(description.product_description.as_deref()))
            .map(str::to_owned)
    });
    let category = product
        .category
        .as_ref()
        .and_then(|category| non_empty(Some(&category.name)))
        .map(str::to_owned);
    let lifecycle_status = LifecycleStatus {
        part_id: part_id.clone(),
        stage,
        source: source_id,
        reported_at: Utc::now(),
        last_time_buy_date,
        confidence: Confidence(confidence),
        raw_payload_ref: product.product_url.clone(),
    };

    PartSnapshot {
        part: Part {
            id: part_id,
            mpn: mpn.clone(),
            manufacturer: response_manufacturer,
            description,
            category,
            component_metadata: component_metadata(product, stage, last_time_buy_date, currency),
        },
        lifecycle_status,
    }
}

fn component_metadata(
    product: &Product,
    stage: LifecycleStage,
    last_time_buy_date: Option<NaiveDate>,
    currency: &str,
) -> Value {
    let description = product.description.as_ref().and_then(|description| {
        non_empty(description.detailed_description.as_deref())
            .or_else(|| non_empty(description.product_description.as_deref()))
    });
    let mut identification = Map::new();
    insert_string(
        &mut identification,
        "manufacturerPartNumber",
        Some(&product.manufacturer_product_number),
    );
    insert_string(
        &mut identification,
        "manufacturer",
        Some(&product.manufacturer.name),
    );
    insert_string(&mut identification, "description", description);
    insert_string(
        &mut identification,
        "genericPartFamily",
        product
            .category
            .as_ref()
            .map(|category| category.name.as_str()),
    );
    insert_string(
        &mut identification,
        "series",
        product.series.as_ref().map(|series| series.name.as_str()),
    );
    insert_string(
        &mut identification,
        "baseProductNumber",
        product
            .base_product_number
            .as_ref()
            .map(|base| base.name.as_str()),
    );
    if !product.other_names.is_empty() {
        identification.insert(
            "alternatePartNumbers".to_owned(),
            json!(product.other_names),
        );
    }
    if let Some(classifications) = &product.classifications {
        insert_string(
            &mut identification,
            "eccnClassification",
            classifications.export_control_class_number.as_deref(),
        );
    }

    let mut commercial = Map::new();
    commercial.insert("lifecycleStatus".to_owned(), json!(stage_name(stage)));
    if let Some(date) = last_time_buy_date {
        commercial.insert("lastTimeBuyDate".to_owned(), json!(date.to_string()));
    }
    if let Some(lead_time) = product
        .manufacturer_lead_weeks
        .as_deref()
        .and_then(parse_first_number)
    {
        commercial.insert("leadTimeWeeks".to_owned(), json!(lead_time));
    }
    insert_i64(
        &mut commercial,
        "manufacturerStockQuantity",
        product.manufacturer_public_quantity,
    );
    commercial.insert(
        "normallyStocking".to_owned(),
        json!(product.normally_stocking),
    );
    commercial.insert(
        "backOrderAllowed".to_owned(),
        json!(!product.back_order_not_allowed),
    );
    commercial.insert(
        "nonCancellableNonReturnable".to_owned(),
        json!(product.ncnr),
    );
    insert_string(
        &mut commercial,
        "shippingInfo",
        product.shipping_info.as_deref(),
    );
    insert_i64(
        &mut commercial,
        "minimumOrderQuantity",
        minimum_variation_value(&product.product_variations, |variation| {
            variation.minimum_order_quantity
        }),
    );
    insert_i64(
        &mut commercial,
        "standardPackQuantity",
        minimum_variation_value(&product.product_variations, |variation| {
            variation.standard_package
        }),
    );
    let price_breaks = collect_price_breaks(product, currency);
    if !price_breaks.is_empty() {
        commercial.insert("priceBreaks".to_owned(), Value::Array(price_breaks));
    }
    let distributors = distributor_records(product);
    if !distributors.is_empty() {
        commercial.insert("distributors".to_owned(), Value::Array(distributors));
    }
    if !product.other_names.is_empty() {
        commercial.insert("alternateSources".to_owned(), json!(product.other_names));
    }

    let mut documentation = Map::new();
    insert_string(
        &mut documentation,
        "datasheetUrl",
        product.datasheet_url.as_deref(),
    );
    insert_string(
        &mut documentation,
        "productPageUrl",
        product.product_url.as_deref(),
    );
    insert_string(&mut documentation, "imageUrl", product.photo_url.as_deref());
    insert_string(
        &mut documentation,
        "videoUrl",
        product.primary_video_url.as_deref(),
    );

    let mut environmental = Map::new();
    let mut regulatory = Map::new();
    let mut material = Map::new();
    if let Some(classifications) = &product.classifications {
        if let Some(compliant) = classifications
            .rohs_status
            .as_deref()
            .and_then(rohs_compliant)
        {
            environmental.insert("rohsCompliant".to_owned(), json!(compliant));
        }
        if let Some(compliant) = classifications
            .reach_status
            .as_deref()
            .and_then(reach_compliant)
        {
            environmental.insert("reachCompliant".to_owned(), json!(compliant));
        }
        insert_string(
            &mut material,
            "moistureSensitivityLevel",
            classifications.moisture_sensitivity_level.as_deref(),
        );
        insert_string(
            &mut regulatory,
            "eccn",
            classifications.export_control_class_number.as_deref(),
        );
        insert_string(
            &mut regulatory,
            "htsCode",
            classifications.htsus_code.as_deref(),
        );
    }

    let mut electrical = Map::new();
    if !product.parameters.is_empty() {
        electrical.insert(
            "additionalProperties".to_owned(),
            Value::Array(product.parameters.iter().map(parameter_property).collect()),
        );
    }
    if let Some(pin_count) =
        parameter_value(product, &["Number of Pins", "Pin Count"]).and_then(parse_first_integer)
    {
        electrical.insert("pinCount".to_owned(), json!(pin_count));
    }
    insert_string(
        &mut electrical,
        "dielectricType",
        parameter_value(product, &["Dielectric Material", "Dielectric"]),
    );
    insert_string(
        &mut electrical,
        "logicFamily",
        parameter_value(product, &["Logic Type", "Logic Family"]),
    );
    for (field, names) in [
        ("voltageRating", &["Voltage - Rated", "Voltage Rating"][..]),
        (
            "currentRating",
            &[
                "Current Rating (Amps)",
                "Current - Output (Max)",
                "Current - Collector (Ic) (Max)",
            ][..],
        ),
        ("powerRating", &["Power (Watts)", "Power - Max"][..]),
        ("resistance", &["Resistance"][..]),
        ("capacitance", &["Capacitance"][..]),
        ("inductance", &["Inductance"][..]),
        ("impedance", &["Impedance"][..]),
        (
            "frequencyRange",
            &["Frequency", "Frequency - Operating", "Frequency Range"][..],
        ),
        ("tolerance", &["Tolerance"][..]),
        ("temperatureCoefficient", &["Temperature Coefficient"][..]),
        ("insulationResistance", &["Insulation Resistance"][..]),
    ] {
        if let Some(property) = parameter_cdd_property(product, names) {
            electrical.insert(field.to_owned(), property);
        }
    }

    let mut mechanical = Map::new();
    insert_string(
        &mut mechanical,
        "packageType",
        parameter_value(product, &["Package / Case", "Supplier Device Package"]),
    );
    if let Some(mounting) = parameter_value(product, &["Mounting Type"]).map(mounting_type) {
        mechanical.insert("mountingType".to_owned(), json!(mounting));
    }
    insert_string(
        &mut mechanical,
        "terminationStyle",
        parameter_value(product, &["Termination Style"]),
    );
    if let Some(height) = parameter_cdd_property(
        product,
        &["Height - Seated (Max)", "Height (Max)", "Height"],
    ) {
        mechanical.insert("dimensions".to_owned(), json!({ "height": height }));
    }

    let mut thermal = Map::new();
    if let Some(property) = parameter_cdd_property(product, &["Operating Temperature"]) {
        thermal.insert("operatingTemperatureRange".to_owned(), property);
    }

    let mut packaging = Map::new();
    let primary_variation = product.product_variations.first();
    if let Some(method) = primary_variation
        .and_then(|variation| variation.package_type.as_ref())
        .and_then(|package| packing_method(&package.name))
    {
        packaging.insert("packingMethod".to_owned(), json!(method));
    }
    insert_i64(
        &mut packaging,
        "quantityPerReel",
        primary_variation.and_then(|variation| variation.standard_package),
    );

    let mut root = Map::new();
    insert_section(&mut root, "identification", identification);
    insert_section(&mut root, "electrical", electrical);
    insert_section(&mut root, "mechanical", mechanical);
    insert_section(&mut root, "thermal", thermal);
    insert_section(&mut root, "material", material);
    insert_section(&mut root, "environmental", environmental);
    insert_section(&mut root, "regulatory", regulatory);
    insert_section(&mut root, "commercial", commercial);
    insert_section(&mut root, "packaging", packaging);
    insert_section(&mut root, "documentation", documentation);
    Value::Object(root)
}

fn collect_price_breaks(product: &Product, currency: &str) -> Vec<Value> {
    let mut prices = BTreeMap::<i64, f64>::new();
    if let Some(unit_price) = product.unit_price.filter(|value| value.is_finite()) {
        prices.insert(1, unit_price);
    }
    for variation in &product.product_variations {
        let pricing = if variation.my_pricing.is_empty() {
            &variation.standard_pricing
        } else {
            &variation.my_pricing
        };
        for price in pricing {
            if price.break_quantity > 0 && price.unit_price.is_finite() {
                prices
                    .entry(price.break_quantity)
                    .and_modify(|current| *current = current.min(price.unit_price))
                    .or_insert(price.unit_price);
            }
        }
    }
    prices
        .into_iter()
        .map(|(quantity, unit_price)| {
            json!({"quantity": quantity, "unitPrice": unit_price, "currency": currency})
        })
        .collect()
}

fn distributor_records(product: &Product) -> Vec<Value> {
    if product.product_variations.is_empty() {
        return product
            .product_url
            .as_ref()
            .map(|url| {
                vec![json!({
                    "name": "DigiKey",
                    "stockQuantity": product.quantity_available.unwrap_or_default(),
                    "url": url,
                })]
            })
            .unwrap_or_default();
    }
    product
        .product_variations
        .iter()
        .map(|variation| {
            let mut distributor = Map::new();
            distributor.insert("name".to_owned(), json!("DigiKey"));
            distributor.insert("sku".to_owned(), json!(variation.digi_key_product_number));
            insert_i64(
                &mut distributor,
                "stockQuantity",
                variation.quantity_availablefor_package_type,
            );
            insert_string(&mut distributor, "url", product.product_url.as_deref());
            insert_string(
                &mut distributor,
                "packageType",
                variation
                    .package_type
                    .as_ref()
                    .map(|package| package.name.as_str()),
            );
            insert_i64(
                &mut distributor,
                "minimumOrderQuantity",
                variation.minimum_order_quantity,
            );
            insert_i64(
                &mut distributor,
                "maximumOrderQuantity",
                variation.max_quantity_for_distribution,
            );
            insert_i64(
                &mut distributor,
                "standardPackQuantity",
                variation.standard_package,
            );
            if let Some(fee) = variation.digi_reel_fee.filter(|value| value.is_finite()) {
                distributor.insert("digiReelFee".to_owned(), json!(fee));
            }
            distributor.insert("marketplace".to_owned(), json!(variation.market_place));
            distributor.insert("tariffActive".to_owned(), json!(variation.tariff_active));
            insert_string(
                &mut distributor,
                "supplier",
                variation
                    .supplier
                    .as_ref()
                    .map(|supplier| supplier.name.as_str()),
            );
            Value::Object(distributor)
        })
        .collect()
}

fn parameter_property(parameter: &ParameterValue) -> Value {
    json!({
        "value": parameter.value_text,
        "dataType": parameter_data_type(&parameter.parameter_type),
        "definition": parameter.parameter_text,
        "source": "digikey",
    })
}

fn parameter_data_type(parameter_type: &str) -> &'static str {
    match parameter_type {
        "Integer" => "INTEGER_COUNT",
        "Double" | "UnitOfMeasure" | "CoupledUnitOfMeasure" => "REAL_MEASURE",
        "RangeUnitOfMeasure" => "RANGE",
        _ => "STRING",
    }
}

fn parameter_value<'a>(product: &'a Product, names: &[&str]) -> Option<&'a str> {
    product.parameters.iter().find_map(|parameter| {
        names
            .iter()
            .any(|name| parameter.parameter_text.eq_ignore_ascii_case(name))
            .then(|| non_empty(Some(&parameter.value_text)))
            .flatten()
    })
}

fn parameter_cdd_property(product: &Product, names: &[&str]) -> Option<Value> {
    product.parameters.iter().find_map(|parameter| {
        names
            .iter()
            .any(|name| parameter.parameter_text.eq_ignore_ascii_case(name))
            .then(|| parameter_property(parameter))
    })
}

fn minimum_variation_value(
    variations: &[ProductVariation],
    value: impl Fn(&ProductVariation) -> Option<i64>,
) -> Option<i64> {
    variations
        .iter()
        .filter_map(value)
        .filter(|value| *value > 0)
        .min()
}

fn parse_first_number(value: &str) -> Option<f64> {
    value
        .split(|character: char| !(character.is_ascii_digit() || character == '.'))
        .find(|part| !part.is_empty())
        .and_then(|part| part.parse().ok())
}

fn parse_first_integer(value: &str) -> Option<i64> {
    value
        .split(|character: char| !character.is_ascii_digit())
        .find(|part| !part.is_empty())
        .and_then(|part| part.parse().ok())
}

fn rohs_compliant(value: &str) -> Option<bool> {
    let value = value.to_ascii_lowercase();
    if value.contains("non-compliant") || value.contains("not compliant") {
        Some(false)
    } else if value.contains("compliant") {
        Some(true)
    } else {
        None
    }
}

fn reach_compliant(value: &str) -> Option<bool> {
    let value = value.to_ascii_lowercase();
    if value.contains("unaffected") || value.contains("compliant") {
        Some(true)
    } else if value.contains("affected") || value.contains("non-compliant") {
        Some(false)
    } else {
        None
    }
}

fn mounting_type(value: &str) -> &'static str {
    let value = value.to_ascii_lowercase();
    if value.contains("surface") {
        "SMT"
    } else if value.contains("through") {
        "THT"
    } else {
        "Other"
    }
}

fn packing_method(value: &str) -> Option<&'static str> {
    let value = value.to_ascii_lowercase();
    if value.contains("cut tape") {
        Some("Cut Tape")
    } else if value.contains("tape") && value.contains("reel") {
        Some("Tape and Reel")
    } else if value.contains("tube") {
        Some("Tube")
    } else if value.contains("tray") {
        Some("Tray")
    } else if value.contains("bulk") {
        Some("Bulk")
    } else if value.contains("bag") {
        Some("Bag")
    } else {
        None
    }
}

fn lifecycle_stage(
    product: &Product,
    last_time_buy_date: Option<NaiveDate>,
    today: NaiveDate,
) -> (LifecycleStage, f32) {
    let status = product
        .product_status
        .as_ref()
        .map(|value| value.status.trim().to_ascii_uppercase())
        .unwrap_or_default();
    if matches_status(&status, &["OBSOLETE", "DISCONTINUED"]) || product.end_of_life {
        if last_time_buy_date.is_some_and(|date| date >= today) {
            return (LifecycleStage::LastTimeBuy, 0.95);
        }
        return (LifecycleStage::Obsolete, 0.95);
    }
    if matches_status(
        &status,
        &["LAST TIME BUY", "LAST-TIME BUY", "END OF LIFE", "EOL"],
    ) || last_time_buy_date.is_some_and(|date| date >= today)
    {
        return (LifecycleStage::LastTimeBuy, 0.9);
    }
    if matches_status(
        &status,
        &[
            "NRND",
            "NOT RECOMMENDED FOR NEW DESIGNS",
            "NOT FOR NEW DESIGNS",
        ],
    ) {
        return (LifecycleStage::Nrnd, 0.9);
    }
    if status == "ACTIVE" {
        return (LifecycleStage::Active, 0.9);
    }
    if product.discontinued {
        return (LifecycleStage::Obsolete, 0.75);
    }
    (LifecycleStage::Unknown, 0.4)
}

fn stage_name(stage: LifecycleStage) -> &'static str {
    match stage {
        LifecycleStage::Active => "Active",
        LifecycleStage::Nrnd => "NRND",
        LifecycleStage::LastTimeBuy => "EOL",
        LifecycleStage::Obsolete => "Obsolete",
        LifecycleStage::Unknown => "Unknown",
    }
}

fn matches_status(status: &str, candidates: &[&str]) -> bool {
    candidates.contains(&status)
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn insert_string(map: &mut Map<String, Value>, key: &str, value: Option<&str>) {
    if let Some(value) = non_empty(value) {
        map.insert(key.to_owned(), json!(value));
    }
}

fn insert_i64(map: &mut Map<String, Value>, key: &str, value: Option<i64>) {
    if let Some(value) = value {
        map.insert(key.to_owned(), json!(value));
    }
}

fn insert_section(root: &mut Map<String, Value>, key: &str, section: Map<String, Value>) {
    if !section.is_empty() {
        root.insert(key.to_owned(), Value::Object(section));
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use partpilot_engine::{LifecycleStage, NormalizedMpn, SourceId};
    use serde_json::json;

    use super::to_part_snapshot;
    use crate::client::{
        Category, Classifications, Description, Manufacturer, NamedValue, ParameterValue,
        PriceBreak, Product, ProductDetailsResponse, ProductStatus, ProductVariation, SearchLocale,
    };

    fn product(status: &str) -> Product {
        Product {
            manufacturer: Manufacturer {
                name: "Texas Instruments".to_owned(),
            },
            manufacturer_product_number: "LM358DR".to_owned(),
            product_url: Some("https://www.digikey.com/example".to_owned()),
            product_status: Some(ProductStatus {
                status: status.to_owned(),
            }),
            ..Product::default()
        }
    }

    fn map(product: Product) -> partpilot_engine::PartSnapshot {
        to_part_snapshot(
            &ProductDetailsResponse {
                search_locale_used: Some(SearchLocale {
                    currency: Some("INR".to_owned()),
                }),
                product,
            },
            &NormalizedMpn("LM358DR".to_owned()),
            SourceId(7),
            "USD",
        )
    }

    #[test]
    fn maps_known_product_statuses() {
        assert_eq!(
            map(product("Active")).lifecycle_status.stage,
            LifecycleStage::Active
        );
        assert_eq!(
            map(product("Not Recommended For New Designs"))
                .lifecycle_status
                .stage,
            LifecycleStage::Nrnd
        );
        assert_eq!(
            map(product("Obsolete")).lifecycle_status.stage,
            LifecycleStage::Obsolete
        );
    }

    #[test]
    fn upcoming_last_buy_date_takes_precedence_over_eol() {
        let mut product = product("Obsolete");
        product.end_of_life = true;
        product.date_last_buy_chance = Some(Utc::now() + Duration::days(30));
        let snapshot = map(product);
        assert_eq!(snapshot.lifecycle_status.stage, LifecycleStage::LastTimeBuy);
        assert!(snapshot.lifecycle_status.last_time_buy_date.is_some());
    }

    #[test]
    fn maps_product_details_to_database_columns_and_cdd_metadata() {
        let mut product = product("Active");
        product.description = Some(Description {
            product_description: Some("Op amp".to_owned()),
            detailed_description: Some("Dual low-power operational amplifier".to_owned()),
        });
        product.category = Some(Category {
            name: "Linear - Amplifiers".to_owned(),
        });
        product.unit_price = Some(12.5);
        product.datasheet_url = Some("https://example.com/lm358.pdf".to_owned());
        product.manufacturer_lead_weeks = Some("8 weeks".to_owned());
        product.series = Some(NamedValue {
            name: "LM358".to_owned(),
        });
        product.parameters = vec![
            ParameterValue {
                parameter_text: "Mounting Type".to_owned(),
                parameter_type: "String".to_owned(),
                value_text: "Surface Mount".to_owned(),
            },
            ParameterValue {
                parameter_text: "Number of Pins".to_owned(),
                parameter_type: "Integer".to_owned(),
                value_text: "8".to_owned(),
            },
            ParameterValue {
                parameter_text: "Package / Case".to_owned(),
                parameter_type: "String".to_owned(),
                value_text: "SOIC-8".to_owned(),
            },
            ParameterValue {
                parameter_text: "Voltage - Rated".to_owned(),
                parameter_type: "UnitOfMeasure".to_owned(),
                value_text: "36 V".to_owned(),
            },
            ParameterValue {
                parameter_text: "Operating Temperature".to_owned(),
                parameter_type: "RangeUnitOfMeasure".to_owned(),
                value_text: "-40°C ~ 125°C".to_owned(),
            },
            ParameterValue {
                parameter_text: "Height - Seated (Max)".to_owned(),
                parameter_type: "UnitOfMeasure".to_owned(),
                value_text: "1.75 mm".to_owned(),
            },
        ];
        product.classifications = Some(Classifications {
            rohs_status: Some("RoHS3 Compliant".to_owned()),
            reach_status: Some("REACH Unaffected".to_owned()),
            moisture_sensitivity_level: Some("MSL 1".to_owned()),
            export_control_class_number: Some("EAR99".to_owned()),
            htsus_code: Some("8542.33.0001".to_owned()),
        });
        product.product_variations = vec![ProductVariation {
            digi_key_product_number: "296-LM358DRCT-ND".to_owned(),
            package_type: Some(NamedValue {
                name: "Cut Tape (CT)".to_owned(),
            }),
            standard_pricing: vec![PriceBreak {
                break_quantity: 10,
                unit_price: 10.0,
            }],
            quantity_availablefor_package_type: Some(2500),
            minimum_order_quantity: Some(1),
            standard_package: Some(2500),
            ..ProductVariation::default()
        }];

        let snapshot = map(product);
        assert_eq!(
            snapshot.part.description.as_deref(),
            Some("Dual low-power operational amplifier")
        );
        assert_eq!(
            snapshot.part.category.as_deref(),
            Some("Linear - Amplifiers")
        );
        assert_eq!(
            snapshot.part.component_metadata["commercial"]["priceBreaks"],
            json!([
                {"quantity": 1, "unitPrice": 12.5, "currency": "INR"},
                {"quantity": 10, "unitPrice": 10.0, "currency": "INR"}
            ])
        );
        assert_eq!(
            snapshot.part.component_metadata["commercial"]["distributors"][0]["sku"],
            "296-LM358DRCT-ND"
        );
        assert_eq!(
            snapshot.part.component_metadata["environmental"]["rohsCompliant"],
            true
        );
        assert_eq!(
            snapshot.part.component_metadata["mechanical"]["packageType"],
            "SOIC-8"
        );
        assert_eq!(
            snapshot.part.component_metadata["electrical"]["pinCount"],
            8
        );
        assert_eq!(
            snapshot.part.component_metadata["electrical"]["voltageRating"]["value"],
            "36 V"
        );
        assert_eq!(
            snapshot.part.component_metadata["thermal"]["operatingTemperatureRange"]["dataType"],
            "RANGE"
        );
        assert_eq!(
            snapshot.part.component_metadata["mechanical"]["dimensions"]["height"]["value"],
            "1.75 mm"
        );
        assert_eq!(snapshot.part.id, snapshot.lifecycle_status.part_id);
    }

    #[test]
    fn creates_a_stable_part_id() {
        let first = map(product("Active"));
        let second = map(product("Active"));
        assert_eq!(first.part.id, second.part.id);
    }
}
