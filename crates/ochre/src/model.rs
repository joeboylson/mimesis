use serde::{Deserialize, Serialize};

/// One mark on an image. Positions are fractions of the image's width and
/// height (0 to 1), so a mark stays put however big the image is shown.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Annotation {
    pub id: String,
    pub color: String,
    #[serde(default)]
    pub note: String,
    #[serde(flatten)]
    pub shape: Shape,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Shape {
    Rect { x: f32, y: f32, w: f32, h: f32 },
    Ellipse { x: f32, y: f32, w: f32, h: f32 },
    Arrow { x1: f32, y1: f32, x2: f32, y2: f32 },
    Pen { points: Vec<[f32; 2]> },
    Pin { x: f32, y: f32 },
}

impl Shape {
    pub fn kind(&self) -> &'static str {
        match self {
            Shape::Rect { .. } => "rect",
            Shape::Ellipse { .. } => "ellipse",
            Shape::Arrow { .. } => "arrow",
            Shape::Pen { .. } => "pen",
            Shape::Pin { .. } => "pin",
        }
    }

    /// Where the mark's number goes: the corner of a box, an arrow's tail,
    /// the start of a line, or the pin itself.
    pub fn anchor(&self) -> (f32, f32) {
        match self {
            Shape::Rect { x, y, .. } | Shape::Ellipse { x, y, .. } => (*x, *y),
            Shape::Arrow { x1, y1, .. } => (*x1, *y1),
            Shape::Pen { points } => points.first().map(|p| (p[0], p[1])).unwrap_or((0.0, 0.0)),
            Shape::Pin { x, y } => (*x, *y),
        }
    }

    /// The area the mark covers, as fractions: (left, top, right, bottom).
    pub fn bounds(&self) -> (f32, f32, f32, f32) {
        match self {
            Shape::Rect { x, y, w, h } | Shape::Ellipse { x, y, w, h } => (*x, *y, x + w, y + h),
            Shape::Arrow { x1, y1, x2, y2 } => (x1.min(*x2), y1.min(*y2), x1.max(*x2), y1.max(*y2)),
            Shape::Pen { points } => points.iter().fold((1.0, 1.0, 0.0, 0.0), |(l, t, r, b), p| {
                (l.min(p[0]), t.min(p[1]), r.max(p[0]), b.max(p[1]))
            }),
            Shape::Pin { x, y } => (*x, *y, *x, *y),
        }
    }
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ItemState {
    /// The person's turn: look at the image, mark it up or approve it.
    NeedsReview,
    /// The person marked it up and finished; it waits for a new version.
    Reviewed,
    Approved,
}

impl ItemState {
    pub fn label(self) -> &'static str {
        match self {
            ItemState::NeedsReview => "needs review",
            ItemState::Reviewed => "reviewed",
            ItemState::Approved => "approved",
        }
    }
}

/// One pass over an image: the image itself, the note that came with it,
/// and the person's marks on it.
#[derive(Serialize, Clone, Debug)]
pub struct Round {
    pub id: i64,
    pub item_id: i64,
    pub number: i64,
    pub image: String,
    pub width: u32,
    pub height: u32,
    pub ai_note: String,
    pub annotations: Vec<Annotation>,
    pub note: String,
    pub sent_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct Item {
    pub id: i64,
    pub review_id: i64,
    pub name: String,
    pub state: ItemState,
    pub approved_at: Option<i64>,
    pub rounds: Vec<Round>,
}

impl Item {
    pub fn latest(&self) -> &Round {
        self.rounds.last().expect("an item always has a round")
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct ReviewSummary {
    pub id: i64,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived: bool,
    pub total: i64,
    pub needs_review: i64,
    pub reviewed: i64,
    pub approved: i64,
    pub cover: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Review {
    pub id: i64,
    pub title: String,
    pub created_at: i64,
    pub archived: bool,
    pub items: Vec<Item>,
}

/// What whoever makes the next version needs: the marked-up round, with every
/// mark's note and where it sits in pixels.
#[derive(Serialize, Clone, Debug)]
pub struct Request {
    pub item_id: i64,
    pub review_id: i64,
    pub review_title: String,
    pub name: String,
    pub round: i64,
    pub round_id: i64,
    pub width: u32,
    pub height: u32,
    pub image: String,
    pub note: String,
    pub marks: Vec<Mark>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Mark {
    pub number: usize,
    pub kind: &'static str,
    pub color: String,
    pub note: String,
    /// [left, top, right, bottom] in pixels.
    pub area: [u32; 4],
}

impl Request {
    pub fn from(review_title: &str, item: &Item, round: &Round, image_path: String) -> Request {
        let (w, h) = (round.width as f32, round.height as f32);
        let marks = round
            .annotations
            .iter()
            .enumerate()
            .map(|(index, annotation)| {
                let (l, t, r, b) = annotation.shape.bounds();
                let px = |v: f32, size: f32| (v.clamp(0.0, 1.0) * size).round() as u32;
                Mark {
                    number: index + 1,
                    kind: annotation.shape.kind(),
                    color: annotation.color.clone(),
                    note: annotation.note.clone(),
                    area: [px(l, w), px(t, h), px(r, w), px(b, h)],
                }
            })
            .collect();
        Request {
            item_id: item.id,
            review_id: item.review_id,
            review_title: review_title.to_string(),
            name: item.name.clone(),
            round: round.number,
            round_id: round.id,
            width: round.width,
            height: round.height,
            image: image_path,
            note: round.note.clone(),
            marks,
        }
    }
}
