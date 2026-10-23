//! Managed-heap access built on top of the DAC: enumerate objects, resolve type
//! names and field layouts straight from the runtime (no hard-coded offsets).

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::sync::Arc;

use crate::dac::Dac;
use crate::dac::ModuleInfo;
use crate::error::{ReaderError, Result};
use crate::metadata::Metadata;
use crate::process::{Process, Region};

/// A managed assembly's module: DAC info plus parsed metadata.
#[derive(Debug)]
pub struct ManagedModule {
    pub info: ModuleInfo,
    pub metadata: Metadata,
}

const CHUNK: usize = 1 << 20;
/// Pause taken regularly during a scan so it never saturates the memory bus the game is using.
const SCAN_YIELD: std::time::Duration = std::time::Duration::from_millis(2);
/// Chunks scanned between two pauses (about 8 MiB): Windows rounds short sleeps up to ~1-15 ms, so
/// pausing after every chunk would make a scan needlessly slow.
const CHUNKS_PER_YIELD: usize = 8;

/// Size information cached per method table.
#[derive(Debug, Clone, Copy)]
pub struct MtInfo {
    pub base_size: u32,
    pub component_size: u32,
    pub module: u64,
    pub token: u32,
}

/// An instance field as reported by the runtime.
#[derive(Debug, Clone, Copy)]
pub struct Field {
    pub token: u32,
    /// CLR `Module*` that declares the field (its metadata resolves the token).
    pub module: u64,
    pub offset: u32,
    pub elem_type: u32,
    pub mt_of_type: u64,
}

pub struct Clr {
    pub process: Arc<Process>,
    pub dac: Dac,
    mt_cache: RefCell<HashMap<u64, Option<MtInfo>>>,
    metadata_cache: RefCell<HashMap<u64, Rc<Metadata>>>,
    layout_cache: RefCell<HashMap<u64, Rc<HashMap<String, Field>>>>,
}

impl Clr {
    pub fn attach(process: Arc<Process>) -> Result<Self> {
        let exe = process.exe_path()?;
        let dir = exe
            .parent()
            .ok_or_else(|| ReaderError::Dac("game exe has no parent directory".into()))?;
        let dac = Dac::attach(Arc::clone(&process), dir)?;
        Ok(Self {
            process,
            dac,
            mt_cache: RefCell::default(),
            metadata_cache: RefCell::default(),
            layout_cache: RefCell::default(),
        })
    }

    pub fn mt_info(&self, mt: u64) -> Option<MtInfo> {
        *self.mt_cache.borrow_mut().entry(mt).or_insert_with(|| {
            let d = self.dac.method_table(mt).ok()?;
            (d.is_free == 0 || d.base_size != 0).then_some(MtInfo {
                base_size: d.base_size,
                component_size: d.component_size,
                module: d.module,
                token: d.token,
            })
        })
    }

    /// Finds the loaded managed module backed by the given DLL (e.g. `osu.Game.dll`) and
    /// parses its metadata.
    pub fn managed_module(&self, dll: &str) -> Result<ManagedModule> {
        let base = self
            .process
            .module(dll)?
            .ok_or_else(|| ReaderError::Dac(format!("{dll} is not loaded")))?
            .base;
        for addr in self.dac.all_modules()? {
            let Ok(info) = self.dac.module_info(addr) else {
                continue;
            };
            if info.il_base != base || info.metadata_size == 0 {
                continue;
            }
            let blob = self
                .process
                .read_bytes(info.metadata_start, info.metadata_size as usize)?;
            return Ok(ManagedModule {
                info,
                metadata: Metadata::parse(&blob)?,
            });
        }
        Err(ReaderError::Dac(format!("no CLR module matches {dll}")))
    }

    /// MethodTable of a type, via the module's `TypeDef -> MethodTable` map.
    /// `None` if the type is unknown or has not been loaded yet.
    pub fn method_table_of(&self, module: &ManagedModule, full_name: &str) -> Option<u64> {
        let rid = module.metadata.type_rid(full_name)?;
        // The DAC reports the first LookupMap chunk's `pTable`, indexed directly by RID.
        let mt = self
            .process
            .read_u64(module.info.type_def_map + u64::from(rid) * 8)
            .ok()?
            & !7;
        (mt != 0 && self.mt_info(mt).is_some()).then_some(mt)
    }

    /// Every loaded type (in the game's own `osu*.dll` assemblies) that is `base` or derives
    /// from it, as `(method table, full name)`.
    pub fn subclasses_of(&self, base: u64) -> Result<Vec<(u64, String)>> {
        let game_dlls: Vec<u64> = self
            .process
            .modules()?
            .into_iter()
            .filter(|m| m.name.to_ascii_lowercase().starts_with("osu") && m.name.ends_with(".dll"))
            .map(|m| m.base)
            .collect();

        let mut found = Vec::new();
        for addr in self.dac.all_modules()? {
            let Ok(info) = self.dac.module_info(addr) else {
                continue;
            };
            if !game_dlls.contains(&info.il_base) || info.metadata_size == 0 {
                continue;
            }
            let Some(md) = self.module_metadata(addr) else {
                continue;
            };
            for rid in 1..=md.type_count() as u64 {
                let Ok(mt) = self.process.read_u64(info.type_def_map + rid * 8) else {
                    continue;
                };
                let mt = mt & !7;
                if mt != 0 && self.derives_from(mt, base) {
                    found.push((mt, md.full_name(rid as u32)));
                }
            }
        }
        Ok(found)
    }

    pub fn derives_from(&self, mut mt: u64, base: u64) -> bool {
        for _ in 0..24 {
            if mt == base {
                return true;
            }
            match self.dac.method_table(mt) {
                Ok(d) if d.parent != 0 => mt = d.parent,
                _ => return false,
            }
        }
        false
    }

    /// Method table of the object at `addr`, if the header is a valid method table.
    pub fn object_mt(&self, addr: u64) -> Option<u64> {
        let mt = self.process.read_u64(addr).ok()? & !7;
        self.mt_info(mt).map(|_| mt)
    }

    /// Cached `name -> field` layout of an object's runtime type.
    pub fn layout_of(&self, mt: u64) -> Result<Rc<HashMap<String, Field>>> {
        if let Some(l) = self.layout_cache.borrow().get(&mt) {
            return Ok(Rc::clone(l));
        }
        let layout = Rc::new(self.named_fields(mt)?);
        self.layout_cache
            .borrow_mut()
            .insert(mt, Rc::clone(&layout));
        Ok(layout)
    }

    /// Looks up an instance field of `obj` by name.
    pub fn field(&self, obj: u64, name: &str) -> Result<Field> {
        let mt = self
            .object_mt(obj)
            .ok_or_else(|| ReaderError::Dac(format!("{obj:#x} is not a managed object")))?;
        self.layout_of(mt)?
            .get(name)
            .copied()
            .ok_or_else(|| ReaderError::Dac(format!("no field {name:?} on {}", self.type_name(mt))))
    }

    /// Reads a reference field; `None` for null.
    pub fn field_ref(&self, obj: u64, name: &str) -> Result<Option<u64>> {
        let f = self.field(obj, name)?;
        Ok(Some(self.process.read_u64(obj + u64::from(f.offset))?).filter(|&p| p != 0))
    }

    fn field_bytes<const N: usize>(&self, obj: u64, name: &str) -> Result<[u8; N]> {
        let f = self.field(obj, name)?;
        let raw = self.process.read_bytes(obj + u64::from(f.offset), N)?;
        raw.try_into()
            .map_err(|_| ReaderError::ShortRead { addr: obj, len: N })
    }

    pub fn i32_field(&self, obj: u64, name: &str) -> Result<i32> {
        self.field_bytes(obj, name).map(i32::from_le_bytes)
    }

    pub fn i64_field(&self, obj: u64, name: &str) -> Result<i64> {
        self.field_bytes(obj, name).map(i64::from_le_bytes)
    }

    pub fn f32_field(&self, obj: u64, name: &str) -> Result<f32> {
        self.field_bytes(obj, name).map(f32::from_le_bytes)
    }

    pub fn f64_field(&self, obj: u64, name: &str) -> Result<f64> {
        self.field_bytes(obj, name).map(f64::from_le_bytes)
    }

    /// Reads a `string` field; `None` for null.
    pub fn string_field(&self, obj: u64, name: &str) -> Result<Option<String>> {
        Ok(self.field_ref(obj, name)?.and_then(|s| self.read_string(s)))
    }

    /// `(first element address, length, element stride)` of a managed array object.
    pub fn array_layout(&self, array: u64) -> Option<(u64, usize, usize)> {
        let mt = self.object_mt(array)?;
        let stride = self.mt_info(mt)?.component_size as usize;
        let len = self.process.read_u32(array + 8).ok()? as usize;
        (stride != 0 && len < (1 << 24)).then_some((array + 16, len, stride))
    }

    /// Elements (as object addresses) of a `List<T>` / `Stack<T>` of reference types.
    /// `size_field` is `_size` for both.
    pub fn collection_refs(&self, collection: u64, array_field: &str) -> Result<Vec<u64>> {
        let Some(array) = self.field_ref(collection, array_field)? else {
            return Ok(Vec::new());
        };
        let size = self.i32_field(collection, "_size")?.max(0) as usize;
        let Some((first, len, stride)) = self.array_layout(array) else {
            return Ok(Vec::new());
        };
        if stride != 8 {
            return Ok(Vec::new());
        }
        let count = size.min(len);
        let raw = self.process.read_bytes(first, count * 8)?;
        Ok(raw
            .as_chunks::<8>()
            .0
            .iter()
            .map(|c| u64::from_le_bytes(*c))
            .collect())
    }

    /// Follows a chain of reference fields.
    pub fn follow(&self, mut obj: u64, path: &[&str]) -> Result<Option<u64>> {
        for name in path {
            match self.field_ref(obj, name)? {
                Some(next) => obj = next,
                None => return Ok(None),
            }
        }
        Ok(Some(obj))
    }

    pub fn type_name(&self, mt: u64) -> String {
        self.dac
            .method_table_name(mt)
            .unwrap_or_else(|| format!("<mt {mt:#x}>"))
    }

    /// Contents of a `System.String` object (length-prefixed UTF-16).
    pub fn read_string(&self, addr: u64) -> Option<String> {
        let len = self.process.read_u32(addr + 8).ok()? as usize;
        if len > 4096 {
            return None;
        }
        let raw = self.process.read_bytes(addr + 12, len * 2).ok()?;
        let units: Vec<u16> = raw
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| u16::from_le_bytes(*c))
            .collect();
        Some(String::from_utf16_lossy(&units))
    }

    /// Heuristic: a real object's reference fields point at other objects, whose first word is
    /// a valid method table. Table entries / stale copies that merely contain `mt` fail this.
    pub fn looks_like_object(&self, addr: u64, fields: &HashMap<String, Field>) -> bool {
        let (mut non_null, mut valid) = (0, 0);
        for f in fields
            .values()
            .filter(|f| f.elem_type == 0x12 || f.elem_type == 0x0e)
            .take(40)
        {
            let Ok(p) = self.process.read_u64(addr + u64::from(f.offset)) else {
                continue;
            };
            if p == 0 {
                continue;
            }
            non_null += 1;
            if p % 8 == 0
                && self
                    .process
                    .read_u64(p)
                    .is_ok_and(|m| self.mt_info(m & !7).is_some())
            {
                valid += 1;
            }
        }
        non_null >= 2 && valid * 10 >= non_null * 8
    }

    /// Like [`scan_for_qword`](Self::scan_for_qword) for a set of values; returns `(address, value)`.
    pub fn scan_for_qwords(&self, values: &HashSet<u64>) -> Vec<(u64, u64)> {
        let (Some(&lo), Some(&hi)) = (values.iter().min(), values.iter().max()) else {
            return Vec::new();
        };
        let mut hits = Vec::new();
        let mut buf = vec![0u8; CHUNK];
        let mut scanned = 0usize;
        for region in self
            .process
            .regions()
            .into_iter()
            .filter(Region::is_private_rw)
        {
            let mut pos = region.base;
            let end = region.base + region.size;
            while pos < end {
                let want = CHUNK.min((end - pos) as usize);
                let got = self.process.read_into(pos, &mut buf[..want]);
                if got < 8 {
                    pos += 0x1000;
                    continue;
                }
                for (i, w) in buf[..got].as_chunks::<8>().0.iter().enumerate() {
                    let v = u64::from_le_bytes(*w);
                    if (lo..=hi).contains(&v) && values.contains(&v) {
                        hits.push((pos + (i * 8) as u64, v));
                    }
                }
                pos += got as u64;
                scanned += 1;
                if scanned.is_multiple_of(CHUNKS_PER_YIELD) {
                    std::thread::sleep(SCAN_YIELD);
                }
            }
        }
        hits
    }

    /// Addresses (8-aligned) in private read/write memory that hold exactly `value`.
    pub fn scan_for_qword(&self, value: u64, limit: usize) -> Vec<u64> {
        let needle = value.to_le_bytes();
        let mut hits = Vec::new();
        let mut buf = vec![0u8; CHUNK];
        let mut scanned = 0usize;
        for region in self
            .process
            .regions()
            .into_iter()
            .filter(Region::is_private_rw)
        {
            let mut pos = region.base;
            let end = region.base + region.size;
            while pos < end && hits.len() < limit {
                let want = CHUNK.min((end - pos) as usize);
                let got = self.process.read_into(pos, &mut buf[..want]);
                if got < 8 {
                    pos += 0x1000;
                    continue;
                }
                for (i, w) in buf[..got].as_chunks::<8>().0.iter().enumerate() {
                    if *w == needle {
                        hits.push(pos + (i * 8) as u64);
                    }
                }
                pos += got as u64;
                scanned += 1;
                if scanned.is_multiple_of(CHUNKS_PER_YIELD) {
                    std::thread::sleep(SCAN_YIELD);
                }
            }
        }
        hits
    }

    /// Instance fields of a type and all its base classes, with runtime-resolved offsets
    /// relative to the object start (the 8-byte method table pointer is already included).
    pub fn instance_fields(&self, mt: u64) -> Result<Vec<Field>> {
        let mut out = Vec::new();
        let mut class = mt;
        while class != 0 {
            let data = self.dac.method_table(class)?;
            let fields = self.dac.method_table_fields(class)?;
            // `num_instance_fields` counts inherited fields; the field list holds declared ones only.
            let inherited = match data.parent {
                0 => 0,
                parent => self
                    .dac
                    .method_table_fields(parent)
                    .map_or(0, |p| p.num_instance_fields),
            };
            let declared = fields.num_instance_fields.saturating_sub(inherited)
                + fields.num_static_fields
                + fields.num_thread_static_fields;

            let mut fd = fields.first_field;
            for _ in 0..declared {
                if fd == 0 {
                    break;
                }
                // The DAC's NextField link is unbounded, so the declared count is what stops us.
                let Ok(f) = self.dac.field_desc(fd) else {
                    break;
                };
                if f.is_static == 0 && f.is_thread_local == 0 {
                    out.push(Field {
                        token: f.token,
                        module: data.module,
                        offset: f.offset + 8,
                        elem_type: f.elem_type,
                        mt_of_type: f.mt_of_type,
                    });
                }
                fd = f.next_field;
            }
            class = data.parent;
        }
        Ok(out)
    }

    /// Metadata of the module at `module` (a CLR `Module*`), cached.
    pub fn module_metadata(&self, module: u64) -> Option<Rc<Metadata>> {
        if let Some(md) = self.metadata_cache.borrow().get(&module) {
            return Some(Rc::clone(md));
        }
        let info = self.dac.module_info(module).ok()?;
        let blob = self
            .process
            .read_bytes(info.metadata_start, info.metadata_size as usize)
            .ok()?;
        let md = Rc::new(Metadata::parse(&blob).ok()?);
        self.metadata_cache
            .borrow_mut()
            .insert(module, Rc::clone(&md));
        Some(md)
    }

    /// Field layout with names, keyed by field name. Derived classes shadow base fields.
    pub fn named_fields(&self, mt: u64) -> Result<HashMap<String, Field>> {
        let mut out = HashMap::new();
        for f in self.instance_fields(mt)? {
            if let Some(name) = self
                .module_metadata(f.module)
                .and_then(|md| md.field_name(f.token).map(str::to_owned))
            {
                out.entry(name).or_insert(f);
            }
        }
        Ok(out)
    }
}
