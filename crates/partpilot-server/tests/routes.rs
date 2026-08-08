use axum::{
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode, header::CONTENT_TYPE},
};
use partpilot_server::router;
use serde_json::{Value, json};
use tower::ServiceExt;

const PART_ID: &str = "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f";

async fn send(method: Method, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let app = router();
    let mut builder = Request::builder().method(method.clone()).uri(uri);
    let request_body = if let Some(body) = body {
        builder = builder.header(CONTENT_TYPE, "application/json");
        Body::from(body.to_string())
    } else {
        Body::empty()
    };
    let response = app
        .oneshot(builder.body(request_body).unwrap())
        .await
        .unwrap();
    assert!(
        response.headers().contains_key("x-request-id"),
        "{method} {uri} missing x-request-id"
    );
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    (status, value)
}

#[tokio::test]
async fn public_and_legacy_routes_respond() {
    let cases = [
        (Method::GET, "/healthz".to_owned()),
        (Method::GET, "/v1/parts/search?q=lm317".to_owned()),
        (Method::GET, format!("/v1/parts/{PART_ID}")),
        (Method::GET, format!("/v1/parts/{PART_ID}/history")),
        (Method::GET, format!("/v1/parts/{PART_ID}/alternates")),
        (Method::GET, format!("/v1/parts/{PART_ID}/insights")),
        (Method::GET, format!("/v1/parts/compare?ids={PART_ID}")),
        (Method::GET, "/v1/important-parts".to_owned()),
        (Method::GET, "/v1/kicad/lookup?mpn=LM317T".to_owned()),
    ];
    for (method, uri) in cases {
        let (status, _) = send(method.clone(), &uri, None).await;
        assert_eq!(status, StatusCode::OK, "{method} {uri}");
    }
}

#[tokio::test]
async fn my_parts_support_full_crud() {
    let app = router();
    let create = json!({
        "mpn": "STM32F411CEU6", "manufacturer": "STMicroelectronics",
        "description": "ARM microcontroller", "category": "MCU", "total_qty": 3,
        "unit_price": 4.25, "country_of_origin": "FR"
    });
    let response = app
        .clone()
        .oneshot(json_request(Method::POST, "/v1/my-parts", create))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let created: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    let id = created["id"].as_str().unwrap();
    assert_eq!(created["score"], partpilot_engine::base_rating());

    let list = app
        .clone()
        .oneshot(empty_request(Method::GET, "/v1/my-parts"))
        .await
        .unwrap();
    assert_eq!(list.status(), StatusCode::OK);
    let listed: Value =
        serde_json::from_slice(&to_bytes(list.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(listed["data"].as_array().unwrap().len(), 1);

    let update = json!({
        "mpn": "STM32F411CEU6", "manufacturer": "STMicroelectronics",
        "description": "Updated MCU", "category": "MCU", "total_qty": 8,
        "unit_price": 4.10, "country_of_origin": "FR"
    });
    let updated = app
        .clone()
        .oneshot(json_request(
            Method::PATCH,
            &format!("/v1/my-parts/{id}"),
            update,
        ))
        .await
        .unwrap();
    assert_eq!(updated.status(), StatusCode::OK);

    let deleted = app
        .oneshot(empty_request(Method::DELETE, &format!("/v1/my-parts/{id}")))
        .await
        .unwrap();
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn projects_support_full_crud() {
    let app = router();
    let create = json!({ "name": "Controller v1", "lines": [{
        "mpn": "LM317T", "manufacturer": "Texas Instruments", "description": "Regulator",
        "category": "Regulator", "qty": 4, "unit_price": 0.42,
        "lifecycle_stage": "active"
    }]});
    let response = app
        .clone()
        .oneshot(json_request(Method::POST, "/v1/boms", create))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let created: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    let id = created["id"].as_str().unwrap();
    assert_eq!(
        created["lines"][0]["score"],
        partpilot_engine::base_rating()
    );

    let list = app
        .clone()
        .oneshot(empty_request(Method::GET, "/v1/boms"))
        .await
        .unwrap();
    let listed: Value =
        serde_json::from_slice(&to_bytes(list.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(listed["data"].as_array().unwrap().len(), 1);

    let updated = app
        .clone()
        .oneshot(json_request(
            Method::PATCH,
            &format!("/v1/boms/{id}"),
            json!({ "name": "Controller v2" }),
        ))
        .await
        .unwrap();
    assert_eq!(updated.status(), StatusCode::OK);

    let detail = app
        .clone()
        .oneshot(empty_request(Method::GET, &format!("/v1/boms/{id}")))
        .await
        .unwrap();
    let project: Value =
        serde_json::from_slice(&to_bytes(detail.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(project["name"], "Controller v2");
    assert_eq!(project["part_count"], 1);

    let deleted = app
        .oneshot(empty_request(Method::DELETE, &format!("/v1/boms/{id}")))
        .await
        .unwrap();
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);
}

fn empty_request(method: Method, uri: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .body(Body::empty())
        .unwrap()
}

fn json_request(method: Method, uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}
