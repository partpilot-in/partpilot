use axum::{
    Router,
    http::{HeaderName, HeaderValue},
    middleware,
    response::Response,
    routing::{delete, get},
};
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};
use uuid::Uuid;

use crate::state::AppState;

pub mod boms;
pub mod health;
pub mod important_parts;
pub mod kicad;
pub mod my_parts;
pub mod part_notes;
pub mod parts;
pub mod settings;

const REQUEST_ID_HEADER: &str = "x-request-id";

pub fn router() -> Router {
    router_with_state(AppState::placeholder())
}

pub fn router_with_state(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health::healthz))
        .nest("/v1", v1_routes(state.clone()))
        .with_state(state)
        .layer(middleware::map_response(add_request_id))
        .layer(CompressionLayer::new())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

fn v1_routes(state: AppState) -> Router<AppState> {
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
                .route("/", get(boms::list).post(boms::create))
                .route(
                    "/:id",
                    get(boms::detail).patch(boms::update).delete(boms::remove),
                )
                .route("/:id/compare", get(boms::compare))
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    crate::auth::require_supabase_session,
                )),
        )
        .nest(
            "/my-parts",
            Router::new()
                .route("/", get(my_parts::list).post(my_parts::create))
                .route(
                    "/:id",
                    get(my_parts::detail)
                        .patch(my_parts::update)
                        .delete(my_parts::remove),
                )
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    crate::auth::require_supabase_session,
                )),
        )
        .nest(
            "/part-notes",
            Router::new()
                .route(
                    "/:part_id",
                    get(part_notes::detail).patch(part_notes::update),
                )
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    crate::auth::require_supabase_session,
                )),
        )
        .nest(
            "/settings",
            Router::new()
                .route(
                    "/profile",
                    get(settings::profile).patch(settings::update_profile),
                )
                .route(
                    "/reset-password",
                    axum::routing::post(settings::reset_password),
                )
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    crate::auth::require_supabase_session,
                )),
        )
        .nest(
            "/important-parts",
            Router::new()
                .route("/", get(important_parts::list).post(important_parts::add))
                .route("/:part_id", delete(important_parts::remove))
                .layer(middleware::from_fn_with_state(
                    state.clone(),
                    crate::auth::require_supabase_session,
                )),
        )
        .nest(
            "/watchlist",
            Router::new()
                .route("/", get(important_parts::list).post(important_parts::add))
                .route("/:part_id", delete(important_parts::remove))
                .layer(middleware::from_fn_with_state(
                    state,
                    crate::auth::require_supabase_session,
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
