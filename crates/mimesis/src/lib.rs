//! Mimesis: a place for a person and an AI to talk in pictures. A review holds
//! images; each image goes round by round: the person marks it up, the AI
//! answers with a new image, until the person approves it.

pub mod bake;
pub mod model;
pub mod paths;
pub mod server;
pub mod skills;
pub mod store;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const BUILT: &str = env!("MIMESIS_BUILT");
pub const REPO: &str = env!("MIMESIS_REPO");
