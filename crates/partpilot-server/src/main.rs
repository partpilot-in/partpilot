use partpilot_server::{config::Config, router, telemetry};
use tokio::net::TcpListener;
use tracing::info;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    telemetry::init();

    let config = Config::from_env();
    let addr = config.socket_addr();
    let listener = TcpListener::bind(addr).await?;

    info!(%addr, "partpilot-server listening");

    axum::serve(listener, router())
        .with_graceful_shutdown(shutdown_signal())
        .await
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
