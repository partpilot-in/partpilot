use axum::{
    http::{HeaderName, HeaderValue},
    middleware,
    response::Response,
    routing::{delete, get, post},
    Router,
};
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};
use uuid::Uuid;

use crate::state::AppState;

pub mod boms;
pub mod health;
pub mod kicad;
pub mod parts;
pub mod watchlist;

const REQUEST_ID_HEADER: &str = "x-request-id";

pub fn router() -> Router {
    Router::new()
        .route("/healthz", get(health::healthz))
        .nest("/v1", v1_routes())
        .with_state(AppState::placeholder())
        .layer(middleware::map_response(add_request_id))
        .layer(CompressionLayer::new())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

fn v1_routes() -> Router<AppState> {
    Router::new()
        .route("/parts/search", get(parts::search))
        .route("/parts/compare", get(parts::compare))
        .route("/parts/:id", get(parts::detail))
        .route("/parts/:id/history", get(parts::history))
        .route("/parts/:id/alternates", get(parts::alternates))
        .route("/parts/:id/insights", get(parts::insights))
        .nest(
            "/boms",
            Router::new()
                .route("/", post(boms::create))
                .route("/:id", get(boms::detail))
                .route("/:id/compare", get(boms::compare))
                .layer(middleware::from_fn(
                    crate::auth::placeholder_supabase_session,
                )),
        )
        .nest(
            "/watchlist",
            Router::new()
                .route("/", get(watchlist::list).post(watchlist::add))
                .route("/:part_id", delete(watchlist::remove))
                .layer(middleware::from_fn(
                    crate::auth::placeholder_supabase_session,
                )),
        )
        .nest(
            "/kicad",
            Router::new()
                .route("/lookup", get(kicad::lookup))
                .layer(middleware::from_fn(crate::auth::placeholder_api_key)),
        )
}

async fn add_request_id(mut response: Response) -> Response {
    let header_name = HeaderName::from_static(REQUEST_ID_HEADER);
    if !response.headers().contains_key(&header_name) {
        let request_id = Uuid::new_v4().to_string();
        if let Ok(value) = HeaderValue::from_str(&request_id) {
            response.headers_mut().insert(header_name, value);
        }
    }
    response
}
