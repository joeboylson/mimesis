//! The page and its API on a local web address. The Tauri app and a browser
//! tab load the same thing. Only this machine can reach it, and only pages
//! it served itself may call it.

use std::{
    net::{SocketAddr, TcpStream},
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::Result;
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{header, StatusCode, Uri},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::Deserialize;
use serde_json::json;

use crate::{bake, model::Annotation, store::Store};

#[derive(RustEmbed)]
#[folder = "../../web/dist"]
struct Page;

const MAX_UPLOAD: usize = 200 * 1024 * 1024;
const LOCAL_HOST_NAMES: &[&str] = &["127.0.0.1", "localhost"];

type Shared = Arc<Mutex<Store>>;

pub fn is_running(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}

pub async fn serve(port: u16) -> Result<()> {
    let store = Arc::new(Mutex::new(Store::open()?));
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], port))).await?;
    axum::serve(listener, router(store, port)).with_graceful_shutdown(async { tokio::signal::ctrl_c().await.ok(); }).await?;
    Ok(())
}

pub fn router(store: Shared, port: u16) -> Router {
    let api = Router::new()
        .route("/version", get(version))
        .route("/reviews", get(reviews).post(create_review))
        .route("/reviews/{id}", get(review).patch(update_review).delete(delete_review))
        .route("/reviews/{id}/items", post(add_item))
        .route("/reviews/{id}/send", post(send_all))
        .route("/items/{id}", get(item).delete(delete_item))
        .route("/items/{id}/send", post(send))
        .route("/items/{id}/unsend", post(unsend))
        .route("/items/{id}/approve", post(approve))
        .route("/items/{id}/reopen", post(reopen))
        .route("/items/{id}/respond", post(respond))
        .route("/items/{id}/request", get(request))
        .route("/rounds/{id}/marks", put(save_marks))
        .route("/rounds/{id}/baked.png", get(baked))
        .route("/inbox", get(inbox))
        .route("/images/{file}", get(image))
        .route("/skills", get(skills))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD))
        .with_state(store);
    Router::new()
        .nest("/api", api)
        .fallback(page)
        .layer(middleware::from_fn_with_state(port, refuse_other_sites))
}

/// A request is local when it's addressed to this machine on Mimesis's port
/// (which stops a website renamed to point here), and, if a page sent it,
/// that page came from the same address.
pub fn is_local_request(host: Option<&str>, origin: Option<&str>, port: u16) -> bool {
    let local_hosts: Vec<String> = LOCAL_HOST_NAMES.iter().map(|name| format!("{name}:{port}")).collect();
    let is_local_host = host.is_some_and(|host| local_hosts.iter().any(|local| local == host));
    let is_local_origin = origin.is_none_or(|origin| local_hosts.iter().any(|local| origin == format!("http://{local}")));
    is_local_host && is_local_origin
}

async fn refuse_other_sites(State(port): State<u16>, request: Request, next: Next) -> Response {
    let is_local = {
        let header_text = |name: header::HeaderName| request.headers().get(name).and_then(|value| value.to_str().ok());
        is_local_request(header_text(header::HOST), header_text(header::ORIGIN), port)
    };
    if !is_local {
        return (StatusCode::FORBIDDEN, "only pages Mimesis serves itself may use it").into_response();
    }
    next.run(request).await
}

async fn page(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let file = Page::get(path).map(|file| (path, file)).or_else(|| Page::get("index.html").map(|file| ("index.html", file)));
    match file {
        Some((path, file)) => {
            let cache = if path.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
            ([(header::CONTENT_TYPE, file.metadata.mimetype().to_string()), (header::CACHE_CONTROL, cache.to_string())], file.data).into_response()
        }
        None => (StatusCode::NOT_FOUND, "the page isn't built: run ./install.sh").into_response(),
    }
}

struct Failure(anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for Failure {
    fn from(error: E) -> Failure {
        Failure(error.into())
    }
}

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        let message = format!("{:#}", self.0);
        let status = if message.contains("not found") { StatusCode::NOT_FOUND } else { StatusCode::BAD_REQUEST };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

type Reply = Result<Response, Failure>;

fn ok<T: serde::Serialize>(value: T) -> Reply {
    Ok(Json(value).into_response())
}

/// Runs a store call off the async threads; SQLite and image work block.
async fn with_store<T: Send + 'static>(store: Shared, work: impl FnOnce(&Store) -> Result<T> + Send + 'static) -> Result<T, Failure> {
    let result = tokio::task::spawn_blocking(move || {
        let store = store.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        work(&store)
    })
    .await?;
    Ok(result?)
}

async fn version(State(store): State<Shared>) -> Reply {
    ok(json!({ "version": with_store(store, |s| s.version()).await?, "mimesis": crate::VERSION }))
}

async fn reviews(State(store): State<Shared>) -> Reply {
    ok(with_store(store, |s| s.reviews()).await?)
}

#[derive(Deserialize)]
struct NewReview {
    title: String,
}

async fn create_review(State(store): State<Shared>, Json(body): Json<NewReview>) -> Reply {
    ok(with_store(store, move |s| s.create_review(&body.title).and_then(|id| s.review(id))).await?)
}

async fn review(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.review(id)).await?)
}

#[derive(Deserialize)]
struct ReviewChange {
    title: Option<String>,
    archived: Option<bool>,
}

async fn update_review(State(store): State<Shared>, Path(id): Path<i64>, Json(body): Json<ReviewChange>) -> Reply {
    ok(with_store(store, move |s| s.update_review(id, body.title.as_deref(), body.archived).and_then(|_| s.review(id))).await?)
}

async fn delete_review(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.delete_review(id)).await?)
}

#[derive(Deserialize)]
struct Named {
    name: Option<String>,
}

async fn add_item(State(store): State<Shared>, Path(id): Path<i64>, Query(query): Query<Named>, body: Bytes) -> Reply {
    let name = query.name.unwrap_or_else(|| "image".into());
    ok(with_store(store, move |s| s.add_image(id, &name, &body).and_then(|item| s.item(item))).await?)
}

async fn send_all(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(json!({ "sent": with_store(store, move |s| s.send_all(id)).await? }))
}

async fn item(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.item(id)).await?)
}

async fn delete_item(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.delete_item(id)).await?)
}

async fn send(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.send(id).and_then(|_| s.item(id))).await?)
}

async fn unsend(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.unsend(id).and_then(|_| s.item(id))).await?)
}

async fn approve(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.approve(id).and_then(|_| s.item(id))).await?)
}

async fn reopen(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.reopen(id).and_then(|_| s.item(id))).await?)
}

#[derive(Deserialize)]
struct Answer {
    note: Option<String>,
}

async fn respond(State(store): State<Shared>, Path(id): Path<i64>, Query(query): Query<Answer>, body: Bytes) -> Reply {
    let note = query.note.unwrap_or_default();
    ok(with_store(store, move |s| s.respond(id, &body, &note)).await?)
}

async fn request(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    ok(with_store(store, move |s| s.request(id)).await?)
}

#[derive(Deserialize)]
struct Marks {
    annotations: Vec<Annotation>,
    #[serde(default)]
    note: String,
}

async fn save_marks(State(store): State<Shared>, Path(id): Path<i64>, Json(body): Json<Marks>) -> Reply {
    ok(with_store(store, move |s| s.save_marks(id, &body.annotations, &body.note)).await?)
}

async fn baked(State(store): State<Shared>, Path(id): Path<i64>) -> Reply {
    let png = with_store(store, move |s| {
        let round = s.round(id)?;
        let bytes = std::fs::read(s.image_path(&round.image))?;
        bake::bake(&bytes, &round)
    })
    .await?;
    Ok(([(header::CONTENT_TYPE, "image/png"), (header::CACHE_CONTROL, "no-cache")], png).into_response())
}

#[derive(Deserialize)]
struct InboxQuery {
    review: Option<i64>,
}

async fn inbox(State(store): State<Shared>, Query(query): Query<InboxQuery>) -> Reply {
    ok(with_store(store, move |s| s.inbox(query.review)).await?)
}

async fn image(State(store): State<Shared>, Path(file): Path<String>) -> Reply {
    if file.contains('/') || file.contains("..") {
        return Err(Failure(anyhow::anyhow!("image {file} not found")));
    }
    let mime = match file.rsplit('.').next() {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    };
    let bytes = with_store(store, move |s| Ok(std::fs::read(s.image_path(&file))?)).await?;
    // Named by their contents, so they never change.
    Ok(([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "public, max-age=31536000, immutable")], bytes).into_response())
}

async fn skills() -> Reply {
    ok(crate::skills::list())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_this_machine_on_this_port_is_local() {
        assert!(is_local_request(Some("127.0.0.1:4620"), None, 4620));
        assert!(is_local_request(Some("localhost:4620"), Some("http://localhost:4620"), 4620));
        assert!(!is_local_request(Some("127.0.0.1:4620"), Some("https://example.com"), 4620));
        assert!(!is_local_request(Some("evil.example:4620"), None, 4620));
        assert!(!is_local_request(None, None, 4620));
    }
}
