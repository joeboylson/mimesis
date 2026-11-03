//! Draws a round's marks onto its image, so an AI that can only look at
//! pictures sees exactly what the person drew. Each mark gets a numbered
//! badge, and the notes are listed under the image against those numbers.

use ab_glyph::{point, Font, FontRef, PxScale, ScaleFont};
use anyhow::{Context, Result};
use tiny_skia::{
    Color, FillRule, LineCap, LineJoin, Mask, Paint, PathBuilder, Pixmap, Rect, Stroke, Transform,
};

use crate::model::{Annotation, Round, Shape};

const FONT: &[u8] = include_bytes!("../assets/Geist.ttf");

pub fn bake(image_bytes: &[u8], round: &Round) -> Result<Vec<u8>> {
    let image = image::load_from_memory(image_bytes).context("can't read the image")?.to_rgba8();
    let (width, height) = image.dimensions();
    let font = FontRef::try_from_slice(FONT)?;
    let unit = (width.min(height) as f32 / 160.0).max(2.0);

    let notes: Vec<(usize, &Annotation)> = round
        .annotations
        .iter()
        .enumerate()
        .filter(|(_, a)| !a.note.trim().is_empty())
        .map(|(i, a)| (i + 1, a))
        .collect();
    let legend = Legend::layout(&font, width as f32, unit, &notes, &round.note);
    let total_height = height + legend.height.ceil() as u32;

    let mut pixmap = Pixmap::new(width, total_height).context("image too large to draw on")?;
    pixmap.fill(Color::WHITE);
    for (pixel, source) in pixmap.pixels_mut().iter_mut().zip(image.pixels()) {
        let [r, g, b, a] = source.0;
        // Transparent images go on white, so the marks read the same.
        let blend = |c: u8| ((c as u32 * a as u32 + 255 * (255 - a as u32)) / 255) as u8;
        *pixel = tiny_skia::ColorU8::from_rgba(blend(r), blend(g), blend(b), 255).premultiply();
    }

    let size = (width as f32, height as f32);
    for annotation in &round.annotations {
        draw_shape(&mut pixmap, annotation, size, unit);
    }
    for (index, annotation) in round.annotations.iter().enumerate() {
        let (ax, ay) = annotation.shape.anchor();
        let center = (ax * size.0, ay * size.1);
        draw_badge(&mut pixmap, &font, center, unit * 2.6, index + 1, &parse_color(&annotation.color));
    }
    legend.draw(&mut pixmap, &font, height as f32);

    pixmap.encode_png().context("can't write the image")
}

pub fn parse_color(hex: &str) -> Color {
    let hex = hex.trim_start_matches('#');
    let channel = |i: usize| u8::from_str_radix(hex.get(i..i + 2).unwrap_or("00"), 16).unwrap_or(0);
    if hex.len() >= 6 {
        Color::from_rgba8(channel(0), channel(2), channel(4), 255)
    } else {
        Color::from_rgba8(239, 68, 68, 255)
    }
}

fn paint(color: Color) -> Paint<'static> {
    let mut paint = Paint::default();
    paint.set_color(color);
    paint.anti_alias = true;
    paint
}

fn draw_shape(pixmap: &mut Pixmap, annotation: &Annotation, (w, h): (f32, f32), unit: f32) {
    let color = parse_color(&annotation.color);
    let stroke = Stroke { width: unit * 0.6, line_cap: LineCap::Round, line_join: LineJoin::Round, ..Stroke::default() };
    let halo = Stroke { width: stroke.width + unit * 0.8, ..stroke.clone() };
    let mut builder = PathBuilder::new();
    let mut head = None;
    match &annotation.shape {
        Shape::Rect { x, y, w: rw, h: rh } => {
            if let Some(rect) = Rect::from_xywh(x * w, y * h, (rw * w).max(1.0), (rh * h).max(1.0)) {
                builder.push_rect(rect);
            }
        }
        Shape::Ellipse { x, y, w: rw, h: rh } => {
            if let Some(rect) = Rect::from_xywh(x * w, y * h, (rw * w).max(1.0), (rh * h).max(1.0)) {
                builder.push_oval(rect);
            }
        }
        Shape::Arrow { x1, y1, x2, y2 } => {
            let (sx, sy, ex, ey) = (x1 * w, y1 * h, x2 * w, y2 * h);
            builder.move_to(sx, sy);
            builder.line_to(ex, ey);
            let angle = (ey - sy).atan2(ex - sx);
            let length = unit * 4.5;
            let mut tip = PathBuilder::new();
            tip.move_to(ex, ey);
            tip.line_to(ex - length * (angle - 0.45).cos(), ey - length * (angle - 0.45).sin());
            tip.line_to(ex - length * (angle + 0.45).cos(), ey - length * (angle + 0.45).sin());
            tip.close();
            head = tip.finish();
        }
        Shape::Pen { points } => {
            for (i, p) in points.iter().enumerate() {
                if i == 0 {
                    builder.move_to(p[0] * w, p[1] * h);
                } else {
                    builder.line_to(p[0] * w, p[1] * h);
                }
            }
        }
        Shape::Pin { .. } => {}
    }
    let shadow = paint(Color::from_rgba8(255, 255, 255, 170));
    if let Some(path) = builder.finish() {
        pixmap.stroke_path(&path, &shadow, &halo, Transform::identity(), None);
        pixmap.stroke_path(&path, &paint(color), &stroke, Transform::identity(), None);
    }
    if let Some(head) = head {
        pixmap.stroke_path(&head, &shadow, &halo, Transform::identity(), None);
        pixmap.fill_path(&head, &paint(color), FillRule::Winding, Transform::identity(), None);
    }
}

fn draw_badge(pixmap: &mut Pixmap, font: &FontRef, (cx, cy): (f32, f32), radius: f32, number: usize, color: &Color) {
    // Keep the whole badge on the image even when the mark is at an edge.
    let cx = cx.clamp(radius, pixmap.width() as f32 - radius);
    let cy = cy.clamp(radius, pixmap.height() as f32 - radius);
    if let Some(circle) = PathBuilder::from_circle(cx, cy, radius) {
        pixmap.fill_path(&circle, &paint(*color), FillRule::Winding, Transform::identity(), None);
        let ring = Stroke { width: radius * 0.18, ..Stroke::default() };
        pixmap.stroke_path(&circle, &paint(Color::WHITE), &ring, Transform::identity(), None);
    }
    let label = number.to_string();
    let px = radius * 1.15;
    let text_width = measure(font, px, &label);
    let ascent = font.as_scaled(PxScale::from(px)).ascent();
    let text_color = if luminance(color) > 0.6 { Color::BLACK } else { Color::WHITE };
    draw_text(pixmap, font, px, cx - text_width / 2.0, cy + ascent * 0.36, &label, text_color);
}

fn luminance(color: &Color) -> f32 {
    0.299 * color.red() + 0.587 * color.green() + 0.114 * color.blue()
}

fn measure(font: &FontRef, px: f32, text: &str) -> f32 {
    let scaled = font.as_scaled(PxScale::from(px));
    let mut width = 0.0;
    let mut previous = None;
    for c in text.chars() {
        let id = scaled.glyph_id(c);
        if let Some(prev) = previous {
            width += scaled.kern(prev, id);
        }
        width += scaled.h_advance(id);
        previous = Some(id);
    }
    width
}

fn draw_text(pixmap: &mut Pixmap, font: &FontRef, px: f32, x: f32, baseline: f32, text: &str, color: Color) {
    let scaled = font.as_scaled(PxScale::from(px));
    let (width, height) = (pixmap.width(), pixmap.height());
    let Some(mut mask) = Mask::new(width, height) else { return };
    let data = mask.data_mut();
    let mut caret = x;
    let mut previous = None;
    for c in text.chars() {
        let id = scaled.glyph_id(c);
        if let Some(prev) = previous {
            caret += scaled.kern(prev, id);
        }
        let glyph = id.with_scale_and_position(PxScale::from(px), point(caret, baseline));
        if let Some(outlined) = font.outline_glyph(glyph) {
            let bounds = outlined.px_bounds();
            outlined.draw(|gx, gy, coverage| {
                let px = bounds.min.x as i64 + gx as i64;
                let py = bounds.min.y as i64 + gy as i64;
                if px >= 0 && py >= 0 && (px as u32) < width && (py as u32) < height {
                    let index = py as usize * width as usize + px as usize;
                    data[index] = data[index].max((coverage * 255.0) as u8);
                }
            });
        }
        caret += scaled.h_advance(id);
        previous = Some(id);
    }
    if let Some(rect) = Rect::from_xywh(0.0, 0.0, width as f32, height as f32) {
        pixmap.fill_rect(rect, &paint(color), Transform::identity(), Some(&mask));
    }
}

/// The strip under the image: the person's overall note, then one line per
/// numbered mark, wrapped to the image's width.
struct Legend {
    height: f32,
    px: f32,
    pad: f32,
    lines: Vec<LegendLine>,
}

struct LegendLine {
    badge: Option<(usize, Color)>,
    text: String,
    indent: f32,
}

impl Legend {
    fn layout(font: &FontRef, width: f32, unit: f32, notes: &[(usize, &Annotation)], overall: &str) -> Legend {
        let px = (unit * 5.0).clamp(13.0, 34.0);
        let pad = px;
        let badge_space = px * 2.0;
        let mut lines = vec![];
        let overall = overall.trim();
        if !overall.is_empty() {
            for line in wrap(font, px, overall, width - pad * 2.0) {
                lines.push(LegendLine { badge: None, text: line, indent: 0.0 });
            }
        }
        for (number, annotation) in notes {
            for (i, line) in wrap(font, px, annotation.note.trim(), width - pad * 2.0 - badge_space).into_iter().enumerate() {
                let badge = (i == 0).then(|| (*number, parse_color(&annotation.color)));
                lines.push(LegendLine { badge, text: line, indent: badge_space });
            }
        }
        let height = if lines.is_empty() { 0.0 } else { pad * 2.0 + lines.len() as f32 * px * 1.5 };
        Legend { height, px, pad, lines }
    }

    fn draw(&self, pixmap: &mut Pixmap, font: &FontRef, top: f32) {
        if self.lines.is_empty() {
            return;
        }
        if let Some(rule) = Rect::from_xywh(0.0, top, pixmap.width() as f32, (self.px / 10.0).max(1.0)) {
            pixmap.fill_rect(rule, &paint(Color::from_rgba8(210, 210, 210, 255)), Transform::identity(), None);
        }
        let line_height = self.px * 1.5;
        for (i, line) in self.lines.iter().enumerate() {
            let baseline = top + self.pad + line_height * i as f32 + self.px;
            if let Some((number, color)) = line.badge {
                draw_badge(pixmap, font, (self.pad + self.px * 0.7, baseline - self.px * 0.36), self.px * 0.7, number, &color);
            }
            draw_text(pixmap, font, self.px, self.pad + line.indent, baseline, &line.text, Color::from_rgba8(23, 23, 23, 255));
        }
    }
}

fn wrap(font: &FontRef, px: f32, text: &str, width: f32) -> Vec<String> {
    let mut lines = vec![];
    for paragraph in text.lines() {
        let mut line = String::new();
        for word in paragraph.split_whitespace() {
            let candidate = if line.is_empty() { word.to_string() } else { format!("{line} {word}") };
            if !line.is_empty() && measure(font, px, &candidate) > width {
                lines.push(std::mem::take(&mut line));
                line = word.to_string();
            } else {
                line = candidate;
            }
        }
        lines.push(line);
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round(annotations: Vec<Annotation>, note: &str) -> Round {
        Round { id: 1, item_id: 1, number: 1, image: String::new(), width: 200, height: 100, ai_note: String::new(), annotations, note: note.into(), sent_at: None, created_at: 0 }
    }

    fn png() -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(200, 100, image::Rgba([40, 90, 200, 255]));
        let mut bytes = vec![];
        image.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png).unwrap();
        bytes
    }

    #[test]
    fn marks_without_notes_keep_the_image_size() {
        let marks = vec![Annotation { id: "a".into(), color: "#ef4444".into(), note: String::new(), reply: String::new(), shape: Shape::Rect { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } }];
        let baked = image::load_from_memory(&bake(&png(), &round(marks, "")).unwrap()).unwrap();
        assert_eq!((baked.width(), baked.height()), (200, 100));
    }

    #[test]
    fn notes_add_a_strip_below() {
        let marks = vec![
            Annotation { id: "a".into(), color: "#22c55e".into(), note: "make this a lot bigger please".into(), reply: String::new(), shape: Shape::Arrow { x1: 0.1, y1: 0.1, x2: 0.8, y2: 0.8 } },
            Annotation { id: "b".into(), color: "#3b82f6".into(), note: "and this".into(), reply: String::new(), shape: Shape::Pen { points: vec![[0.2, 0.2], [0.3, 0.4]] } },
        ];
        let baked = image::load_from_memory(&bake(&png(), &round(marks, "overall: warmer")).unwrap()).unwrap();
        assert_eq!(baked.width(), 200);
        assert!(baked.height() > 100);
    }
}
