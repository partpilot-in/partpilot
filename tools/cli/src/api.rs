use anyhow::{Context, Result, bail};
use reqwest::{Url, blocking::Client};
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Clone, Debug, Deserialize)]
pub struct Part {
    pub mpn: String,
    pub manufacturer: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub score: Option<i32>,
    #[serde(default)]
    pub component_metadata: Value,
}

#[derive(Deserialize)]
struct Search {
    data: Vec<Part>,
}

pub struct Api {
    client: Client,
    search_url: Url,
}
impl Api {
    pub fn new(base: &str, timeout: u64) -> Result<Self> {
        let base = Url::parse(base).context("Invalid API URL")?;
        if !matches!(base.scheme(), "http" | "https") || base.host_str().is_none() {
            bail!("API URL must use http or https");
        }
        Ok(Self {
            client: Client::builder()
                .timeout(Duration::from_secs(timeout))
                .connect_timeout(Duration::from_secs(10))
                .user_agent(concat!("partpilot/", env!("CARGO_PKG_VERSION")))
                .build()?,
            search_url: base.join("/v1/parts/search")?,
        })
    }
    pub fn search(&self, query: &str, manufacturer: &str, limit: usize) -> Result<Vec<Part>> {
        let mut params = vec![("q", query.to_owned()), ("limit", limit.to_string())];
        if !manufacturer.is_empty() {
            params.push(("manufacturer", manufacturer.into()));
        }
        let response = self
            .client
            .get(self.search_url.clone())
            .query(&params)
            .send()
            .context("Could not reach PartPilot API")?;
        let status = response.status();
        if !status.is_success() {
            bail!("PartPilot API returned HTTP {status}");
        }
        Ok(response
            .json::<Search>()
            .context("Invalid part search response")?
            .data)
    }
}

pub fn normalized(value: &str) -> String {
    value
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

pub fn matches(part: &Part, query: &str) -> bool {
    let query = normalized(query);
    if query.is_empty() {
        return false;
    }
    normalized(&part.mpn) == query
        || part
            .component_metadata
            .pointer("/identification/alternatePartNumbers")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .any(|v| normalized(v) == query)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_exact_or_alias_but_not_prefix() {
        let part: Part = serde_json::from_value(serde_json::json!({"mpn":"AMS1117-3.3", "manufacturer":"AMS", "component_metadata":{"identification":{"alternatePartNumbers":["OLD-123"]}}})).unwrap();
        assert!(matches(&part, "ams1117-3.3"));
        assert!(matches(&part, "OLD123"));
        assert!(!matches(&part, "ams1117"));
        assert!(!matches(&part, "---"));
    }
}
