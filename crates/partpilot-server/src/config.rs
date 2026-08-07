use std::net::{IpAddr, Ipv4Addr, SocketAddr};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub host: IpAddr,
    pub port: u16,
    pub database_url: String,
    pub supabase_jwks_url: String,
    pub db_max_connections: u32,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let host = std::env::var("HOST")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));
        let port = std::env::var("PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(8080);
        let database_url = required_env("DATABASE_URL")?;
        let supabase_jwks_url = required_env("SUPABASE_JWKS_URL")?;
        let db_max_connections = std::env::var("DB_MAX_CONNECTIONS")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(10);

        Ok(Self {
            host,
            port,
            database_url,
            supabase_jwks_url,
            db_max_connections,
        })
    }

    pub const fn socket_addr(&self) -> SocketAddr {
        SocketAddr::new(self.host, self.port)
    }
}

fn required_env(name: &str) -> anyhow::Result<String> {
    std::env::var(name).map_err(|_| anyhow::anyhow!("missing required environment variable {name}"))
}
