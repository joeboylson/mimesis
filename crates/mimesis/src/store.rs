//! Reviews, items and rounds in SQLite; images as files named by their
//! contents, so the same image added twice is stored once. The command line
//! and the server both open it, so every write bumps a version number the
//! page watches.

use std::{
    io::Cursor,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, bail, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::model::{Annotation, Item, ItemState, Request, Review, ReviewSummary, Round};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT OR IGNORE INTO meta (key, value) VALUES ('version', 0);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  approved_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  image TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  ai_note TEXT NOT NULL DEFAULT '',
  annotations TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  sent_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_by_review ON items(review_id);
CREATE INDEX IF NOT EXISTS rounds_by_item ON rounds(item_id, number);
";

pub struct Store {
    conn: Connection,
    images: PathBuf,
}

pub fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn not_found(what: &str, id: i64) -> anyhow::Error {
    anyhow!("{what} {id} not found")
}

impl Store {
    pub fn open() -> Result<Store> {
        Store::open_at(&crate::paths::home())
    }

    pub fn open_at(home: &Path) -> Result<Store> {
        let images = home.join("images");
        std::fs::create_dir_all(&images).with_context(|| format!("can't create {}", images.display()))?;
        let conn = Connection::open(home.join("mimesis.db"))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Store { conn, images })
    }

    pub fn image_path(&self, file: &str) -> PathBuf {
        self.images.join(file)
    }

    pub fn version(&self) -> Result<i64> {
        Ok(self.conn.query_row("SELECT value FROM meta WHERE key = 'version'", [], |row| row.get(0))?)
    }

    fn changed(&self, review_id: i64) -> Result<()> {
        self.conn.execute("UPDATE meta SET value = value + 1 WHERE key = 'version'", [])?;
        self.conn.execute("UPDATE reviews SET updated_at = ?1 WHERE id = ?2", params![now(), review_id])?;
        Ok(())
    }

    // ---------- reviews ----------

    pub fn create_review(&self, title: &str) -> Result<i64> {
        let title = title.trim();
        let title = if title.is_empty() { "Untitled review" } else { title };
        let at = now();
        self.conn.execute("INSERT INTO reviews (title, created_at, updated_at) VALUES (?1, ?2, ?2)", params![title, at])?;
        let id = self.conn.last_insert_rowid();
        self.changed(id)?;
        Ok(id)
    }

    pub fn update_review(&self, id: i64, title: Option<&str>, archived: Option<bool>) -> Result<()> {
        self.review_exists(id)?;
        if let Some(title) = title.map(str::trim).filter(|t| !t.is_empty()) {
            self.conn.execute("UPDATE reviews SET title = ?1 WHERE id = ?2", params![title, id])?;
        }
        if let Some(archived) = archived {
            self.conn.execute("UPDATE reviews SET archived = ?1 WHERE id = ?2", params![archived, id])?;
        }
        self.changed(id)
    }

    pub fn delete_review(&self, id: i64) -> Result<()> {
        self.review_exists(id)?;
        self.conn.execute("DELETE FROM reviews WHERE id = ?1", [id])?;
        self.conn.execute("UPDATE meta SET value = value + 1 WHERE key = 'version'", [])?;
        Ok(())
    }

    fn review_exists(&self, id: i64) -> Result<()> {
        let found: Option<i64> = self.conn.query_row("SELECT id FROM reviews WHERE id = ?1", [id], |row| row.get(0)).optional()?;
        found.map(|_| ()).ok_or_else(|| not_found("review", id))
    }

    pub fn reviews(&self) -> Result<Vec<ReviewSummary>> {
        let mut statement = self.conn.prepare("SELECT id, title, created_at, updated_at, archived FROM reviews ORDER BY updated_at DESC, id DESC")?;
        let rows = statement
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get(2)?, row.get(3)?, row.get::<_, bool>(4)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows.into_iter()
            .map(|(id, title, created_at, updated_at, archived)| {
                let items = self.items_of(id)?;
                let count = |state| items.iter().filter(|item| item.state == state).count() as i64;
                Ok(ReviewSummary {
                    id,
                    title,
                    created_at,
                    updated_at,
                    archived,
                    total: items.len() as i64,
                    needs_review: count(ItemState::NeedsReview),
                    reviewed: count(ItemState::Reviewed),
                    approved: count(ItemState::Approved),
                    cover: items.first().map(|item| item.latest().image.clone()),
                })
            })
            .collect()
    }

    pub fn review(&self, id: i64) -> Result<Review> {
        let found = self
            .conn
            .query_row("SELECT title, created_at, archived FROM reviews WHERE id = ?1", [id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, bool>(2)?))
            })
            .optional()?;
        let (title, created_at, archived) = found.ok_or_else(|| not_found("review", id))?;
        Ok(Review { id, title, created_at, archived, items: self.items_of(id)? })
    }

    fn review_title(&self, id: i64) -> Result<String> {
        Ok(self.conn.query_row("SELECT title FROM reviews WHERE id = ?1", [id], |row| row.get(0))?)
    }

    // ---------- items ----------

    fn items_of(&self, review_id: i64) -> Result<Vec<Item>> {
        let mut statement = self.conn.prepare("SELECT id FROM items WHERE review_id = ?1 ORDER BY id")?;
        let ids = statement.query_map([review_id], |row| row.get::<_, i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        ids.into_iter().map(|id| self.item(id)).collect()
    }

    pub fn item(&self, id: i64) -> Result<Item> {
        let found = self
            .conn
            .query_row("SELECT review_id, name, approved_at FROM items WHERE id = ?1", [id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<i64>>(2)?))
            })
            .optional()?;
        let (review_id, name, approved_at) = found.ok_or_else(|| not_found("item", id))?;
        let rounds = self.rounds_of(id)?;
        let latest = rounds.last().ok_or_else(|| anyhow!("item {id} has no rounds"))?;
        let state = if approved_at.is_some() {
            ItemState::Approved
        } else if latest.sent_at.is_some() {
            ItemState::Reviewed
        } else {
            ItemState::NeedsReview
        };
        Ok(Item { id, review_id, name, state, approved_at, rounds })
    }

    /// Adds an image to a review as a new item, on its first round.
    pub fn add_image(&self, review_id: i64, name: &str, bytes: &[u8]) -> Result<i64> {
        self.review_exists(review_id)?;
        let (file, width, height) = self.save_image(bytes)?;
        let at = now();
        self.conn.execute("INSERT INTO items (review_id, name, created_at) VALUES (?1, ?2, ?3)", params![review_id, name, at])?;
        let item_id = self.conn.last_insert_rowid();
        self.insert_round(item_id, 1, &file, width, height, "")?;
        self.changed(review_id)?;
        Ok(item_id)
    }

    pub fn delete_item(&self, id: i64) -> Result<()> {
        let item = self.item(id)?;
        self.conn.execute("DELETE FROM items WHERE id = ?1", [id])?;
        self.changed(item.review_id)
    }

    // ---------- rounds ----------

    fn rounds_of(&self, item_id: i64) -> Result<Vec<Round>> {
        let mut statement = self.conn.prepare(
            "SELECT id, item_id, number, image, width, height, ai_note, annotations, note, sent_at, created_at
             FROM rounds WHERE item_id = ?1 ORDER BY number",
        )?;
        let rounds = statement.query_map([item_id], round_from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rounds)
    }

    pub fn round(&self, id: i64) -> Result<Round> {
        self.conn
            .query_row(
                "SELECT id, item_id, number, image, width, height, ai_note, annotations, note, sent_at, created_at
                 FROM rounds WHERE id = ?1",
                [id],
                round_from_row,
            )
            .optional()?
            .ok_or_else(|| not_found("round", id))
    }

    fn insert_round(&self, item_id: i64, number: i64, file: &str, width: u32, height: u32, ai_note: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO rounds (item_id, number, image, width, height, ai_note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item_id, number, file, width, height, ai_note, now()],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Saves the person's marks on a round they haven't sent yet.
    pub fn save_marks(&self, round_id: i64, annotations: &[Annotation], note: &str) -> Result<()> {
        let round = self.round(round_id)?;
        let item = self.item(round.item_id)?;
        if round.id != item.latest().id || item.state != ItemState::NeedsReview {
            bail!("round {round_id} can't be marked up any more: it's been sent or answered");
        }
        let json = serde_json::to_string(annotations)?;
        self.conn.execute("UPDATE rounds SET annotations = ?1, note = ?2 WHERE id = ?3", params![json, note, round_id])?;
        self.changed(item.review_id)
    }

    /// Marks the item's latest round as reviewed.
    pub fn send(&self, item_id: i64) -> Result<()> {
        let item = self.item(item_id)?;
        if item.state != ItemState::NeedsReview {
            bail!("item {item_id} is {}, so it can't be marked as reviewed", item.state.label());
        }
        let latest = item.latest();
        if latest.annotations.is_empty() && latest.note.trim().is_empty() {
            bail!("item {item_id} has no marks or note yet");
        }
        self.conn.execute("UPDATE rounds SET sent_at = ?1 WHERE id = ?2", params![now(), latest.id])?;
        self.changed(item.review_id)
    }

    /// Finishes the review: marks every item with marks or a note as reviewed.
    pub fn send_all(&self, review_id: i64) -> Result<Vec<i64>> {
        let review = self.review(review_id)?;
        let ready: Vec<i64> = review
            .items
            .iter()
            .filter(|item| item.state == ItemState::NeedsReview)
            .filter(|item| !item.latest().annotations.is_empty() || !item.latest().note.trim().is_empty())
            .map(|item| item.id)
            .collect();
        for id in &ready {
            self.send(*id)?;
        }
        Ok(ready)
    }

    /// Reopens a reviewed round, as long as no new version has come in.
    pub fn unsend(&self, item_id: i64) -> Result<()> {
        let item = self.item(item_id)?;
        if item.state != ItemState::Reviewed {
            bail!("item {item_id} is {}, not reviewed", item.state.label());
        }
        self.conn.execute("UPDATE rounds SET sent_at = NULL WHERE id = ?1", [item.latest().id])?;
        self.changed(item.review_id)
    }

    pub fn approve(&self, item_id: i64) -> Result<()> {
        let item = self.item(item_id)?;
        self.conn.execute("UPDATE items SET approved_at = ?1 WHERE id = ?2", params![now(), item_id])?;
        self.changed(item.review_id)
    }

    pub fn reopen(&self, item_id: i64) -> Result<()> {
        let item = self.item(item_id)?;
        self.conn.execute("UPDATE items SET approved_at = NULL WHERE id = ?1", [item_id])?;
        self.changed(item.review_id)
    }

    /// A new version of the image, which starts the next round.
    /// Answers an item with a new image. `replies` answer the person's marks
    /// one by one, by number (1 is the first mark), and show under each note.
    pub fn respond(&self, item_id: i64, bytes: &[u8], note: &str, replies: &[(usize, String)]) -> Result<Round> {
        let item = self.item(item_id)?;
        if item.state == ItemState::Approved {
            bail!("item {item_id} is already approved");
        }
        let latest = item.latest();
        if !replies.is_empty() {
            let mut marks = latest.annotations.clone();
            for (number, reply) in replies {
                let count = marks.len();
                let mark = number.checked_sub(1).and_then(|i| marks.get_mut(i));
                let Some(mark) = mark else { bail!("there's no mark {number}: round {} has {count}", latest.number) };
                mark.reply = reply.trim().to_string();
            }
            self.conn.execute("UPDATE rounds SET annotations = ?1 WHERE id = ?2", params![serde_json::to_string(&marks)?, latest.id])?;
        }
        let (file, width, height) = self.save_image(bytes)?;
        if latest.sent_at.is_none() {
            // Answering without being asked: close the open round so it reads as sent.
            self.conn.execute("UPDATE rounds SET sent_at = ?1 WHERE id = ?2", params![now(), latest.id])?;
        }
        let round_id = self.insert_round(item_id, latest.number + 1, &file, width, height, note)?;
        self.changed(item.review_id)?;
        self.round(round_id)
    }

    /// Every reviewed item waiting for a new version, optionally only in one review.
    pub fn inbox(&self, review_id: Option<i64>) -> Result<Vec<Request>> {
        let reviews: Vec<(i64, String)> = match review_id {
            Some(id) => vec![(id, self.review_title(id).map_err(|_| not_found("review", id))?)],
            None => self.reviews()?.into_iter().filter(|r| !r.archived).map(|r| (r.id, r.title)).collect(),
        };
        let mut requests = vec![];
        for (id, title) in reviews {
            for item in self.items_of(id)? {
                if item.state == ItemState::Reviewed {
                    let round = item.latest().clone();
                    let image = self.image_path(&round.image).display().to_string();
                    requests.push(Request::from(&title, &item, &round, image));
                }
            }
        }
        Ok(requests)
    }

    pub fn request(&self, item_id: i64) -> Result<Request> {
        let item = self.item(item_id)?;
        let title = self.review_title(item.review_id)?;
        // The round to work from: the latest reviewed one.
        let round = item.rounds.iter().rev().find(|round| round.sent_at.is_some()).unwrap_or(item.latest()).clone();
        let image = self.image_path(&round.image).display().to_string();
        Ok(Request::from(&title, &item, &round, image))
    }

    fn save_image(&self, bytes: &[u8]) -> Result<(String, u32, u32)> {
        let reader = image::ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
        let format = reader.format().ok_or_else(|| anyhow!("that file isn't an image Mimesis can read (png, jpeg, webp, gif)"))?;
        let (width, height) = reader.into_dimensions().context("can't read the image's size")?;
        let extension = format.extensions_str().first().copied().unwrap_or("img");
        let hash = Sha256::digest(bytes);
        let hex: String = hash.iter().take(12).map(|b| format!("{b:02x}")).collect();
        let file = format!("{hex}.{extension}");
        let path = self.images.join(&file);
        if !path.exists() {
            let partial = self.images.join(format!(".{file}.part"));
            std::fs::write(&partial, bytes)?;
            std::fs::rename(&partial, &path)?;
        }
        Ok((file, width, height))
    }
}

fn round_from_row(row: &rusqlite::Row) -> rusqlite::Result<Round> {
    let annotations: String = row.get(7)?;
    Ok(Round {
        id: row.get(0)?,
        item_id: row.get(1)?,
        number: row.get(2)?,
        image: row.get(3)?,
        width: row.get(4)?,
        height: row.get(5)?,
        ai_note: row.get(6)?,
        annotations: serde_json::from_str(&annotations).unwrap_or_default(),
        note: row.get(8)?,
        sent_at: row.get(9)?,
        created_at: row.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Shape;

    fn png(width: u32, height: u32, shade: u8) -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(width, height, image::Rgba([shade, shade, shade, 255]));
        let mut bytes = vec![];
        image.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png).unwrap();
        bytes
    }

    fn temp_store() -> (Store, PathBuf) {
        let folder = std::env::temp_dir().join(format!("mimesis-test-{}-{}", std::process::id(), rand_suffix()));
        (Store::open_at(&folder).unwrap(), folder)
    }

    fn rand_suffix() -> u128 {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    }

    fn mark(note: &str) -> Annotation {
        Annotation { id: "a".into(), color: "#ef4444".into(), note: note.into(), reply: String::new(), shape: Shape::Rect { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }
    }

    #[test]
    fn a_round_trip_goes_needs_review_then_reviewed_then_back() {
        let (store, folder) = temp_store();
        let review = store.create_review("Icons").unwrap();
        let item = store.add_image(review, "a.png", &png(40, 20, 10)).unwrap();
        assert_eq!(store.item(item).unwrap().state, ItemState::NeedsReview);
        assert!(store.send(item).is_err(), "nothing to send yet");

        let round = store.item(item).unwrap().latest().id;
        store.save_marks(round, &[mark("bigger")], "").unwrap();
        store.send(item).unwrap();
        assert_eq!(store.item(item).unwrap().state, ItemState::Reviewed);
        assert!(store.save_marks(round, &[], "").is_err(), "sent rounds are locked");

        let inbox = store.inbox(None).unwrap();
        assert_eq!(inbox.len(), 1);
        assert_eq!(inbox[0].marks[0].area, [4, 2, 24, 12]);

        assert!(store.respond(item, &png(40, 20, 200), "", &[(2, "no such mark".into())]).is_err());
        let next = store.respond(item, &png(40, 20, 200), "made it bigger", &[(1, "Doubled it".into())]).unwrap();
        assert_eq!(next.number, 2);
        assert_eq!(store.round(round).unwrap().annotations[0].reply, "Doubled it");
        let after = store.item(item).unwrap();
        assert_eq!(after.state, ItemState::NeedsReview);
        assert!(store.inbox(None).unwrap().is_empty());

        store.approve(item).unwrap();
        assert_eq!(store.item(item).unwrap().state, ItemState::Approved);
        std::fs::remove_dir_all(folder).ok();
    }

    #[test]
    fn send_all_only_sends_marked_items() {
        let (store, folder) = temp_store();
        let review = store.create_review("Batch").unwrap();
        let marked = store.add_image(review, "a.png", &png(10, 10, 1)).unwrap();
        let _unmarked = store.add_image(review, "b.png", &png(10, 10, 2)).unwrap();
        store.save_marks(store.item(marked).unwrap().latest().id, &[], "warmer colours").unwrap();
        assert_eq!(store.send_all(review).unwrap(), vec![marked]);
        std::fs::remove_dir_all(folder).ok();
    }
}
