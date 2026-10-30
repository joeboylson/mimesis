//! The ochre command: what an AI (or a person at a terminal) uses to open
//! reviews, pick up marked-up images, and answer them with new ones. It
//! works on the same files as the page, so the server needn't be running.

use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use ochre::{bake, model::Request, paths, server, skills, store::Store};

#[derive(Parser)]
#[command(name = "ochre", version = VERSION_TEXT, about = "Mark up images, hand them to an AI, and go round until they're right.")]
struct Cli {
    #[command(subcommand)]
    command: Option<Cmd>,
}

#[derive(Subcommand)]
enum Cmd {
    /// Open the page in a browser, starting the server if it isn't running
    Open,
    /// Run the server in the foreground (the page and its API)
    Serve {
        #[arg(long, env = "OCHRE_PORT", default_value_t = paths::DEFAULT_PORT)]
        port: u16,
    },
    /// Start a review, optionally with images
    New {
        title: String,
        images: Vec<PathBuf>,
        #[arg(long)]
        json: bool,
    },
    /// Add images to a review
    Add { review: i64, images: Vec<PathBuf> },
    /// List reviews
    List {
        #[arg(long)]
        json: bool,
        /// Include archived reviews
        #[arg(long)]
        all: bool,
    },
    /// Show a review's items and where each one stands
    Show {
        review: i64,
        #[arg(long)]
        json: bool,
    },
    /// Reviewed items waiting for a new version
    Inbox {
        #[arg(long)]
        review: Option<i64>,
        #[arg(long)]
        json: bool,
    },
    /// Save marked-up images (marks drawn in) and their notes to a folder
    Pull {
        /// Items to pull; all waiting items if none are given
        items: Vec<i64>,
        #[arg(long)]
        review: Option<i64>,
        /// Folder to write to (default: ~/.ochre/out)
        #[arg(long)]
        out: Option<PathBuf>,
        #[arg(long)]
        json: bool,
    },
    /// Answer an item with a new image, which starts its next round
    Respond {
        item: i64,
        image: PathBuf,
        /// What changed, shown to the person beside the new image
        #[arg(long, short, default_value = "")]
        note: String,
    },
    /// Wait until the person finishes reviewing something, then list it
    Wait {
        #[arg(long)]
        review: Option<i64>,
        /// Give up after this many seconds (exit code 2)
        #[arg(long)]
        timeout: Option<u64>,
        #[arg(long)]
        json: bool,
    },
    /// Approve an item
    Approve { item: i64 },
    /// How an AI should use ochre
    Guide,
    /// Skills that teach an AI to make a kind of image and run it through ochre
    #[command(subcommand)]
    Skill(SkillCmd),
    /// Pull the latest code and reinstall
    Update,
}

#[derive(Subcommand)]
enum SkillCmd {
    /// What's available, and what's installed
    List {
        #[arg(long)]
        json: bool,
    },
    /// Print a skill's SKILL.md
    Show { id: String },
    /// Install skills into ~/.claude/skills (as ochre-<id>)
    Install {
        ids: Vec<String>,
        #[arg(long)]
        all: bool,
        /// Install somewhere else
        #[arg(long)]
        dir: Option<PathBuf>,
    },
    /// Refresh every skill that's already installed
    Update,
}

const VERSION_TEXT: &str = concat!(env!("CARGO_PKG_VERSION"), " (built ", env!("OCHRE_BUILT"), ")");

fn main() {
    if let Err(error) = run(Cli::parse()) {
        eprintln!("ochre: {error:#}");
        std::process::exit(1);
    }
}

fn run(cli: Cli) -> Result<()> {
    let Some(command) = cli.command else {
        println!("{GUIDE}");
        return Ok(());
    };
    match command {
        Cmd::Open => open(),
        Cmd::Serve { port } => {
            println!("Ochre is on {}", paths::address(port));
            tokio::runtime::Runtime::new()?.block_on(server::serve(port))
        }
        Cmd::New { title, images, json } => {
            let store = Store::open()?;
            let id = store.create_review(&title)?;
            for path in &images {
                add(&store, id, path)?;
            }
            if json {
                println!("{}", serde_json::to_string_pretty(&store.review(id)?)?);
            } else {
                println!("Review {id}: {title} ({} images)", images.len());
                println!("{}/#/r/{id}", paths::address(paths::port()));
            }
            Ok(())
        }
        Cmd::Add { review, images } => {
            let store = Store::open()?;
            for path in &images {
                let item = add(&store, review, path)?;
                println!("Item {item}: {}", path.display());
            }
            Ok(())
        }
        Cmd::List { json, all } => {
            let reviews: Vec<_> = Store::open()?.reviews()?.into_iter().filter(|r| all || !r.archived).collect();
            if json {
                println!("{}", serde_json::to_string_pretty(&reviews)?);
            } else if reviews.is_empty() {
                println!("No reviews yet. Start one: ochre new \"Title\" image.png …");
            } else {
                for r in reviews {
                    println!("{:>4}  {}  ({} images: {} need review, {} reviewed, {} approved)", r.id, r.title, r.total, r.needs_review, r.reviewed, r.approved);
                }
            }
            Ok(())
        }
        Cmd::Show { review, json } => {
            let review = Store::open()?.review(review)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&review)?);
            } else {
                println!("Review {}: {}", review.id, review.title);
                for item in &review.items {
                    println!("{:>6}  {:<12}  round {}  {}", item.id, item.state.label(), item.latest().number, item.name);
                }
            }
            Ok(())
        }
        Cmd::Inbox { review, json } => {
            let requests = Store::open()?.inbox(review)?;
            print_requests(&requests, json)
        }
        Cmd::Pull { items, review, out, json } => pull(items, review, out, json),
        Cmd::Respond { item, image, note } => {
            let bytes = std::fs::read(&image).with_context(|| format!("can't read {}", image.display()))?;
            let round = Store::open()?.respond(item, &bytes, &note)?;
            println!("Item {item} is on round {}, ready for review.", round.number);
            Ok(())
        }
        Cmd::Wait { review, timeout, json } => {
            let started = Instant::now();
            loop {
                let requests = Store::open()?.inbox(review)?;
                if !requests.is_empty() {
                    return print_requests(&requests, json);
                }
                if timeout.is_some_and(|limit| started.elapsed() >= Duration::from_secs(limit)) {
                    eprintln!("Nothing came in.");
                    std::process::exit(2);
                }
                std::thread::sleep(Duration::from_secs(2));
            }
        }
        Cmd::Approve { item } => {
            Store::open()?.approve(item)?;
            println!("Item {item} approved.");
            Ok(())
        }
        Cmd::Guide => {
            println!("{GUIDE}");
            Ok(())
        }
        Cmd::Skill(command) => skill(command),
        Cmd::Update => update(),
    }
}

fn skill(command: SkillCmd) -> Result<()> {
    match command {
        SkillCmd::List { json } => {
            let all = skills::list();
            if json {
                println!("{}", serde_json::to_string_pretty(&all)?);
                return Ok(());
            }
            for skill in all {
                let mark = if skill.installed { "installed" } else { "" };
                println!("{:<12} {:<10} {}", skill.id, mark, skill.description);
            }
            println!("\nInstall with: ochre skill install <id>   (into {})", skills::skills_dir().display());
            Ok(())
        }
        SkillCmd::Show { id } => {
            println!("{}", skills::get(&id)?.content);
            Ok(())
        }
        SkillCmd::Install { ids, all, dir } => {
            let dir = dir.unwrap_or_else(skills::skills_dir);
            let ids: Vec<String> = if all { skills::list().into_iter().map(|s| s.id).collect() } else { ids };
            if ids.is_empty() {
                bail!("name a skill (ochre skill list), or pass --all");
            }
            for id in ids {
                println!("Installed {}", skills::install(&id, &dir)?.display());
            }
            Ok(())
        }
        SkillCmd::Update => {
            for skill in skills::list().into_iter().filter(|s| s.installed) {
                println!("Updated {}", skills::install(&skill.id, &skills::skills_dir())?.display());
            }
            Ok(())
        }
    }
}

fn add(store: &Store, review: i64, path: &Path) -> Result<i64> {
    let bytes = std::fs::read(path).with_context(|| format!("can't read {}", path.display()))?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "image".into());
    store.add_image(review, &name, &bytes)
}

fn print_requests(requests: &[Request], json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(requests)?);
        return Ok(());
    }
    if requests.is_empty() {
        println!("Nothing has been reviewed yet.");
    }
    for request in requests {
        println!("Item {} — {} (review {}: {}), round {}", request.item_id, request.name, request.review_id, request.review_title, request.round);
        if !request.note.trim().is_empty() {
            println!("  Note: {}", request.note.trim());
        }
        for mark in &request.marks {
            let note = if mark.note.trim().is_empty() { "(no note)" } else { mark.note.trim() };
            let [l, t, r, b] = mark.area;
            println!("  {}. {} at {l},{t}–{r},{b}: {note}", mark.number, mark.kind);
        }
    }
    Ok(())
}

fn pull(items: Vec<i64>, review: Option<i64>, out: Option<PathBuf>, json: bool) -> Result<()> {
    let store = Store::open()?;
    let requests = if items.is_empty() { store.inbox(review)? } else { items.iter().map(|id| store.request(*id)).collect::<Result<_>>()? };
    let out = out.unwrap_or_else(|| paths::home().join("out"));
    let mut written = vec![];
    for request in &requests {
        let folder = out.join(format!("item-{}", request.item_id)).join(format!("round-{}", request.round));
        std::fs::create_dir_all(&folder)?;
        let round = store.round(request.round_id)?;
        let original = std::fs::read(store.image_path(&round.image))?;
        let extension = Path::new(&round.image).extension().and_then(|e| e.to_str()).unwrap_or("png");
        let original_path = folder.join(format!("original.{extension}"));
        let marked_path = folder.join("marked.png");
        std::fs::write(&original_path, &original)?;
        std::fs::write(&marked_path, bake::bake(&original, &round)?)?;
        std::fs::write(folder.join("request.json"), serde_json::to_string_pretty(request)?)?;
        written.push(serde_json::json!({
            "item_id": request.item_id,
            "round": request.round,
            "marked": marked_path,
            "original": original_path,
            "request": request,
        }));
    }
    if json {
        println!("{}", serde_json::to_string_pretty(&written)?);
        return Ok(());
    }
    if requests.is_empty() {
        println!("Nothing has been reviewed yet.");
        return Ok(());
    }
    print_requests(&requests, false)?;
    println!();
    for entry in &written {
        println!("Item {}: {}", entry["item_id"], entry["marked"].as_str().unwrap_or_default());
    }
    Ok(())
}

fn open() -> Result<()> {
    let port = paths::port();
    if !server::is_running(port) {
        let me = std::env::current_exe()?;
        let mut command = Command::new(me);
        command.arg("serve").arg("--port").arg(port.to_string()).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        command.spawn().context("can't start the server")?;
        let started = Instant::now();
        while !server::is_running(port) {
            if started.elapsed() > Duration::from_secs(5) {
                bail!("the server didn't start; run `ochre serve` to see why");
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    let address = paths::address(port);
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    Command::new(opener).arg(&address).status().ok();
    println!("{address}");
    Ok(())
}

fn update() -> Result<()> {
    let script = Path::new(ochre::REPO).join("update.sh");
    if !script.exists() {
        bail!("can't find {}; clone https://github.com/joeboylson/ochre and run ./install.sh", script.display());
    }
    let status = Command::new("sh").arg(&script).status()?;
    if !status.success() {
        bail!("update failed");
    }
    Ok(())
}

const GUIDE: &str = "\
Ochre: a person marks up images; you answer with new images; repeat until they approve.

A review holds images. Each image (an item) goes round by round:
  needs review   the person looks at it, marks it up, or approves it
  reviewed       the person finished marking it up; your turn to make a new version
  approved   done

For an AI:
  ochre new \"Title\" a.png b.png   start a review with images (prints its id)
  ochre add <review> c.png         add more images
  ochre wait --review <id>         block until the person finishes reviewing something
  ochre pull --review <id>         save each reviewed item's image with the marks drawn in,
                                   plus request.json (every mark's note and pixel area)
  ochre respond <item> new.png -n \"what changed\"
                                   answer with a new image; the person sees it beside the last one
  ochre inbox --json               what's waiting, as JSON
  ochre show <review>              where every item stands

Look at marked.png from `ochre pull`: numbered badges sit on each mark, and the notes are
listed under the image against those numbers. Make one new image per item, answer each with
`ochre respond`, then `ochre wait` again. Items the person approves drop out.

Skills: step-by-step guides for a kind of image (UI screenshots, …), including the loop above.
  ochre skill list                 what's available
  ochre skill show ui              read one now
  ochre skill install ui           install it for Claude Code (~/.claude/skills/ochre-ui)

For a person:
  ochre open                       open the page (starts the server if needed)
  ochre update                     pull the latest code and reinstall

HTTP, on http://127.0.0.1:4620 (OCHRE_PORT): GET /api/inbox, GET /api/rounds/<id>/baked.png,
POST /api/items/<id>/respond?note=… with the image as the body.";
