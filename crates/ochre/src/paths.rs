use std::path::PathBuf;

pub const DEFAULT_PORT: u16 = 4620;

/// Where everything lives: OCHRE_HOME, or ~/.ochre.
pub fn home() -> PathBuf {
    if let Some(home) = std::env::var_os("OCHRE_HOME") {
        return PathBuf::from(home);
    }
    let user_home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    user_home.join(".ochre")
}

pub fn port() -> u16 {
    std::env::var("OCHRE_PORT").ok().and_then(|port| port.parse().ok()).unwrap_or(DEFAULT_PORT)
}

pub fn address(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}
