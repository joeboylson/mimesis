use std::path::PathBuf;

pub const DEFAULT_PORT: u16 = 4620;

/// Where everything lives: MIMESIS_HOME, or ~/.mimesis.
pub fn home() -> PathBuf {
    if let Some(home) = std::env::var_os("MIMESIS_HOME") {
        return PathBuf::from(home);
    }
    let user_home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    user_home.join(".mimesis")
}

pub fn port() -> u16 {
    std::env::var("MIMESIS_PORT").ok().and_then(|port| port.parse().ok()).unwrap_or(DEFAULT_PORT)
}

/// Which network address the server listens on. 127.0.0.1 keeps it to this
/// machine; Docker sets MIMESIS_LISTEN=0.0.0.0 so the port can be published.
pub fn listen() -> std::net::IpAddr {
    std::env::var("MIMESIS_LISTEN").ok().and_then(|ip| ip.parse().ok()).unwrap_or([127, 0, 0, 1].into())
}

pub fn address(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}
