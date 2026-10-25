//! Plain data returned by every operating-system backend. No OS calls live here, so the
//! same types exist on every platform and the rest of the crate never names a backend.

/// A loaded module of the target process.
#[derive(Debug, Clone)]
pub struct Module {
    pub name: String,
    pub base: u64,
    pub size: u32,
}

/// A running process that could be a game build, found while looking for one.
#[derive(Debug, Clone)]
pub struct Found {
    pub pid: u32,
    /// Executable file name as the process table reports it.
    pub name: String,
    /// Whether it loads `osu.Game.dll` (a lazer-family build) and was opened for reading.
    pub is_lazer: bool,
    /// Why it was ruled out or could not be opened, when it was.
    pub note: Option<String>,
}

/// A committed, readable memory region.
#[derive(Debug, Clone, Copy)]
pub struct Region {
    pub base: u64,
    pub size: u64,
    /// `MEM_PRIVATE` (0x20000), `MEM_MAPPED` (0x40000) or `MEM_IMAGE` (0x1000000).
    pub kind: u32,
    /// Win32 `PAGE_*` protection flags.
    pub protect: u32,
}

impl Region {
    pub const PRIVATE: u32 = 0x2_0000;

    /// Private read/write memory: where the managed heap lives.
    ///
    /// Write-combined and uncached pages are left out: they are graphics upload buffers (tens of
    /// MiB each, hundreds in all), not managed objects, and reading them is ~50x slower than
    /// ordinary memory, which made up most of the time spent scanning for the game's root object.
    #[must_use]
    pub fn is_private_rw(&self) -> bool {
        const RW: u32 = 0x04 | 0x08; // PAGE_READWRITE | PAGE_WRITECOPY
        const NOCACHE: u32 = 0x200;
        const WRITECOMBINE: u32 = 0x400;
        self.kind == Self::PRIVATE
            && self.protect & RW != 0
            && self.protect & (NOCACHE | WRITECOMBINE) == 0
    }
}

/// The game window's client area in physical screen pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GameWindow {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// The game window is the foreground window.
    pub focused: bool,
    pub minimized: bool,
}

/// `DacpMethodTableData`.
#[repr(C)]
#[derive(Default, Debug, Clone, Copy)]
pub struct MethodTableData {
    pub is_free: i32,
    pub module: u64,
    pub class: u64,
    pub parent: u64,
    pub num_interfaces: u16,
    pub num_methods: u16,
    pub num_vtable_slots: u16,
    pub num_virtuals: u16,
    pub base_size: u32,
    pub component_size: u32,
    pub token: u32,
    pub attr_class: u32,
    pub is_shared: i32,
    pub is_dynamic: i32,
    pub contains_pointers: i32,
}

/// `DacpMethodTableFieldData`.
#[repr(C)]
#[derive(Default, Debug, Clone, Copy)]
pub struct MethodTableFieldData {
    pub num_instance_fields: u16,
    pub num_static_fields: u16,
    pub num_thread_static_fields: u16,
    pub first_field: u64,
    pub context_static_offset: u16,
    pub context_statics_size: u16,
}

/// `DacpFieldDescData`.
#[repr(C)]
#[derive(Default, Debug, Clone, Copy)]
pub struct FieldDescData {
    pub elem_type: u32,
    pub sig_type: u32,
    pub mt_of_type: u64,
    pub module_of_type: u64,
    pub token_of_type: u32,
    /// `mdFieldDef` token of the field.
    pub token: u32,
    pub mt_of_enclosing_class: u64,
    pub offset: u32,
    pub is_thread_local: i32,
    pub is_context_local: i32,
    pub is_static: i32,
    pub next_field: u64,
}

const _: () = {
    assert!(size_of::<MethodTableData>() == 0x48);
    assert!(size_of::<MethodTableFieldData>() == 0x18);
    assert!(size_of::<FieldDescData>() == 0x40);
};

/// Metadata blob location of a module (from `DacpModuleData`).
#[derive(Debug, Clone, Copy)]
pub struct ModuleInfo {
    pub address: u64,
    pub il_base: u64,
    pub metadata_start: u64,
    pub metadata_size: u64,
    /// Address of the module's `TypeDef -> MethodTable` lookup map.
    pub type_def_map: u64,
    /// The complete `DacpModuleData` (0xa0 bytes) for diagnostics.
    pub raw: [u64; 0xa0 / 8],
}
