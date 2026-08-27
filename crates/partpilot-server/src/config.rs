use std::net::{IpAddr, Ipv4Addr, SocketAddr};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub host: IpAddr,
    pub port: u16,
    pub database_url: String,
    pub supabase_url: String,
    pub supabase_publishable_key: String,
    pub supabase_jwks_url: String,
    pub db_max_connections: u32,
    pub digikey: Option<adapter_digikey::DigikeyConfig>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();
        let host = std::env::var("HOST")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));
        let port = std::env::var("PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(8080);
        let database_url = required_env_any(&["DATABASE_URL", "SUPABASE_DB_URL"])?;
        let configured_supabase_url = optional_env_any(&["SUPABASE_URL", "VITE_SUPABASE_URL"]);
        let supabase_jwks_url = std::env::var("SUPABASE_JWKS_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                configured_supabase_url.as_ref().map(|url| {
                    format!(
                        "{}/auth/v1/.well-known/jwks.json",
                        url.trim_end_matches('/')
                    )
                })
            })
            .ok_or_else(|| {
                anyhow::anyhow!("missing SUPABASE_JWKS_URL (or SUPABASE_URL/VITE_SUPABASE_URL)")
            })?;
        let supabase_url = configured_supabase_url
            .or_else(|| {
                supabase_jwks_url
                    .strip_suffix("/auth/v1/.well-known/jwks.json")
                    .map(str::to_owned)
            })
            .ok_or_else(|| anyhow::anyhow!("missing SUPABASE_URL or VITE_SUPABASE_URL"))?;
        let supabase_publishable_key =
            required_env_any(&["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"])?;
        let db_max_connections = std::env::var("DB_MAX_CONNECTIONS")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(10);
        let digikey = adapter_digikey::DigikeyConfig::from_env_optional()
            .map_err(|error| anyhow::anyhow!(error))?;

        Ok(Self {
            host,
            port,
            database_url,
            supabase_url,
            supabase_publishable_key,
            supabase_jwks_url,
            db_max_connections,
            digikey,
        })
    }

    pub const fn socket_addr(&self) -> SocketAddr {
        SocketAddr::new(self.host, self.port)
    }
}

fn optional_env_any(names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| {
        std::env::var(name)
            .ok()
            .filter(|value| !value.trim().is_empty())
    })
}

fn required_env_any(names: &[&str]) -> anyhow::Result<String> {
    optional_env_any(names).ok_or_else(|| {
        anyhow::anyhow!(
            "missing required environment variable ({})",
            names.join(" or ")
        )
    })
}
