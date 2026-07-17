use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use partpilot_server::router;
use tower::ServiceExt;

#[tokio::test]
async fn planned_routes_return_ok() {
    let cases = [
        (Method::GET, "/healthz"),
        (Method::GET, "/v1/parts/search?q=lm317"),
        (Method::GET, "/v1/parts/8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f"),
        (
            Method::GET,
            "/v1/parts/8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f/history",
        ),
        (
            Method::GET,
            "/v1/parts/8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f/alternates",
        ),
        (
            Method::GET,
            "/v1/parts/8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f/insights",
        ),
        (Method::GET, "/v1/parts/compare?ids=a,b"),
        (Method::POST, "/v1/boms"),
        (Method::GET, "/v1/boms/d4e5f6a7-0000-4000-8000-000000000000"),
        (
            Method::GET,
            "/v1/boms/d4e5f6a7-0000-4000-8000-000000000000/compare?with=e5f6a7b8-0000-4000-8000-000000000000",
        ),
        (Method::GET, "/v1/watchlist"),
        (Method::POST, "/v1/watchlist"),
        (
            Method::DELETE,
            "/v1/watchlist/8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f",
        ),
        (Method::GET, "/v1/kicad/lookup?mpn=LM317T"),
    ];

    for (method, uri) in cases {
        let response = router()
            .oneshot(
                Request::builder()
                    .method(method.clone())
                    .uri(uri)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK, "{method} {uri}");
        assert!(
            response.headers().contains_key("x-request-id"),
            "{method} {uri} missing x-request-id",
        );
    }
}
