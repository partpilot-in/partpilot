use std::{
    io::{Read, Write},
    net::TcpListener,
    process::{Command, Output},
    thread,
    time::Duration,
};

fn run(args: &[&str], responses: &[(&str, &str)], expected_queries: &[&str]) -> Output {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let responses: Vec<_> = responses
        .iter()
        .map(|(s, b)| (s.to_string(), b.to_string()))
        .collect();
    let expected: Vec<_> = expected_queries.iter().map(|s| s.to_string()).collect();
    let server = thread::spawn(move || {
        for ((status, body), query) in responses.into_iter().zip(expected) {
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            let mut stream = loop {
                match listener.accept() {
                    Ok((s, _)) => break s,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(std::time::Instant::now() < deadline, "Expected API request");
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(e) => panic!("{e}"),
                }
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = Vec::new();
            loop {
                let mut buffer = [0; 1024];
                let n = stream.read(&mut buffer).unwrap();
                assert!(n > 0);
                request.extend_from_slice(&buffer[..n]);
                if request.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8(request).unwrap();
            assert!(request.starts_with("GET /v1/parts/search?"), "{request}");
            assert!(request.contains(&query), "{request}");
            write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
        }
    });
    let output = Command::new(env!("CARGO_BIN_EXE_partpilot"))
        .args(["--api-url", &url])
        .args(args)
        .output()
        .unwrap();
    server.join().unwrap();
    output
}

const PART: &str = r#"{"data":[{"mpn":"AMS1117","manufacturer":"AMS","description":"Voltage regulator","score":12,"component_metadata":{"commercial":{"lifecycleStatus":"Active"},"environmental":{"rohsCompliant":true,"reachCompliant":false}}}]}"#;

#[test]
fn scan_encodes_query_and_prints_details() {
    let result = run(
        &["scan", "AMS1117 /+"],
        &[("200 OK", PART)],
        &["q=AMS1117+%2F%2B"],
    );
    assert!(result.status.success());
    let text = String::from_utf8(result.stdout).unwrap();
    for value in ["RoHS", "REACH", "Active", "Yes", "No", "Voltage regulator"] {
        assert!(text.contains(value), "{text}");
    }
}

#[test]
fn analyse_xlsx() {
    let path = format!("{}/tests/fixtures/bom.xlsx", env!("CARGO_MANIFEST_DIR"));
    let result = run(&["analyse", &path], &[("200 OK", PART)], &["q=AMS1117"]);
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(String::from_utf8_lossy(&result.stdout).contains("1 matched"));
}

#[test]
fn csv_caches_duplicates_and_keeps_rows_after_failure() {
    let path = std::env::temp_dir().join(format!("partpilot-test-{}.csv", std::process::id()));
    std::fs::write(
        &path,
        "MPN,Qty\nAMS1117,2\nAMS1117,3\nMISSING,1\nBROKEN,1\n",
    )
    .unwrap();
    let result = run(
        &["analyse", path.to_str().unwrap()],
        &[
            ("200 OK", PART),
            ("200 OK", r#"{"data":[]}"#),
            ("503 Service Unavailable", "{}"),
        ],
        &["q=AMS1117", "q=MISSING", "q=BROKEN"],
    );
    std::fs::remove_file(path).unwrap();
    assert!(!result.status.success());
    let text = String::from_utf8_lossy(&result.stdout);
    assert!(
        text.contains("2 matched, 1 unresolved, 1 API errors"),
        "{text}"
    );
}

#[test]
fn bad_responses_fail_cleanly() {
    for (status, body) in [
        ("429 Too Many Requests", "{}"),
        ("200 OK", "not JSON"),
        ("200 OK", r#"{"data":[]}"#),
    ] {
        assert!(
            !run(&["scan", "AMS1117"], &[(status, body)], &["q=AMS1117"])
                .status
                .success()
        );
    }
}
