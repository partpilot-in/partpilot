use axum::{
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode, header::CONTENT_TYPE},
};
use chrono::Utc;
use engine::{
    Confidence, LifecycleStage, LifecycleStatus, NormalizedManufacturer, NormalizedMpn, Part,
    PartId, PartSnapshot, SourceId,
    ports::{ConnectorError, DataSourceConnector},
};
use server::{router, router_with_state, state::AppState};
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;
use uuid::Uuid;

const PART_ID: &str = "8e4c1a20-1f3a-4b8e-9e2a-0a1b2c3d4e5f";

struct FixtureDigikey;

#[async_trait::async_trait]
impl DataSourceConnector for FixtureDigikey {
    fn source_id(&self) -> SourceId {
        SourceId(1)
    }

    async fn fetch_status(
        &self,
        mpn: &NormalizedMpn,
        manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<LifecycleStatus>, ConnectorError> {
        Ok(self
            .fetch_part(mpn, manufacturer)
            .await?
            .map(|snapshot| snapshot.lifecycle_status))
    }

    async fn fetch_part(
        &self,
        mpn: &NormalizedMpn,
        _manufacturer: &NormalizedManufacturer,
    ) -> Result<Option<PartSnapshot>, ConnectorError> {
        if mpn.0 != "TPS7A49-Q1" {
            return Ok(None);
        }
        let id = PartId(Uuid::from_u128(42));
        Ok(Some(PartSnapshot {
            part: Part {
                id: id.clone(),
                mpn: mpn.clone(),
                manufacturer: NormalizedManufacturer("TEXAS INSTRUMENTS".to_owned()),
                description: Some("Automotive high-voltage linear regulator".to_owned()),
                category: Some("Integrated Circuits - Power Management".to_owned()),
                component_metadata: json!({
                    "identification": {
                        "manufacturerPartNumber": "TPS7A49-Q1",
                        "manufacturer": "Texas Instruments"
                    },
                    "electrical": {
                        "voltageRating": {
                            "value": "36V",
                            "dataType": "REAL_MEASURE",
                            "definition": "Voltage - Input (Max)",
                            "source": "digikey"
                        }
                    },
                    "thermal": {
                        "operatingTemperatureRange": {
                            "value": "-40°C ~ 125°C",
                            "dataType": "RANGE",
                            "definition": "Operating Temperature",
                            "source": "digikey"
                        }
                    },
                    "commercial": {
                        "lifecycleStatus": "Active",
                        "priceBreaks": [{ "quantity": 1, "unitPrice": 3.5, "currency": "USD" }]
                    }
                }),
            },
            lifecycle_status: LifecycleStatus {
                part_id: id,
                stage: LifecycleStage::Active,
                source: SourceId(1),
                reported_at: Utc::now(),
                last_time_buy_date: None,
                confidence: Confidence(0.9),
                raw_payload_ref: Some("https://www.digikey.com/example".to_owned()),
            },
        }))
    }
}

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
async fn part_search_enriches_a_miss_and_detail_returns_the_persisted_shape() {
    let mut state = AppState::placeholder();
    state.digikey = Some(Arc::new(FixtureDigikey));
    let app = router_with_state(state);

    let response = app
        .clone()
        .oneshot(empty_request(
            Method::GET,
            "/v1/parts/search?q=TPS7A49-Q1&manufacturer=TI",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    let part = &body["data"][0];
    assert_eq!(part["manufacturer"], "TEXAS INSTRUMENTS");
    assert_eq!(
        part["component_metadata"]["electrical"]["voltageRating"]["value"],
        "36V"
    );
    let id = part["id"].as_str().expect("enriched part id");

    let detail = app
        .oneshot(empty_request(Method::GET, &format!("/v1/parts/{id}")))
        .await
        .unwrap();
    assert_eq!(detail.status(), StatusCode::OK);
    let detail: Value =
        serde_json::from_slice(&to_bytes(detail.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(detail["mpn"], "TPS7A49-Q1");
    assert_eq!(
        detail["component_metadata"]["commercial"]["lifecycleStatus"],
        "Active"
    );
}

#[tokio::test]
async fn my_parts_support_full_crud() {
    let app = router();
    let create = json!({
        "mpn": "STM32F411CEU6", "manufacturer": "STMicroelectronics",
        "description": "ARM microcontroller", "category": "MCU", "total_qty": 3,
        "component_metadata": {
            "regulatory": { "countryOfOrigin": "FR" },
            "commercial": {
                "lifecycleStatus": "Active",
                "priceBreaks": [{ "quantity": 1, "unitPrice": 4.25 }]
            }
        }
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
    assert_eq!(created["score"], engine::base_rating());
    assert_eq!(
        created["component_metadata"]["regulatory"]["countryOfOrigin"],
        "FR"
    );

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
        "component_metadata": {
            "regulatory": { "countryOfOrigin": "FR" },
            "commercial": { "priceBreaks": [{ "quantity": 1, "unitPrice": 4.10 }] }
        }
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
        "component_metadata": { "commercial": { "lifecycleStatus": "Active" } }
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
        engine::base_rating()
    );
    assert_eq!(
        created["lines"][0]["component_metadata"]["commercial"]["lifecycleStatus"],
        "Active"
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

#[tokio::test]
async fn project_categories_are_inferred_from_designators_on_the_server() {
    let app = router();
    let create = json!({ "name": "Inferred categories", "lines": [
        {
            "mpn": "RC0603FR-0710KL",
            "manufacturer": "Yageo",
            "description": "R12 — 10 kOhm resistor",
            "category": "",
            "component_metadata": {
                "electrical": {
                    "resistance": { "value": 10, "unit": "kOhm", "source": "datasheet" }
                }
            }
        },
        {
            "mpn": "CAT24C32WI-GT3",
            "manufacturer": "onsemi",
            "description": "U2 — EEPROM",
            "category": "Memory"
        },
        {
            "mpn": "EXB-38V103JV",
            "manufacturer": "Panasonic",
            "description": "RN4 — resistor array"
        }
    ]});

    let response = app
        .oneshot(json_request(Method::POST, "/v1/boms", create))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let project: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();

    assert_eq!(project["lines"][0]["category"], "Resistor");
    assert_eq!(
        project["lines"][0]["component_metadata"]["electrical"]["resistance"]["unit"],
        "kOhm"
    );
    assert_eq!(project["lines"][1]["category"], "Memory");
    assert_eq!(project["lines"][2]["category"], "Resistor Network");
}

#[tokio::test]
async fn part_notes_are_user_editable_and_preserve_partpilot_points() {
    let app = router();
    let initial = app
        .clone()
        .oneshot(empty_request(
            Method::GET,
            &format!("/v1/part-notes/{PART_ID}"),
        ))
        .await
        .unwrap();
    assert_eq!(initial.status(), StatusCode::OK);
    let initial: Value =
        serde_json::from_slice(&to_bytes(initial.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(initial["note"], "");
    assert_eq!(initial["partpilot_points"], json!([]));

    let updated = app
        .clone()
        .oneshot(json_request(
            Method::PATCH,
            &format!("/v1/part-notes/{PART_ID}"),
            json!({ "note": "Check the alternate footprint before release." }),
        ))
        .await
        .unwrap();
    assert_eq!(updated.status(), StatusCode::OK);
    let updated: Value =
        serde_json::from_slice(&to_bytes(updated.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        updated["note"],
        "Check the alternate footprint before release."
    );
    assert_eq!(updated["partpilot_points"], json!([]));

    let fetched = app
        .oneshot(empty_request(
            Method::GET,
            &format!("/v1/part-notes/{PART_ID}"),
        ))
        .await
        .unwrap();
    let fetched: Value =
        serde_json::from_slice(&to_bytes(fetched.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(fetched, updated);
}

#[tokio::test]
async fn settings_support_profile_updates_and_password_reset_requests() {
    let app = router();

    let initial = app
        .clone()
        .oneshot(empty_request(Method::GET, "/v1/settings/profile"))
        .await
        .unwrap();
    assert_eq!(initial.status(), StatusCode::OK);
    let initial: Value =
        serde_json::from_slice(&to_bytes(initial.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(initial["email"], "test@example.com");
    assert_eq!(initial["organization_slug"], "personal");
    assert_eq!(initial["billing_plan"], "hobby");

    let profile = json!({
        "email": "jane@example.com",
        "first_name": "Jane",
        "last_name": "Doe",
        "phone": "+1 202 555 0142",
        "job": "Hardware Engineer",
        "company": "PartPilot",
        "github": "https://github.com/jane-doe",
        "linkedin": "https://www.linkedin.com/in/jane-doe"
    });
    let updated = app
        .clone()
        .oneshot(json_request(
            Method::PATCH,
            "/v1/settings/profile",
            profile.clone(),
        ))
        .await
        .unwrap();
    assert_eq!(updated.status(), StatusCode::OK);
    let updated: Value =
        serde_json::from_slice(&to_bytes(updated.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(updated["email"], profile["email"]);
    assert_eq!(updated["phone"], profile["phone"]);
    assert_eq!(updated["github"], profile["github"]);
    assert_eq!(updated["organization_slug"], "personal");
    assert_eq!(updated["billing_plan"], "hobby");

    let reset = app
        .oneshot(json_request(
            Method::POST,
            "/v1/settings/reset-password",
            json!({ "redirect_to": "http://localhost:5173/settings" }),
        ))
        .await
        .unwrap();
    assert_eq!(reset.status(), StatusCode::ACCEPTED);
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
