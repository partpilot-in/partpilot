use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use anyhow::Context;
use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use reqwest::Client;
use rss::Channel;
use serde::{Deserialize, Serialize};
use tokio::{net::TcpListener, task::JoinSet};
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn};

const RSS_ENV_KEYS: &[&str] = &[
    "RSS_FEED_URLS",
    "PARTPILOT_FEED_RSS_URLS",
    "FEED_RSS_URLS",
    "RSS_URLS",
    "NEWS_RSS_LINKS",
];

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let config = Config::from_env()?;
    let addr = config.socket_addr();
    let state = AppState::new(config.rss_urls);
    let cors_layer = cors_layer(config.cors_allowed_origins)?;
    let listener = TcpListener::bind(addr).await?;

    info!(%addr, "feed listening");

    axum::serve(listener, router(state, cors_layer))
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn router(state: AppState, cors_layer: CorsLayer) -> Router {
    Router::new()
        .route("/", get(feed))
        .route("/feed", get(feed))
        .route("/health", get(health))
        .with_state(state)
        .layer(cors_layer)
}

fn cors_layer(allowed_origins: Vec<String>) -> anyhow::Result<CorsLayer> {
    let layer = CorsLayer::new()
        .allow_methods([Method::GET, Method::OPTIONS])
        .allow_headers([header::ACCEPT, header::CONTENT_TYPE]);

    if allowed_origins.iter().any(|origin| origin == "*") {
        return Ok(layer.allow_origin(Any));
    }

    let origins = allowed_origins
        .iter()
        .map(|origin| {
            origin
                .parse::<HeaderValue>()
                .with_context(|| format!("invalid CORS origin {origin}"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    Ok(layer.allow_origin(origins))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

async fn feed(State(state): State<AppState>, Query(query): Query<FeedQuery>) -> Response {
    match fetch_latest_feed(&state, query.limit()).await {
        Ok(feed) => Json(feed).into_response(),
        Err(error) => {
            warn!(%error, "failed to build feed");
            (
                StatusCode::BAD_GATEWAY,
                Json(ErrorResponse {
                    error: error.to_string(),
                }),
            )
                .into_response()
        }
    }
}

async fn fetch_latest_feed(state: &AppState, limit: usize) -> anyhow::Result<FeedResponse> {
    let mut items = Vec::new();
    let mut sources = Vec::new();
    let mut fetches = JoinSet::new();

    for url in state.rss_urls.iter() {
        let client = state.client.clone();
        let url = url.clone();
        fetches.spawn(async move {
            let result = fetch_source(&client, &url).await;
            (url, result)
        });
    }

    while let Some(result) = fetches.join_next().await {
        let (url, result) = result.context("RSS fetch task failed")?;

        match result {
            Ok(source) => {
                let item_count = source.items.len();
                items.extend(source.items);
                sources.push(SourceStatus {
                    url,
                    title: source.title,
                    item_count,
                    error: None,
                });
            }
            Err(error) => {
                warn!(%url, %error, "failed to fetch RSS source");
                sources.push(SourceStatus {
                    url,
                    title: None,
                    item_count: 0,
                    error: Some(error.to_string()),
                });
            }
        }
    }

    items.sort_by(|left, right| {
        right
            .published_at
            .cmp(&left.published_at)
            .then_with(|| right.title.cmp(&left.title))
    });
    items.truncate(limit);

    let failed_sources = sources
        .iter()
        .filter(|source| source.error.is_some())
        .count();

    if items.is_empty() && failed_sources == sources.len() {
        anyhow::bail!("all RSS sources failed");
    }

    Ok(FeedResponse {
        count: items.len(),
        limit,
        source_count: sources.len(),
        failed_sources,
        sources,
        items,
    })
}

async fn fetch_source(client: &Client, url: &str) -> anyhow::Result<FetchedSource> {
    let bytes = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("request failed for {url}"))?
        .error_for_status()
        .with_context(|| format!("non-success status for {url}"))?
        .bytes()
        .await
        .with_context(|| format!("failed to read body for {url}"))?;

    let channel =
        Channel::read_from(&bytes[..]).with_context(|| format!("failed to parse RSS for {url}"))?;
    let source_title = non_empty(channel.title()).map(str::to_owned);
    let source_link = non_empty(channel.link()).map(str::to_owned);

    let items = channel
        .items()
        .iter()
        .filter_map(|item| {
            let title = non_empty_option(item.title())?;
            let link = non_empty_option(item.link()).map(str::to_owned);
            let description = non_empty_option(item.description()).map(str::to_owned);
            let published_at = item.pub_date().and_then(parse_rss_date);

            Some(FeedItem {
                title: title.to_owned(),
                link,
                description,
                published_at,
                source_title: source_title.clone(),
                source_url: source_link.clone().unwrap_or_else(|| url.to_owned()),
                feed_url: url.to_owned(),
            })
        })
        .collect();

    Ok(FetchedSource {
        title: source_title,
        items,
    })
}

fn parse_rss_date(value: &str) -> Option<DateTime<Utc>> {
    let value = value.trim();
    if let Ok(date) = DateTime::parse_from_rfc2822(value) {
        return Some(date.with_timezone(&Utc));
    }
    if let Ok(date) = DateTime::parse_from_rfc3339(value) {
        return Some(date.with_timezone(&Utc));
    }
    for fmt in &[
        "%-m/%-d/%Y %-I:%M:%S %p",
        "%m/%d/%Y %I:%M:%S %p",
        "%-m/%-d/%Y %-H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(value, fmt) {
            return Some(naive.and_utc());
        }
    }
    None
}

fn non_empty(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}

fn non_empty_option(value: Option<&str>) -> Option<&str> {
    value.and_then(non_empty)
}

fn split_rss_urls(value: &str) -> Vec<String> {
    split_values(value)
}

fn split_values(value: &str) -> Vec<String> {
    value
        .split(|character: char| character == ',' || character == '\n' || character == ';')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

fn optional_env_any(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        std::env::var(key)
            .ok()
            .filter(|value| !value.trim().is_empty())
    })
}

fn example_env_any(keys: &[&str]) -> Option<String> {
    let entries = dotenvy::from_filename_iter(".env.example").ok()?;

    for entry in entries.flatten() {
        if keys.contains(&entry.0.as_str()) && !entry.1.trim().is_empty() {
            return Some(entry.1);
        }
    }

    None
}

fn init_tracing() {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "partpilot_feed=info,tower_http=info".into());

    tracing_subscriber::fmt().with_env_filter(env_filter).init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[derive(Debug, Clone)]
struct AppState {
    client: Client,
    rss_urls: Arc<[String]>,
}

impl AppState {
    fn new(rss_urls: Vec<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("feed/0.1")
            .build()
            .expect("valid reqwest client");

        Self {
            client,
            rss_urls: Arc::from(rss_urls),
        }
    }
}

#[derive(Debug, Clone)]
struct Config {
    host: IpAddr,
    port: u16,
    rss_urls: Vec<String>,
    cors_allowed_origins: Vec<String>,
}

impl Config {
    fn from_env() -> anyhow::Result<Self> {
        let host = optional_env_any(&["FEED_HOST", "HOST"])
            .and_then(|value| value.parse().ok())
            .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));
        let port = optional_env_any(&["FEED_PORT", "PORT"])
            .and_then(|value| value.parse().ok())
            .unwrap_or(8090);
        let rss_urls = optional_env_any(RSS_ENV_KEYS)
            .or_else(|| example_env_any(RSS_ENV_KEYS))
            .map(|value| split_rss_urls(&value))
            .filter(|urls| !urls.is_empty())
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "missing RSS links in environment or .env.example ({})",
                    RSS_ENV_KEYS.join(" or ")
                )
            })?;
        let cors_allowed_origins =
            optional_env_any(&["FEED_CORS_ALLOWED_ORIGINS", "CORS_ALLOWED_ORIGINS"])
                .or_else(|| example_env_any(&["FEED_CORS_ALLOWED_ORIGINS", "CORS_ALLOWED_ORIGINS"]))
                .map(|value| split_values(&value))
                .filter(|origins| !origins.is_empty())
                .unwrap_or_else(|| vec!["https://app.bestpartpilot.com".to_owned()]);

        Ok(Self {
            host,
            port,
            rss_urls,
            cors_allowed_origins,
        })
    }

    const fn socket_addr(&self) -> SocketAddr {
        SocketAddr::new(self.host, self.port)
    }
}

#[derive(Debug, Deserialize)]
struct FeedQuery {
    limit: Option<usize>,
    results: Option<usize>,
}

impl FeedQuery {
    fn limit(&self) -> usize {
        self.limit.or(self.results).unwrap_or(20).clamp(1, 100)
    }
}

#[derive(Debug)]
struct FetchedSource {
    title: Option<String>,
    items: Vec<FeedItem>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
}

#[derive(Debug, Serialize)]
struct FeedResponse {
    count: usize,
    limit: usize,
    source_count: usize,
    failed_sources: usize,
    sources: Vec<SourceStatus>,
    items: Vec<FeedItem>,
}

#[derive(Debug, Serialize)]
struct SourceStatus {
    url: String,
    title: Option<String>,
    item_count: usize,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct FeedItem {
    title: String,
    link: Option<String>,
    description: Option<String>,
    published_at: Option<DateTime<Utc>>,
    source_title: Option<String>,
    source_url: String,
    feed_url: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    #[test]
    fn splits_multiple_url_formats() {
        assert_eq!(
            split_rss_urls("https://a.test/rss, https://b.test/rss\nhttps://c.test/rss"),
            vec![
                "https://a.test/rss",
                "https://b.test/rss",
                "https://c.test/rss"
            ]
        );
    }

    #[test]
    fn parses_common_feed_dates() {
        assert_eq!(
            parse_rss_date("Tue, 10 Jun 2003 04:00:00 GMT")
                .unwrap()
                .with_timezone(&FixedOffset::east_opt(0).unwrap())
                .to_rfc3339(),
            "2003-06-10T04:00:00+00:00"
        );

        assert_eq!(
            parse_rss_date("2003-06-10T04:00:00Z")
                .unwrap()
                .with_timezone(&FixedOffset::east_opt(0).unwrap())
                .to_rfc3339(),
            "2003-06-10T04:00:00+00:00"
        );

        assert_eq!(
            parse_rss_date("7/24/2026 3:50:29 AM")
                .unwrap()
                .with_timezone(&FixedOffset::east_opt(0).unwrap())
                .to_rfc3339(),
            "2026-07-24T03:50:29+00:00"
        );
    }

    #[test]
    fn clamps_query_limit() {
        assert_eq!(
            FeedQuery {
                limit: None,
                results: None
            }
            .limit(),
            20
        );
        assert_eq!(
            FeedQuery {
                limit: Some(0),
                results: None
            }
            .limit(),
            1
        );
        assert_eq!(
            FeedQuery {
                limit: Some(500),
                results: None
            }
            .limit(),
            100
        );
    }
}
