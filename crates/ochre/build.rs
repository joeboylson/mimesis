// Stamps the build time and the repo's folder into the binary: `ochre --version`
// tells two builds apart, and `ochre update` knows where to pull and rebuild.
fn main() {
    let out = std::process::Command::new("date").args(["-u", "+%Y-%m-%d %H:%M UTC"]).output();
    let built = out.ok().and_then(|o| String::from_utf8(o.stdout).ok()).unwrap_or_default();
    println!("cargo:rustc-env=OCHRE_BUILT={}", built.trim());

    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let repo = manifest.join("../..").canonicalize().unwrap();
    println!("cargo:rustc-env=OCHRE_REPO={}", repo.display());

    // The page is embedded from web/dist; an empty folder keeps a Rust-only build working.
    let dist = repo.join("web/dist");
    std::fs::create_dir_all(&dist).ok();
    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed=../../web/dist");
}
