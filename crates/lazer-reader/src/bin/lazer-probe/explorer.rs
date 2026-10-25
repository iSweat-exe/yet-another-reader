//! Browsing the game's object graph: what a discovery session needs.
//!
//! Objects are identified by a *path* from the root object (field names and `[index]` of arrays),
//! never by address: the garbage collector moves objects, a path stays valid. A path starting with
//! `@<hex>` begins at that address instead of the root.

use std::collections::{HashSet, VecDeque};
use std::time::{Duration, Instant};

use lazer_reader::clr::Clr;

/// Longest array shown element by element.
const MAX_ELEMENTS: usize = 300;
/// A search gives up after this many objects or this long.
const SEARCH_OBJECTS: usize = 60_000;
const SEARCH_TIME: Duration = Duration::from_secs(10);
const SEARCH_HITS: usize = 300;
/// Matches kept before ranking.
const SEARCH_COLLECT: usize = 20_000;

#[derive(Debug, Clone)]
pub struct Row {
    /// Path segment that leads to this row (`None` for rows that cannot be pinned).
    pub seg: Option<String>,
    pub label: String,
    pub ty: String,
    pub value: String,
    /// Object this row points at, when it is a reference to a live object.
    pub child: Option<u64>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct View {
    pub addr: u64,
    pub type_name: String,
    pub rows: Vec<Row>,
}

#[derive(Debug, Clone)]
pub struct Hit {
    pub path: Vec<String>,
    pub ty: String,
    pub value: String,
}

/// A path for display: `a.b[0].c`.
pub fn show_path(path: &[String]) -> String {
    path.join(".").replace(".[", "[")
}

pub fn resolve(clr: &Clr, root: u64, path: &[String]) -> Result<u64, String> {
    let mut cur = root;
    for (i, seg) in path.iter().enumerate() {
        if let Some(hex) = seg.strip_prefix('@') {
            cur = u64::from_str_radix(hex.trim_start_matches("0x"), 16)
                .map_err(|_| format!("bad address {seg}"))?;
            continue;
        }
        let here = || path[..=i].join(".");
        if let Some(index) = seg.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
            let index: usize = index.parse().map_err(|_| format!("bad index {seg}"))?;
            let (first, len, stride) = clr
                .array_layout(cur)
                .ok_or_else(|| format!("{} is not an array", path[..i].join(".")))?;
            if index >= len || stride != 8 {
                return Err(format!("{} is out of range or not a reference", here()));
            }
            cur = clr
                .process
                .read_u64(first + 8 * index as u64)
                .map_err(|e| e.to_string())?;
            if cur == 0 {
                return Err(format!("null at {}", here()));
            }
        } else {
            cur = clr
                .field_ref(cur, seg)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("null at {}", here()))?;
        }
    }
    Ok(cur)
}

pub fn browse(clr: &Clr, root: u64, path: &[String]) -> Result<View, String> {
    view(clr, resolve(clr, root, path)?)
}

/// The value of a pinned field (`path` ends with the field's own name).
pub fn read_pin(clr: &Clr, root: u64, path: &[String]) -> Result<(String, String), String> {
    let (last, parent) = path.split_last().ok_or("empty path")?;
    let view = browse(clr, root, parent)?;
    view.rows
        .into_iter()
        .find(|r| r.seg.as_deref() == Some(last))
        .map(|r| (r.value, r.ty))
        .ok_or_else(|| format!("no field {last}"))
}

pub fn view(clr: &Clr, addr: u64) -> Result<View, String> {
    let mt = clr
        .object_mt(addr)
        .ok_or_else(|| format!("{addr:#x} is not a managed object"))?;
    let type_name = clr.type_name(mt);
    let mut rows = Vec::new();
    if let Some((first, len, stride)) = clr.array_layout(addr) {
        for i in 0..len.min(MAX_ELEMENTS) {
            let at = first + (i * stride) as u64;
            let bytes = clr
                .process
                .read_bytes(at, stride.min(8))
                .unwrap_or_default();
            let (value, child) = match stride {
                8 if bytes.len() == 8 => {
                    let p = u64::from_le_bytes(bytes[..8].try_into().unwrap_or_default());
                    reference(clr, p)
                }
                1 | 2 | 4 => (int_text(&bytes), None),
                _ => (hex(&bytes), None),
            };
            rows.push(Row {
                seg: (stride == 8).then(|| format!("[{i}]")),
                label: format!("[{i}]"),
                ty: format!("{stride} B"),
                value,
                child,
                offset: None,
            });
        }
        if len > MAX_ELEMENTS {
            rows.push(Row {
                seg: None,
                label: "…".into(),
                ty: String::new(),
                value: format!("{} more elements", len - MAX_ELEMENTS),
                child: None,
                offset: None,
            });
        }
        return Ok(View {
            addr,
            type_name,
            rows,
        });
    }
    let layout = clr.layout_of(mt).map_err(|e| e.to_string())?;
    let mut fields: Vec<_> = layout.iter().collect();
    fields.sort_by_key(|(name, f)| (f.offset, (*name).clone()));
    for (name, f) in fields {
        let at = addr + u64::from(f.offset);
        let bytes = clr.process.read_bytes(at, 8).unwrap_or_default();
        let (value, child) = if bytes.len() < 8 {
            ("<unreadable>".to_owned(), None)
        } else if f.elem_type == 0x11 && f.mt_of_type != 0 {
            (struct_value(clr, at, f.mt_of_type, 0), None)
        } else {
            field_value(clr, f.elem_type, &bytes)
        };
        let ty = match f.elem_type {
            0x12 | 0x11 | 0x15 if f.mt_of_type != 0 => clr.type_name(f.mt_of_type),
            other => elem_name(other).to_owned(),
        };
        rows.push(Row {
            seg: Some(name.clone()),
            label: name.clone(),
            ty,
            value,
            child,
            offset: Some(f.offset),
        });
    }
    Ok(View {
        addr,
        type_name,
        rows,
    })
}

fn field_value(clr: &Clr, elem: u32, b: &[u8]) -> (String, Option<u64>) {
    let u64v = u64::from_le_bytes(b[..8].try_into().unwrap_or_default());
    let u32v = u32::from_le_bytes(b[..4].try_into().unwrap_or_default());
    let text = match elem {
        0x02 => return (if b[0] == 0 { "false" } else { "true" }.to_owned(), None),
        0x03 => format!(
            "{:?}",
            char::from_u32(u32::from(u16::from_le_bytes([b[0], b[1]]))).unwrap_or('?')
        ),
        0x04 => (b[0] as i8).to_string(),
        0x05 => b[0].to_string(),
        0x06 => i16::from_le_bytes([b[0], b[1]]).to_string(),
        0x07 => u16::from_le_bytes([b[0], b[1]]).to_string(),
        0x08 => (u32v as i32).to_string(),
        0x09 => u32v.to_string(),
        0x0a => (u64v as i64).to_string(),
        0x0b => u64v.to_string(),
        0x0c => f32::from_bits(u32v).to_string(),
        0x0d => f64::from_bits(u64v).to_string(),
        // Enums and small structs are inline: show the first word both ways.
        0x11 => format!("{} ({u64v:#x})", u32v as i32),
        0x12 | 0x1d | 0x0e | 0x1c | 0x15 => return reference(clr, u64v),
        _ => format!("{u64v:#x}"),
    };
    (text, None)
}

/// The element type of a primitive named in a generic argument (`System.Int32` is `0x08`).
fn primitive_elem(type_name: &str) -> Option<u32> {
    Some(match type_name {
        "System.Boolean" => 0x02,
        "System.Byte" => 0x05,
        "System.Int16" => 0x06,
        "System.UInt16" => 0x07,
        "System.Int32" => 0x08,
        "System.UInt32" => 0x09,
        "System.Int64" => 0x0a,
        "System.UInt64" => 0x0b,
        "System.Single" => 0x0c,
        "System.Double" => 0x0d,
        _ => return None,
    })
}

/// `System.Nullable`1[[System.Int32, ...]]` gives `System.Int32`.
fn generic_argument(type_name: &str) -> Option<&str> {
    let start = type_name.find("[[")? + 2;
    let end = type_name[start..].find([',', ']'])? + start;
    Some(&type_name[start..end])
}

/// A `System.Decimal`: `flags` (sign and scale), then the 96-bit integer as `hi32` and `lo64`.
fn decimal_text(clr: &Clr, at: u64) -> String {
    let Ok(b) = clr.process.read_bytes(at, 16) else {
        return "<unreadable>".into();
    };
    let flags = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
    let hi = u32::from_le_bytes([b[4], b[5], b[6], b[7]]);
    let lo = u64::from_le_bytes(b[8..16].try_into().unwrap_or_default());
    let mantissa = (u128::from(hi) << 64) | u128::from(lo);
    let scale = (flags >> 16) & 0xff;
    let value = mantissa as f64 / 10f64.powi(scale as i32);
    format!("{}{value}", if flags >> 31 == 1 { "-" } else { "" })
}

/// A value type stored inline: its fields by name, or just the value for `Nullable<T>`
/// (`null` when it has none). Padding bytes are never shown.
fn struct_value(clr: &Clr, at: u64, mt: u64, depth: usize) -> String {
    let name = clr.type_name(mt);
    if name == "System.Decimal" {
        return decimal_text(clr, at);
    }
    let Ok(layout) = clr.layout_of(mt) else {
        return format!("{name} (struct)");
    };
    let mut fields: Vec<_> = layout.iter().collect();
    fields.sort_by_key(|(_, f)| f.offset);
    if fields.len() > 8 || depth > 3 {
        return format!("{name} (struct)");
    }
    let nullable = name.starts_with("System.Nullable`1");
    let inner = generic_argument(&name).and_then(primitive_elem);
    let mut parts = Vec::new();
    let mut has_value = true;
    for (field, f) in fields {
        // Offsets include the 8-byte header an object has and an inline struct does not.
        let fat = at + u64::from(f.offset.saturating_sub(8));
        let text = match f.elem_type {
            0x11 if f.mt_of_type != 0 => struct_value(clr, fat, f.mt_of_type, depth + 1),
            elem => {
                let Ok(raw) = clr.process.read_bytes(fat, 8) else {
                    return format!("{name} (unreadable)");
                };
                // A generic `T value` has no concrete element type of its own.
                let elem = if matches!(elem, 0x13 | 0x1e) {
                    inner.unwrap_or(0)
                } else {
                    elem
                };
                field_value(clr, elem, &raw).0
            }
        };
        if nullable && field.eq_ignore_ascii_case("hasValue") {
            has_value = text == "true";
        } else if nullable {
            parts.push(text);
        } else {
            let short = field
                .trim_start_matches('<')
                .split('>')
                .next()
                .unwrap_or(field);
            parts.push(format!("{short} = {text}"));
        }
    }
    if nullable {
        return if has_value {
            parts.join(" ")
        } else {
            "null".into()
        };
    }
    format!("{{ {} }}", parts.join(", "))
}

/// Text for a reference value, and the object when it points at a live one.
fn reference(clr: &Clr, p: u64) -> (String, Option<u64>) {
    if p == 0 {
        return ("null".to_owned(), None);
    }
    let Some(mt) = clr.object_mt(p) else {
        return (format!("{p:#x} (not an object)"), None);
    };
    let name = clr.type_name(mt);
    if name == "System.String" {
        let text = clr.read_string(p).unwrap_or_default();
        return (format!("{text:?}"), None);
    }
    // A Bindable-like wrapper: show what it holds without drilling in.
    let mut text = format!("{name} @ {p:#x}");
    if let Ok(layout) = clr.layout_of(mt)
        && let Some(f) = layout
            .get("value")
            .filter(|f| matches!(f.elem_type, 0x02..=0x0d))
        && let Ok(raw) = clr.process.read_bytes(p + u64::from(f.offset), 8)
    {
        text = format!("{name} = {}", field_value(clr, f.elem_type, &raw).0);
    }
    (text, Some(p))
}

fn elem_name(elem: u32) -> &'static str {
    match elem {
        0x02 => "bool",
        0x03 => "char",
        0x04 => "i8",
        0x05 => "u8",
        0x06 => "i16",
        0x07 => "u16",
        0x08 => "i32",
        0x09 => "u32",
        0x0a => "i64",
        0x0b => "u64",
        0x0c => "f32",
        0x0d => "f64",
        0x0e => "string",
        0x11 => "struct",
        0x12 => "object",
        0x15 => "generic",
        0x18 | 0x19 => "ptr",
        0x1c => "object",
        0x1d => "array",
        _ => "?",
    }
}

fn int_text(b: &[u8]) -> String {
    match b.len() {
        1 => b[0].to_string(),
        2 => i16::from_le_bytes([b[0], b[1]]).to_string(),
        4 => format!(
            "{} ({:#x})",
            i32::from_le_bytes([b[0], b[1], b[2], b[3]]),
            u32::from_le_bytes([b[0], b[1], b[2], b[3]])
        ),
        _ => hex(b),
    }
}

fn hex(b: &[u8]) -> String {
    b.iter()
        .map(|x| format!("{x:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// The words of an identifier, lowercase: `<CursorPosition>k__BackingField` gives
/// `cursor position`, `lastMouse_pos2` gives `last mouse pos 2`.
fn name_words(text: &str) -> Vec<String> {
    let text = text.replace("k__BackingField", " ");
    let mut words: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut prev: Option<char> = None;
    for c in text.chars() {
        let boundary = !c.is_alphanumeric()
            || prev.is_some_and(|p| {
                (p.is_lowercase() && c.is_uppercase())
                    || (p.is_alphabetic() != c.is_alphabetic() && p.is_alphanumeric())
            });
        if boundary && !cur.is_empty() {
            words.push(std::mem::take(&mut cur));
        }
        if c.is_alphanumeric() {
            cur.extend(c.to_lowercase());
        }
        prev = Some(c);
    }
    if !cur.is_empty() {
        words.push(cur);
    }
    words
}

/// Words that stand for the same thing in the game's code.
const SYNONYMS: &[&[&str]] = &[
    &["cursor", "mouse", "pointer"],
    &["pos", "position", "location", "coords"],
    &["hp", "health"],
    &["acc", "accuracy"],
    &["key", "button"],
    &["time", "clock"],
    &["name", "username"],
    &["map", "beatmap"],
    &["mod", "mods"],
];

/// Whether some word of the name starts with the query word (`pos` finds `Position`, not
/// `Disposed`); a long query word may also sit inside the joined name (`cursorpos`). A synonym
/// (`cursor` for `mouse`) counts too, a little less.
fn hits_name(query: &str, words: &[String]) -> Option<u32> {
    let direct = |q: &str| -> Option<u32> {
        if words.iter().any(|w| w == q) {
            Some(2)
        } else if words.iter().any(|w| w.starts_with(q))
            || (q.len() >= 5 && words.concat().contains(q))
        {
            Some(1)
        } else {
            None
        }
    };
    if let Some(q) = direct(query) {
        return Some(q);
    }
    SYNONYMS
        .iter()
        .filter(|group| group.contains(&query))
        .flat_map(|group| group.iter().filter(|g| **g != query))
        .any(|g| direct(g).is_some())
        .then_some(1)
}

/// How well a row answers the query, `0` when it does not. Every word must be found somewhere
/// (name, type, value, or the names on the way there), in any order, as the start of a word:
/// `cursor pos` finds `CursorPosition` and `Cursor.Position`. At least one word has to be in the
/// field's own name or value, so a field is not found only because of where it lives.
fn score(query: &[String], path: &[String], row: &Row, depth: usize) -> u32 {
    let label = name_words(&row.label);
    let ty = name_words(&row.ty);
    // The value of a reference is only its type name: searching it would repeat the type match.
    let value = if row.child.is_some() {
        Vec::new()
    } else {
        name_words(&row.value)
    };
    let ancestors: Vec<String> = path.iter().flat_map(|s| name_words(s)).collect();
    let (mut total, mut leaf, mut in_label) = (0u32, false, 0usize);
    for word in query {
        let points = if let Some(q) = hits_name(word, &label) {
            leaf = true;
            in_label += 1;
            8 + 6 * q
        } else if hits_name(word, &ancestors).is_some() {
            5
        } else if hits_name(word, &ty).is_some() {
            4
        } else if hits_name(word, &value).is_some() {
            leaf = true;
            3
        } else {
            return 0;
        };
        total += points;
    }
    if !leaf {
        return 0;
    }
    // Everything said in the name itself is the best answer; shallow beats deep.
    if in_label == query.len() {
        total += 20;
    }
    (total + 8).saturating_sub(depth as u32).max(1)
}

/// Breadth-first search of the object graph from the root: finds the fields that answer `query`
/// (see [`score`]), best first, with the path that leads to each.
pub fn search(clr: &Clr, root: u64, query: &str, max_depth: usize) -> (Vec<Hit>, String) {
    let words: Vec<String> = query
        .split(|c: char| c.is_whitespace() || c == '.')
        .map(str::to_lowercase)
        .filter(|w| !w.is_empty())
        .collect();
    if words.is_empty() {
        return (Vec::new(), "nothing to search".into());
    }
    let started = Instant::now();
    let mut seen: HashSet<u64> = HashSet::from([root]);
    let mut queue = VecDeque::from([(root, Vec::<String>::new())]);
    let mut scored: Vec<(u32, Hit)> = Vec::new();
    let mut visited = 0usize;
    let mut note = String::new();
    while let Some((addr, path)) = queue.pop_front() {
        if visited >= SEARCH_OBJECTS || started.elapsed() > SEARCH_TIME {
            note = format!(
                "stopped early after {visited} objects: refine the search or lower the depth"
            );
            break;
        }
        visited += 1;
        let Ok(v) = view(clr, addr) else { continue };
        for row in v.rows {
            let Some(seg) = row.seg.clone() else { continue };
            let mut p = path.clone();
            p.push(seg);
            let points = score(&words, &path, &row, path.len());
            if points > 0 && scored.len() < SEARCH_COLLECT {
                scored.push((
                    points,
                    Hit {
                        path: p.clone(),
                        ty: row.ty.clone(),
                        value: row.value.clone(),
                    },
                ));
            }
            if let Some(child) = row.child
                && path.len() < max_depth
                && seen.insert(child)
            {
                queue.push_back((child, p));
            }
        }
    }
    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| a.1.path.len().cmp(&b.1.path.len()))
    });
    // The same field of the same type reached through several parents says nothing new.
    let mut shown = HashSet::new();
    scored.retain(|(_, h)| shown.insert((h.path.last().cloned(), h.ty.clone())));
    let total = scored.len();
    let hits: Vec<Hit> = scored
        .into_iter()
        .take(SEARCH_HITS)
        .map(|(_, h)| h)
        .collect();
    if note.is_empty() {
        note = format!(
            "{total} matches in {visited} objects, {:?}",
            started.elapsed()
        );
    }
    (hits, note)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(label: &str, ty: &str, value: &str, child: bool) -> Row {
        Row {
            seg: Some(label.into()),
            label: label.into(),
            ty: ty.into(),
            value: value.into(),
            child: child.then_some(1),
            offset: None,
        }
    }

    fn words(q: &str) -> Vec<String> {
        q.split_whitespace().map(str::to_lowercase).collect()
    }

    #[test]
    fn score_should_match_words_in_any_order_inside_longer_names() {
        let r = row(
            "<CursorPosition>k__BackingField",
            "Vector2",
            "(1, 2)",
            false,
        );
        assert!(score(&words("cursor pos"), &[], &r, 2) > 0);
        assert!(score(&words("pos cursor"), &[], &r, 2) > 0);
        assert_eq!(score(&words("cursor banana"), &[], &r, 2), 0);
    }

    #[test]
    fn score_should_not_match_inside_a_word() {
        let r = row("<IsDisposed>k__BackingField", "bool", "false", false);
        assert_eq!(score(&words("pos"), &[], &r, 1), 0);
    }

    #[test]
    fn score_should_not_find_a_field_only_by_where_it_lives() {
        let r = row("IsDisposed", "bool", "false", false);
        let path = vec!["CursorDisplay".to_owned()];
        assert_eq!(score(&words("cursor"), &path, &r, 2), 0);
    }

    #[test]
    fn score_should_prefer_the_name_over_the_type() {
        let named = row("MousePosition", "Vector2", "0", false);
        let typed = row("Other", "MousePositionState", "0", false);
        let q = words("mouse position");
        assert!(score(&q, &[], &named, 1) > score(&q, &[], &typed, 1));
    }

    #[test]
    fn score_should_use_the_path_to_the_field() {
        let r = row("X", "f32", "3", false);
        let path = vec!["Mouse".to_owned(), "Position".to_owned()];
        assert!(score(&words("mouse position x"), &path, &r, 3) > 0);
    }
}
