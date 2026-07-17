use axum::{
    extract::Request,
    http::{header::AUTHORIZATION, HeaderName},
    middleware::Next,
    response::Response,
};

pub const API_KEY_HEADER: HeaderName = HeaderName::from_static("x-api-key");

pub async fn placeholder_supabase_session(req: Request, next: Next) -> Response {
    let _authorization = req.headers().get(AUTHORIZATION);
    next.run(req).await
}

pub async fn placeholder_api_key(req: Request, next: Next) -> Response {
    let _api_key = req.headers().get(&API_KEY_HEADER);
    next.run(req).await
}
