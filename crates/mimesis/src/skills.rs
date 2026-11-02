//! Skills that teach an AI agent to make a kind of image and run it through
//! Mimesis. They live in the repo's skills/ folder and are built into the
//! binary, so `mimesis skill install` works anywhere mimesis is installed.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use rust_embed::RustEmbed;
use serde::Serialize;

#[derive(RustEmbed)]
#[folder = "../../skills"]
struct Files;

/// Installed skills are named mimesis-<folder>, so they sort together and
/// never clash with the person's own.
pub const PREFIX: &str = "mimesis-";

#[derive(Serialize, Clone, Debug)]
pub struct Skill {
    /// The folder name: what `mimesis skill install <id>` takes.
    pub id: String,
    /// The name an agent knows it by.
    pub name: String,
    pub description: String,
    pub files: Vec<String>,
    pub content: String,
    pub installed: bool,
    pub install_command: String,
}

/// Where agents look for skills: Claude Code's skills folder.
pub fn skills_dir() -> PathBuf {
    let config = std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).unwrap_or_else(|| {
        let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
        home.join(".claude")
    });
    config.join("skills")
}

fn front_matter(content: &str, key: &str) -> Option<String> {
    let body = content.strip_prefix("---")?;
    let end = body.find("\n---")?;
    body[..end].lines().find_map(|line| line.strip_prefix(&format!("{key}:")).map(|value| value.trim().to_string()))
}

pub fn list() -> Vec<Skill> {
    let mut ids: Vec<String> = Files::iter().filter_map(|path| path.split_once('/').map(|(id, _)| id.to_string())).collect();
    ids.sort();
    ids.dedup();
    ids.into_iter().filter_map(|id| get(&id).ok()).collect()
}

pub fn get(id: &str) -> Result<Skill> {
    let file = Files::get(&format!("{id}/SKILL.md")).ok_or_else(|| anyhow!("skill {id} not found; `mimesis skill list` shows them"))?;
    let content = String::from_utf8_lossy(&file.data).into_owned();
    let name = front_matter(&content, "name").unwrap_or_else(|| format!("{PREFIX}{id}"));
    let prefix = format!("{id}/");
    let files = Files::iter().filter_map(|path| path.strip_prefix(&prefix).map(str::to_string)).collect();
    Ok(Skill {
        id: id.to_string(),
        description: front_matter(&content, "description").unwrap_or_default(),
        installed: skills_dir().join(&name).join("SKILL.md").exists(),
        install_command: format!("mimesis skill install {id}"),
        name,
        files,
        content,
    })
}

/// Writes the skill's files into <dir>/<name>, replacing what's there.
pub fn install(id: &str, dir: &Path) -> Result<PathBuf> {
    let skill = get(id)?;
    let target = dir.join(&skill.name);
    if target.exists() {
        std::fs::remove_dir_all(&target)?;
    }
    for file in &skill.files {
        let data = Files::get(&format!("{id}/{file}")).ok_or_else(|| anyhow!("{id}/{file} missing"))?;
        let path = target.join(file);
        std::fs::create_dir_all(path.parent().unwrap_or(&target))?;
        std::fs::write(&path, &data.data)?;
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ui_skill_is_built_in_with_its_script() {
        let skill = get("ui").unwrap();
        assert_eq!(skill.name, "mimesis-ui");
        assert!(!skill.description.is_empty());
        assert!(skill.files.contains(&"capture.mjs".to_string()));
    }

    #[test]
    fn install_writes_every_file() {
        let dir = std::env::temp_dir().join(format!("mimesis-skills-{}", std::process::id()));
        let target = install("ui", &dir).unwrap();
        assert!(target.join("SKILL.md").exists() && target.join("capture.mjs").exists());
        std::fs::remove_dir_all(dir).ok();
    }
}
