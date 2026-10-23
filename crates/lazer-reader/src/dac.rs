//! Loads the game's own `mscordaccore.dll` (the CLR data access component that ships
//! with every .NET runtime) and drives it against the live process.
//!
//! The DAC ABI is frozen (`static_assert(sizeof(...))` in the runtime sources), so
//! this keeps working across lazer updates without per-version offsets.
//!
//! Read-only guarantee: our `ICLRDataTarget` implementation refuses `WriteVirtual`,
//! `SetTLSValue` and `SetThreadContext`, so even the DAC cannot modify the game.

// COM method names must match the C++ interface exactly.
#![allow(non_snake_case)]

use std::ffi::c_void;
use std::mem::transmute;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::sync::Arc;

use windows::Win32::Foundation::{E_FAIL, E_NOTIMPL, S_OK};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::core::{GUID, HRESULT, Interface, PCWSTR, implement, interface};

use crate::error::{ReaderError, Result};
use crate::process::Process;

const IMAGE_FILE_MACHINE_AMD64: u32 = 0x8664;
const IID_ISOS_DAC_INTERFACE: GUID = GUID::from_u128(0x436f00f2_b42a_4b9f_870c_e73db66ae930);

/// Set `LAZER_DAC_TRACE=1` to log the DAC's requests to the data target.
fn trace() -> bool {
    std::env::var_os("LAZER_DAC_TRACE").is_some()
}

#[interface("3E11CCEE-D08B-43e5-AF01-32717A64DA03")]
unsafe trait ICLRDataTarget: windows::core::IUnknown {
    unsafe fn GetMachineType(&self, machine_type: *mut u32) -> HRESULT;
    unsafe fn GetPointerSize(&self, pointer_size: *mut u32) -> HRESULT;
    unsafe fn GetImageBase(&self, image_path: PCWSTR, base_address: *mut u64) -> HRESULT;
    unsafe fn ReadVirtual(
        &self,
        address: u64,
        buffer: *mut u8,
        requested: u32,
        read: *mut u32,
    ) -> HRESULT;
    unsafe fn WriteVirtual(
        &self,
        address: u64,
        buffer: *const u8,
        requested: u32,
        written: *mut u32,
    ) -> HRESULT;
    unsafe fn GetTLSValue(&self, thread_id: u32, index: u32, value: *mut u64) -> HRESULT;
    unsafe fn SetTLSValue(&self, thread_id: u32, index: u32, value: u64) -> HRESULT;
    unsafe fn GetCurrentThreadID(&self, thread_id: *mut u32) -> HRESULT;
    unsafe fn GetThreadContext(
        &self,
        thread_id: u32,
        flags: u32,
        size: u32,
        context: *mut u8,
    ) -> HRESULT;
    unsafe fn SetThreadContext(&self, thread_id: u32, size: u32, context: *const u8) -> HRESULT;
    unsafe fn Request(
        &self,
        code: u32,
        in_size: u32,
        in_buf: *const u8,
        out_size: u32,
        out_buf: *mut u8,
    ) -> HRESULT;
}

#[implement(ICLRDataTarget)]
struct DataTarget {
    process: Arc<Process>,
}

#[allow(non_snake_case)]
impl ICLRDataTarget_Impl for DataTarget_Impl {
    unsafe fn GetMachineType(&self, machine_type: *mut u32) -> HRESULT {
        // SAFETY: the DAC passes a valid out pointer.
        unsafe { *machine_type = IMAGE_FILE_MACHINE_AMD64 };
        S_OK
    }

    unsafe fn GetPointerSize(&self, pointer_size: *mut u32) -> HRESULT {
        // SAFETY: the DAC passes a valid out pointer.
        unsafe { *pointer_size = 8 };
        S_OK
    }

    unsafe fn GetImageBase(&self, image_path: PCWSTR, base_address: *mut u64) -> HRESULT {
        // SAFETY: the DAC passes a NUL-terminated wide string.
        let path = unsafe { image_path.to_string() }.unwrap_or_default();
        let name = path.rsplit(['\\', '/']).next().unwrap_or(&path);
        if trace() {
            eprintln!("GetImageBase {path}");
        }
        match self.process.module(name) {
            Ok(Some(m)) => {
                // SAFETY: valid out pointer.
                unsafe { *base_address = m.base };
                S_OK
            }
            _ => E_FAIL,
        }
    }

    unsafe fn ReadVirtual(
        &self,
        address: u64,
        buffer: *mut u8,
        requested: u32,
        read: *mut u32,
    ) -> HRESULT {
        // SAFETY: the DAC guarantees `buffer` is writable for `requested` bytes.
        let buf = unsafe { std::slice::from_raw_parts_mut(buffer, requested as usize) };
        let n = self.process.read_into(address, buf);
        if !read.is_null() {
            // SAFETY: non-null out pointer supplied by the DAC.
            unsafe { *read = n as u32 };
        }
        if trace() {
            eprintln!("ReadVirtual {address:#x} len {requested} -> {n}");
        }
        if n == requested as usize {
            S_OK
        } else {
            E_FAIL
        }
    }

    // The game's memory is never modified, not even by the runtime's own DAC.
    unsafe fn WriteVirtual(&self, _: u64, _: *const u8, _: u32, _: *mut u32) -> HRESULT {
        E_NOTIMPL
    }

    unsafe fn GetTLSValue(&self, _: u32, _: u32, _: *mut u64) -> HRESULT {
        E_NOTIMPL
    }

    unsafe fn SetTLSValue(&self, _: u32, _: u32, _: u64) -> HRESULT {
        E_NOTIMPL
    }

    unsafe fn GetCurrentThreadID(&self, thread_id: *mut u32) -> HRESULT {
        // SAFETY: valid out pointer.
        unsafe { *thread_id = GetCurrentThreadId() };
        S_OK
    }

    unsafe fn GetThreadContext(&self, _: u32, _: u32, _: u32, _: *mut u8) -> HRESULT {
        E_NOTIMPL
    }

    unsafe fn SetThreadContext(&self, _: u32, _: u32, _: *const u8) -> HRESULT {
        E_NOTIMPL
    }

    unsafe fn Request(&self, _: u32, _: u32, _: *const u8, _: u32, _: *mut u8) -> HRESULT {
        E_NOTIMPL
    }
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

/// Handle on the runtime's `ISOSDacInterface`.
pub struct Dac {
    sos: *mut c_void,
    // Keeps the data target (and thus the process handle) alive for the DAC's lifetime.
    _target: ICLRDataTarget,
}

// Vtable slots of ISOSDacInterface (3 IUnknown methods precede them).
const GET_APP_DOMAIN_LIST: usize = 5;
const GET_ASSEMBLY_LIST: usize = 9;
const GET_MODULE_DATA: usize = 13;
const GET_ASSEMBLY_MODULE_LIST: usize = 15;
const GET_OBJECT_STRING_DATA: usize = 34;
const GET_METHOD_TABLE_NAME: usize = 36;
const GET_METHOD_TABLE_DATA: usize = 37;
const GET_METHOD_TABLE_FIELD_DATA: usize = 39;
const GET_FIELD_DESC_DATA: usize = 42;

fn check(hr: HRESULT, what: &str) -> Result<()> {
    if hr.is_ok() {
        Ok(())
    } else {
        Err(ReaderError::Dac(format!("{what} returned {hr:?}")))
    }
}

impl Drop for Dac {
    fn drop(&mut self) {
        type Release = unsafe extern "system" fn(*mut c_void) -> u32;
        // SAFETY: slot 2 of every COM vtable is `Release`; `sos` holds one reference.
        unsafe { transmute::<*const c_void, Release>(self.slot(2))(self.sos) };
    }
}

impl Dac {
    /// Loads `mscordaccore.dll` from the game directory and attaches it to `process`.
    pub fn attach(process: Arc<Process>, game_dir: &Path) -> Result<Self> {
        let dll: Vec<u16> = game_dir
            .join("mscordaccore.dll")
            .as_os_str()
            .encode_wide()
            .chain([0])
            .collect();
        // SAFETY: `dll` is NUL-terminated and outlives the call. The DAC is intentionally
        // never unloaded: the runtime's own tooling does the same.
        let lib = unsafe { LoadLibraryW(PCWSTR(dll.as_ptr())) }
            .map_err(|e| ReaderError::os("LoadLibraryW(mscordaccore.dll)", &e))?;
        // SAFETY: `lib` is a valid module handle and the export name is NUL-terminated.
        let create = unsafe { GetProcAddress(lib, windows::core::s!("CLRDataCreateInstance")) }
            .ok_or_else(|| ReaderError::Dac("CLRDataCreateInstance export missing".into()))?;
        type CreateFn =
            unsafe extern "system" fn(*const GUID, *mut c_void, *mut *mut c_void) -> HRESULT;
        // SAFETY: documented signature of CLRDataCreateInstance.
        let create: CreateFn = unsafe { transmute(create) };

        let target: ICLRDataTarget = DataTarget { process }.into();
        let mut sos: *mut c_void = std::ptr::null_mut();
        // SAFETY: `target` is a live COM object; `sos` receives an AddRef'd interface pointer.
        let hr = unsafe { create(&IID_ISOS_DAC_INTERFACE, target.as_raw(), &mut sos) };
        check(hr, "CLRDataCreateInstance")?;
        if sos.is_null() {
            return Err(ReaderError::Dac(
                "CLRDataCreateInstance returned null".into(),
            ));
        }
        Ok(Self {
            sos,
            _target: target,
        })
    }

    /// Function pointer of vtable slot `index`.
    fn slot(&self, index: usize) -> *const c_void {
        // SAFETY: a COM pointer's first word is its vtable; slots up to the interface
        // size are valid, and every index used in this module is below it.
        unsafe { *(*self.sos.cast::<*const *const c_void>()).add(index) }
    }

    /// Calls `fn(this, u64, *mut T) -> HRESULT` style slots filling a POD out-struct.
    fn query<T: Default>(&self, slot: usize, addr: u64, what: &str) -> Result<T> {
        type F<T> = unsafe extern "system" fn(*mut c_void, u64, *mut T) -> HRESULT;
        let mut out = T::default();
        // SAFETY: `slot` is a method with exactly this shape and `out` matches the
        // frozen struct layout (size-asserted above).
        let hr =
            unsafe { transmute::<*const c_void, F<T>>(self.slot(slot))(self.sos, addr, &mut out) };
        check(hr, what)?;
        Ok(out)
    }

    pub fn method_table(&self, mt: u64) -> Result<MethodTableData> {
        self.query(GET_METHOD_TABLE_DATA, mt, "GetMethodTableData")
    }

    pub fn method_table_fields(&self, mt: u64) -> Result<MethodTableFieldData> {
        self.query(GET_METHOD_TABLE_FIELD_DATA, mt, "GetMethodTableFieldData")
    }

    pub fn field_desc(&self, field_desc: u64) -> Result<FieldDescData> {
        self.query(GET_FIELD_DESC_DATA, field_desc, "GetFieldDescData")
    }

    pub fn module_info(&self, module: u64) -> Result<ModuleInfo> {
        // `DacpModuleData` is 0xa0 bytes; we only need its first five qwords.
        let mut raw = [0u64; 0xa0 / 8];
        type F = unsafe extern "system" fn(*mut c_void, u64, *mut u64) -> HRESULT;
        // SAFETY: `raw` is the full 0xa0-byte struct (size-asserted in the runtime).
        let hr = unsafe {
            transmute::<*const c_void, F>(self.slot(GET_MODULE_DATA))(
                self.sos,
                module,
                raw.as_mut_ptr(),
            )
        };
        check(hr, "GetModuleData")?;
        Ok(ModuleInfo {
            address: raw[0],
            il_base: raw[2],
            metadata_start: raw[3],
            metadata_size: raw[4],
            type_def_map: raw[10],
            raw,
        })
    }

    /// Addresses of every module loaded in the process (all app domains, all assemblies).
    pub fn all_modules(&self) -> Result<Vec<u64>> {
        type DomainList =
            unsafe extern "system" fn(*mut c_void, u32, *mut u64, *mut u32) -> HRESULT;
        type AssemblyList =
            unsafe extern "system" fn(*mut c_void, u64, i32, *mut u64, *mut i32) -> HRESULT;
        type ModuleList =
            unsafe extern "system" fn(*mut c_void, u64, u32, *mut u64, *mut u32) -> HRESULT;

        let mut domains = [0u64; 8];
        let mut n = 0u32;
        // SAFETY: matches `GetAppDomainList(count, values[], pNeeded)`.
        let hr = unsafe {
            transmute::<*const c_void, DomainList>(self.slot(GET_APP_DOMAIN_LIST))(
                self.sos,
                8,
                domains.as_mut_ptr(),
                &mut n,
            )
        };
        check(hr, "GetAppDomainList")?;

        let mut modules = Vec::new();
        for &domain in domains.iter().take(n as usize) {
            let mut assemblies = vec![0u64; 1024];
            let mut an = 0i32;
            // SAFETY: matches `GetAssemblyList(appDomain, count, values[], pNeeded)`.
            let hr = unsafe {
                transmute::<*const c_void, AssemblyList>(self.slot(GET_ASSEMBLY_LIST))(
                    self.sos,
                    domain,
                    1024,
                    assemblies.as_mut_ptr(),
                    &mut an,
                )
            };
            check(hr, "GetAssemblyList")?;
            for &assembly in assemblies.iter().take(an.max(0) as usize) {
                let mut mods = [0u64; 16];
                let mut mn = 0u32;
                // SAFETY: matches `GetAssemblyModuleList(assembly, count, modules[], pNeeded)`.
                let hr = unsafe {
                    transmute::<*const c_void, ModuleList>(self.slot(GET_ASSEMBLY_MODULE_LIST))(
                        self.sos,
                        assembly,
                        16,
                        mods.as_mut_ptr(),
                        &mut mn,
                    )
                };
                if hr.is_ok() {
                    modules.extend(mods.iter().take(mn as usize).copied());
                }
            }
        }
        Ok(modules)
    }

    /// Fully-qualified type name of a method table, e.g. `osu.Game.Screens.Play.Player`.
    #[must_use]
    pub fn method_table_name(&self, mt: u64) -> Option<String> {
        type F = unsafe extern "system" fn(*mut c_void, u64, u32, *mut u16, *mut u32) -> HRESULT;
        let mut buf = [0u16; 512];
        let mut needed = 0u32;
        // SAFETY: matches `GetMethodTableName(mt, count, name, pNeeded)`.
        let hr = unsafe {
            transmute::<*const c_void, F>(self.slot(GET_METHOD_TABLE_NAME))(
                self.sos,
                mt,
                buf.len() as u32,
                buf.as_mut_ptr(),
                &mut needed,
            )
        };
        if hr.is_err() {
            return None;
        }
        let end = buf.iter().position(|&u| u == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..end]))
    }

    /// Contents of a `System.String` object.
    #[must_use]
    pub fn object_string(&self, obj: u64) -> Option<String> {
        type F = unsafe extern "system" fn(*mut c_void, u64, u32, *mut u16, *mut u32) -> HRESULT;
        let mut buf = vec![0u16; 1024];
        let mut needed = 0u32;
        // SAFETY: matches `GetObjectStringData(obj, count, stringData, pNeeded)`.
        let hr = unsafe {
            transmute::<*const c_void, F>(self.slot(GET_OBJECT_STRING_DATA))(
                self.sos,
                obj,
                buf.len() as u32,
                buf.as_mut_ptr(),
                &mut needed,
            )
        };
        if hr.is_err() {
            return None;
        }
        let end = buf.iter().position(|&u| u == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..end]))
    }
}
