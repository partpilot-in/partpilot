use std::time::Duration;

use engine::ports::data_source::ConnectorError;
use reqwest::{StatusCode, header::RETRY_AFTER};
use serde::Deserialize;

use crate::{DigikeyConfig, auth::DigikeyAuth};

#[derive(Debug)]
pub(crate) struct DigikeyClient {
    http: reqwest::Client,
    auth: DigikeyAuth,
    client_id: String,
    account_id: String,
    api_base_url: reqwest::Url,
    locale_site: String,
    locale_language: String,
    locale_currency: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct ProductDetailsResponse {
    #[serde(default)]
    pub(crate) search_locale_used: Option<SearchLocale>,
    pub(crate) product: Product,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct Product {
    #[serde(default)]
    pub(crate) description: Option<Description>,
    pub(crate) manufacturer: Manufacturer,
    pub(crate) manufacturer_product_number: String,
    #[serde(default)]
    pub(crate) unit_price: Option<f64>,
    #[serde(default)]
    pub(crate) product_url: Option<String>,
    #[serde(default)]
    pub(crate) datasheet_url: Option<String>,
    #[serde(default)]
    pub(crate) photo_url: Option<String>,
    #[serde(default)]
    pub(crate) primary_video_url: Option<String>,
    #[serde(default)]
    pub(crate) product_variations: Vec<ProductVariation>,
    #[serde(default)]
    pub(crate) quantity_available: Option<i64>,
    #[serde(default)]
    pub(crate) product_status: Option<ProductStatus>,
    #[serde(default)]
    pub(crate) discontinued: bool,
    #[serde(default)]
    pub(crate) end_of_life: bool,
    #[serde(default)]
    pub(crate) back_order_not_allowed: bool,
    #[serde(default)]
    pub(crate) normally_stocking: bool,
    #[serde(default)]
    pub(crate) ncnr: bool,
    #[serde(default)]
    pub(crate) parameters: Vec<ParameterValue>,
    #[serde(default)]
    pub(crate) category: Option<Category>,
    #[serde(default)]
    pub(crate) date_last_buy_chance: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    pub(crate) manufacturer_lead_weeks: Option<String>,
    #[serde(default)]
    pub(crate) manufacturer_public_quantity: Option<i64>,
    #[serde(default)]
    pub(crate) series: Option<NamedValue>,
    #[serde(default)]
    pub(crate) base_product_number: Option<NamedValue>,
    #[serde(default)]
    pub(crate) shipping_info: Option<String>,
    #[serde(default)]
    pub(crate) classifications: Option<Classifications>,
    #[serde(default)]
    pub(crate) other_names: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct SearchLocale {
    #[serde(default)]
    pub(crate) currency: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct Description {
    #[serde(default)]
    pub(crate) product_description: Option<String>,
    #[serde(default)]
    pub(crate) detailed_description: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct Manufacturer {
    pub(crate) name: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct ProductStatus {
    #[serde(default)]
    pub(crate) status: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct ProductVariation {
    pub(crate) digi_key_product_number: String,
    #[serde(default)]
    pub(crate) package_type: Option<NamedValue>,
    #[serde(default)]
    pub(crate) standard_pricing: Vec<PriceBreak>,
    #[serde(default)]
    pub(crate) my_pricing: Vec<PriceBreak>,
    #[serde(default)]
    pub(crate) market_place: bool,
    #[serde(default)]
    pub(crate) tariff_active: bool,
    #[serde(default)]
    pub(crate) supplier: Option<NamedValue>,
    #[serde(default)]
    pub(crate) quantity_availablefor_package_type: Option<i64>,
    #[serde(default)]
    pub(crate) max_quantity_for_distribution: Option<i64>,
    #[serde(default)]
    pub(crate) minimum_order_quantity: Option<i64>,
    #[serde(default)]
    pub(crate) standard_package: Option<i64>,
    #[serde(default)]
    pub(crate) digi_reel_fee: Option<f64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct PriceBreak {
    pub(crate) break_quantity: i64,
    pub(crate) unit_price: f64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct NamedValue {
    #[serde(default)]
    pub(crate) name: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct Category {
    #[serde(default)]
    pub(crate) name: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct ParameterValue {
    #[serde(default)]
    pub(crate) parameter_text: String,
    #[serde(default)]
    pub(crate) parameter_type: String,
    #[serde(default)]
    pub(crate) value_text: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(crate) struct Classifications {
    #[serde(default)]
    pub(crate) reach_status: Option<String>,
    #[serde(default)]
    pub(crate) rohs_status: Option<String>,
    #[serde(default)]
    pub(crate) moisture_sensitivity_level: Option<String>,
    #[serde(default)]
    pub(crate) export_control_class_number: Option<String>,
    #[serde(default)]
    pub(crate) htsus_code: Option<String>,
}

impl DigikeyClient {
    pub(crate) fn new(config: &DigikeyConfig) -> Result<Self, ConnectorError> {
        let http = reqwest::Client::builder()
            .timeout(config.request_timeout)
            .build()
            .map_err(|error| ConnectorError::Unavailable(error.to_string()))?;
        let api_base_url = parse_url("DIGIKEY_API_BASE_URL", &config.api_base_url)?;
        let token_url = parse_url("DIGIKEY_TOKEN_URL", &config.token_url)?;
        let auth = DigikeyAuth::new(
            http.clone(),
            config.client_id.clone(),
            config.client_secret.clone(),
            token_url,
        );

        Ok(Self {
            http,
            auth,
            client_id: config.client_id.clone(),
            account_id: config.account_id.clone(),
            api_base_url,
            locale_site: config.locale_site.clone(),
            locale_language: config.locale_language.clone(),
            locale_currency: config.locale_currency.clone(),
        })
    }

    pub(crate) async fn product_details(
        &self,
        product_number: &str,
    ) -> Result<ProductDetailsResponse, ConnectorError> {
        let token = self.auth.access_token().await?;
        let response = self.send_product_details(product_number, &token).await?;

        if response.status() == StatusCode::UNAUTHORIZED {
            self.auth.invalidate().await;
            let token = self.auth.access_token().await?;
            let response = self.send_product_details(product_number, &token).await?;
            return decode_product_details(response).await;
        }

        decode_product_details(response).await
    }

    async fn send_product_details(
        &self,
        product_number: &str,
        access_token: &str,
    ) -> Result<reqwest::Response, ConnectorError> {
        let mut url = self.api_base_url.clone();
        {
            let mut segments = url.path_segments_mut().map_err(|_| {
                ConnectorError::Unavailable("DigiKey API base URL cannot be a base".to_owned())
            })?;
            segments.pop_if_empty();
            segments.extend(["products", "v4", "search", product_number, "productdetails"]);
        }

        self.http
            .get(url)
            .bearer_auth(access_token)
            .header("X-DIGIKEY-Client-Id", &self.client_id)
            .header("X-DIGIKEY-Account-Id", &self.account_id)
            .header("X-DIGIKEY-Locale-Site", &self.locale_site)
            .header("X-DIGIKEY-Locale-Language", &self.locale_language)
            .header("X-DIGIKEY-Locale-Currency", &self.locale_currency)
            .send()
            .await
            .map_err(|error| ConnectorError::Unavailable(error.to_string()))
    }
}

async fn decode_product_details(
    response: reqwest::Response,
) -> Result<ProductDetailsResponse, ConnectorError> {
    let status = response.status();
    if status.is_success() {
        return response
            .json()
            .await
            .map_err(|error| ConnectorError::Malformed(error.to_string()));
    }
    if status == StatusCode::NOT_FOUND {
        return Err(ConnectorError::NotFound);
    }
    if status == StatusCode::TOO_MANY_REQUESTS {
        let retry_after = response
            .headers()
            .get(RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .map(Duration::from_secs)
            .unwrap_or_else(|| Duration::from_secs(1));
        return Err(ConnectorError::RateLimited(retry_after));
    }

    let body = response.text().await.unwrap_or_default();
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err(ConnectorError::AuthFailed(format!(
            "DigiKey Product Details returned {status}: {}",
            summarize_body(&body)
        )));
    }
    if status.is_server_error() {
        return Err(ConnectorError::Unavailable(format!(
            "DigiKey Product Details returned {status}: {}",
            summarize_body(&body)
        )));
    }
    Err(ConnectorError::Malformed(format!(
        "DigiKey Product Details returned {status}: {}",
        summarize_body(&body)
    )))
}

fn parse_url(name: &str, value: &str) -> Result<reqwest::Url, ConnectorError> {
    reqwest::Url::parse(value)
        .map_err(|error| ConnectorError::Unavailable(format!("invalid {name}: {error}")))
}

fn summarize_body(body: &str) -> String {
    const MAX_CHARS: usize = 300;
    let mut summary: String = body.chars().take(MAX_CHARS).collect();
    if body.chars().count() > MAX_CHARS {
        summary.push('…');
    }
    if summary.trim().is_empty() {
        "no response body".to_owned()
    } else {
        summary
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::ProductDetailsResponse;

    #[test]
    fn deserializes_product_information_v4_property_names() {
        let details: ProductDetailsResponse = serde_json::from_value(json!({
            "SearchLocaleUsed": { "Site": "IN", "Language": "en", "Currency": "INR" },
            "Product": {
                "Description": {
                    "ProductDescription": "Op amp",
                    "DetailedDescription": "Dual operational amplifier"
                },
                "Manufacturer": { "Id": 296, "Name": "Texas Instruments" },
                "ManufacturerProductNumber": "LM358DR",
                "UnitPrice": 12.5,
                "ProductUrl": "https://www.digikey.in/example",
                "DatasheetUrl": "https://example.com/lm358.pdf",
                "PhotoUrl": "https://example.com/lm358.jpg",
                "PrimaryVideoUrl": "https://example.com/lm358.mp4",
                "QuantityAvailable": 2500,
                "ProductStatus": { "Id": 0, "Status": "Active" },
                "BackOrderNotAllowed": true,
                "NormallyStocking": true,
                "Discontinued": false,
                "EndOfLife": false,
                "Ncnr": true,
                "DateLastBuyChance": "2027-08-22T00:00:00Z",
                "ManufacturerLeadWeeks": "8 weeks",
                "ManufacturerPublicQuantity": 10000,
                "Parameters": [{
                    "ParameterId": 1,
                    "ParameterText": "Number of Pins",
                    "ParameterType": "Integer",
                    "ValueId": "8",
                    "ValueText": "8"
                }],
                "BaseProductNumber": { "Id": 1, "Name": "LM358" },
                "Category": { "CategoryId": 2, "Name": "Linear - Amplifiers" },
                "Series": { "Id": 3, "Name": "LM358" },
                "ShippingInfo": "Ships from DigiKey",
                "Classifications": {
                    "ReachStatus": "REACH Unaffected",
                    "RohsStatus": "RoHS3 Compliant",
                    "MoistureSensitivityLevel": "MSL 1",
                    "ExportControlClassNumber": "EAR99",
                    "HtsusCode": "8542.33.0001"
                },
                "OtherNames": ["LM358"],
                "ProductVariations": [{
                    "DigiKeyProductNumber": "296-LM358DRCT-ND",
                    "PackageType": { "Id": 1, "Name": "Cut Tape (CT)" },
                    "StandardPricing": [{
                        "BreakQuantity": 10,
                        "UnitPrice": 10.0,
                        "TotalPrice": 100.0
                    }],
                    "MyPricing": [],
                    "MarketPlace": false,
                    "TariffActive": true,
                    "Supplier": { "Id": 1, "Name": "DigiKey" },
                    "QuantityAvailableforPackageType": 2500,
                    "MaxQuantityForDistribution": 2000,
                    "MinimumOrderQuantity": 1,
                    "StandardPackage": 2500,
                    "DigiReelFee": 500.0
                }]
            }
        }))
        .expect("valid Product Information v4 payload");

        let product = details.product;
        assert_eq!(
            details
                .search_locale_used
                .and_then(|locale| locale.currency),
            Some("INR".to_owned())
        );
        assert_eq!(product.manufacturer.name, "Texas Instruments");
        assert_eq!(product.parameters[0].parameter_type, "Integer");
        assert_eq!(
            product
                .classifications
                .expect("classifications")
                .export_control_class_number
                .as_deref(),
            Some("EAR99")
        );
        let variation = &product.product_variations[0];
        assert_eq!(variation.quantity_availablefor_package_type, Some(2500));
        assert_eq!(variation.max_quantity_for_distribution, Some(2000));
        assert_eq!(variation.digi_reel_fee, Some(500.0));
    }
}
