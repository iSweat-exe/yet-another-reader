//! Minimal ECMA-335 metadata reader: just enough of the TypeDef / Field / NestedClass
//! tables to turn names into tokens and back. Works on the metadata blob that the
//! DAC reports for each loaded module (it starts at the `BSJB` signature).

use std::collections::HashMap;

use crate::error::{ReaderError, Result};

const TABLE_MODULE: usize = 0x00;
const TABLE_TYPE_REF: usize = 0x01;
const TABLE_TYPE_DEF: usize = 0x02;
const TABLE_FIELD_PTR: usize = 0x03;
const TABLE_FIELD: usize = 0x04;
const TABLE_METHOD_DEF: usize = 0x06;
const TABLE_MODULE_REF: usize = 0x1a;
const TABLE_ASSEMBLY_REF: usize = 0x23;
const TABLE_TYPE_SPEC: usize = 0x1b;

fn bad(what: &str) -> ReaderError {
    ReaderError::Dac(format!("malformed metadata: {what}"))
}

struct Cursor<'a>(&'a [u8]);

impl<'a> Cursor<'a> {
    fn u16_at(&self, at: usize) -> Result<u16> {
        let b = self.0.get(at..at + 2).ok_or_else(|| bad("truncated"))?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn u32_at(&self, at: usize) -> Result<u32> {
        let b = self.0.get(at..at + 4).ok_or_else(|| bad("truncated"))?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    /// Little-endian index of `width` (2 or 4) bytes.
    fn index_at(&self, at: usize, width: usize) -> Result<u32> {
        if width == 2 {
            self.u16_at(at).map(u32::from)
        } else {
            self.u32_at(at)
        }
    }
}

/// Parsed metadata of one managed module.
#[derive(Debug)]
pub struct Metadata {
    strings: Vec<u8>,
    /// `(namespace, name, first field rid)` per TypeDef (index = rid - 1).
    types: Vec<TypeDef>,
    /// Field names (index = rid - 1).
    fields: Vec<u32>,
    by_name: HashMap<String, u32>,
}

#[derive(Debug, Clone, Copy)]
struct TypeDef {
    name: u32,
    namespace: u32,
    field_list: u32,
}

impl Metadata {
    pub fn parse(blob: &[u8]) -> Result<Self> {
        let c = Cursor(blob);
        if c.u32_at(0)? != 0x424A_5342 {
            return Err(bad("missing BSJB signature"));
        }
        let version_len = c.u32_at(12)? as usize;
        let mut at = 16 + version_len;
        let stream_count = c.u16_at(at + 2)? as usize;
        at += 4;

        let (mut tables, mut strings) = (None, None);
        for _ in 0..stream_count {
            let offset = c.u32_at(at)? as usize;
            let size = c.u32_at(at + 4)? as usize;
            let name_start = at + 8;
            let name_len = blob[name_start..]
                .iter()
                .position(|&b| b == 0)
                .ok_or_else(|| bad("stream name"))?;
            let name = &blob[name_start..name_start + name_len];
            let data = blob
                .get(offset..offset + size)
                .ok_or_else(|| bad("stream range"))?;
            match name {
                b"#~" | b"#-" => tables = Some(data),
                b"#Strings" => strings = Some(data),
                _ => {}
            }
            at = name_start + (name_len + 1).next_multiple_of(4);
        }
        let tables = tables.ok_or_else(|| bad("no #~ stream"))?;
        let strings = strings.ok_or_else(|| bad("no #Strings stream"))?.to_vec();

        let t = Cursor(tables);
        let heap_sizes = *tables.get(6).ok_or_else(|| bad("tables header"))?;
        let valid = u64::from(t.u32_at(8)?) | (u64::from(t.u32_at(12)?) << 32);
        let mut rows = [0u32; 64];
        let mut pos = 24;
        for (table, row) in rows.iter_mut().enumerate() {
            if valid & (1 << table) != 0 {
                *row = t.u32_at(pos)?;
                pos += 4;
            }
        }

        let str_w = if heap_sizes & 1 != 0 { 4 } else { 2 };
        let guid_w = if heap_sizes & 2 != 0 { 4 } else { 2 };
        let blob_w = if heap_sizes & 4 != 0 { 4 } else { 2 };
        let simple = |table: usize| if rows[table] < 0x1_0000 { 2 } else { 4 };
        let coded = |bits: u32, tables: &[usize]| {
            let max = tables.iter().map(|&t| rows[t]).max().unwrap_or(0);
            if max < (1 << (16 - bits)) { 2 } else { 4 }
        };

        let resolution_scope = coded(
            2,
            &[
                TABLE_MODULE,
                TABLE_MODULE_REF,
                TABLE_ASSEMBLY_REF,
                TABLE_TYPE_REF,
            ],
        );
        let type_def_or_ref = coded(2, &[TABLE_TYPE_DEF, TABLE_TYPE_REF, TABLE_TYPE_SPEC]);

        let module_row = 2 + str_w + 3 * guid_w;
        let type_ref_row = resolution_scope + 2 * str_w;
        let type_def_row =
            4 + 2 * str_w + type_def_or_ref + simple(TABLE_FIELD) + simple(TABLE_METHOD_DEF);
        let field_ptr_row = simple(TABLE_FIELD);
        let field_row = 2 + str_w + blob_w;

        let table_start = |index: usize| -> usize {
            let mut p = pos;
            for (i, row_size) in [
                (TABLE_MODULE, module_row),
                (TABLE_TYPE_REF, type_ref_row),
                (TABLE_TYPE_DEF, type_def_row),
                (TABLE_FIELD_PTR, field_ptr_row),
                (TABLE_FIELD, field_row),
            ] {
                if i == index {
                    return p;
                }
                p += rows[i] as usize * row_size;
            }
            p
        };

        let mut types = Vec::with_capacity(rows[TABLE_TYPE_DEF] as usize);
        let mut p = table_start(TABLE_TYPE_DEF);
        for _ in 0..rows[TABLE_TYPE_DEF] {
            let name = t.index_at(p + 4, str_w)?;
            let namespace = t.index_at(p + 4 + str_w, str_w)?;
            let field_list =
                t.index_at(p + 4 + 2 * str_w + type_def_or_ref, simple(TABLE_FIELD))?;
            types.push(TypeDef {
                name,
                namespace,
                field_list,
            });
            p += type_def_row;
        }

        let mut fields = Vec::with_capacity(rows[TABLE_FIELD] as usize);
        let mut p = table_start(TABLE_FIELD);
        for _ in 0..rows[TABLE_FIELD] {
            fields.push(t.index_at(p + 2, str_w)?);
            p += field_row;
        }

        let mut md = Self {
            strings,
            types,
            fields,
            by_name: HashMap::new(),
        };
        let mut by_name = HashMap::with_capacity(md.types.len());
        for rid in 1..=md.types.len() as u32 {
            by_name.entry(md.full_name(rid)).or_insert(rid);
        }
        md.by_name = by_name;
        Ok(md)
    }

    fn string_at(&self, index: u32) -> &str {
        let start = index as usize;
        let Some(rest) = self.strings.get(start..) else {
            return "";
        };
        let end = rest.iter().position(|&b| b == 0).unwrap_or(rest.len());
        std::str::from_utf8(&rest[..end]).unwrap_or("")
    }

    /// `Namespace.Name` of a TypeDef (nested types appear as their simple name).
    #[must_use]
    pub fn full_name(&self, rid: u32) -> String {
        let Some(td) = rid.checked_sub(1).and_then(|i| self.types.get(i as usize)) else {
            return String::new();
        };
        let (ns, name) = (self.string_at(td.namespace), self.string_at(td.name));
        if ns.is_empty() {
            name.to_owned()
        } else {
            format!("{ns}.{name}")
        }
    }

    /// TypeDef rid (the low 24 bits of the `0x02xxxxxx` token) of a fully-qualified name.
    #[must_use]
    pub fn type_rid(&self, full_name: &str) -> Option<u32> {
        self.by_name.get(full_name).copied()
    }

    #[must_use]
    pub fn type_count(&self) -> usize {
        self.types.len()
    }

    /// Name of the field with token `0x04xxxxxx`.
    #[must_use]
    pub fn field_name(&self, token: u32) -> Option<&str> {
        let rid = token.checked_sub(0x0400_0000)?;
        let idx = rid.checked_sub(1)? as usize;
        self.fields.get(idx).map(|&s| self.string_at(s))
    }

    /// Field tokens declared by a TypeDef (rid), in declaration order.
    #[must_use]
    pub fn field_tokens(&self, type_rid: u32) -> Vec<u32> {
        let Some(td) = type_rid
            .checked_sub(1)
            .and_then(|i| self.types.get(i as usize))
        else {
            return Vec::new();
        };
        let start = td.field_list;
        let end = self
            .types
            .get(type_rid as usize)
            .map_or(self.fields.len() as u32 + 1, |n| n.field_list);
        (start..end).map(|rid| 0x0400_0000 | rid).collect()
    }
}
