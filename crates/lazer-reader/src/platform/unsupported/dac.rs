//! Stub of the Windows `dac` backend (the CLR data access component).

use std::path::Path;
use std::sync::Arc;

use crate::error::{ReaderError, Result};
use crate::process::Process;

pub use crate::platform::types::{
    FieldDescData, MethodTableData, MethodTableFieldData, ModuleInfo,
};

/// Handle on the runtime's data access component. Uninhabited here, like `Process`.
pub enum Dac {}

impl Dac {
    /// Always fails: the data access component ships with the Windows build of lazer only.
    pub fn attach(_process: Arc<Process>, _game_dir: &Path) -> Result<Self> {
        Err(ReaderError::Unsupported("the CLR data access component"))
    }

    pub fn method_table(&self, _mt: u64) -> Result<MethodTableData> {
        match *self {}
    }

    pub fn method_table_fields(&self, _mt: u64) -> Result<MethodTableFieldData> {
        match *self {}
    }

    pub fn field_desc(&self, _field_desc: u64) -> Result<FieldDescData> {
        match *self {}
    }

    pub fn module_info(&self, _module: u64) -> Result<ModuleInfo> {
        match *self {}
    }

    pub fn all_modules(&self) -> Result<Vec<u64>> {
        match *self {}
    }

    #[must_use]
    pub fn method_table_name(&self, _mt: u64) -> Option<String> {
        match *self {}
    }

    #[must_use]
    pub fn object_string(&self, _obj: u64) -> Option<String> {
        match *self {}
    }
}
