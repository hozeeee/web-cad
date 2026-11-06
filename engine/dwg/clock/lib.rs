// SPDX-License-Identifier: MPL-2.0
// webCAD 自有时钟适配层（不包含 web-time 上游代码）。
// 仅替换引擎内部性能计时，避免为时钟引入 wasm-bindgen 胶水。
pub use std::time::{Duration, SystemTime, SystemTimeError, UNIX_EPOCH};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "webcad")]
extern "C" {
    fn now() -> f64;
}

#[cfg(target_arch = "wasm32")]
#[derive(Clone, Copy, Debug)]
pub struct Instant(f64);

#[cfg(target_arch = "wasm32")]
impl Instant {
    pub fn now() -> Self {
        Self(unsafe { now() })
    }
    pub fn elapsed(&self) -> Duration {
        Duration::from_secs_f64(((unsafe { now() } - self.0) / 1000.0).max(0.0))
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use std::time::Instant;
