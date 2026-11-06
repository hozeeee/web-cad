// SPDX-License-Identifier: MPL-2.0
// 单任务 WASM 桥接：实例由 Worker 持有，任务结束后整体释放。
use acadrust::{DwgReader, DwgWriter, DxfReader, DxfWriter};
use acadrust::io::dwg::DwgReadOptions;
use std::io::Cursor;
use std::cell::RefCell;

thread_local! {
    static INPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn input_buffer(len: usize) -> *mut u8 {
    INPUT.with(|input| {
        let mut input = input.borrow_mut();
        input.resize(len, 0);
        input.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn output_ptr() -> *const u8 {
    OUTPUT.with(|output| output.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn output_len() -> usize {
    OUTPUT.with(|output| output.borrow().len())
}

fn convert(input: Vec<u8>, direction: u32) -> Result<Vec<u8>, String> {
    if input.len() > 20 * 1024 * 1024 {
        return Err("文件超过 20 MB 上限".into());
    }
    if direction == 0 {
        let options = DwgReadOptions::default()
            .with_max_decompressed_bytes(128 * 1024 * 1024)
            .with_mesh_limits(1000, 4000);
        let mut reader = DwgReader::from_stream_with_options(Cursor::new(input), options);
        let outcome = reader.read_with_stats().map_err(|e| e.to_string())?;
        let document = outcome.document;
        if document.entities().count() > 20000 {
            return Err("DWG 实体数量超过试用版 20000 上限".into());
        }
        let warnings: Vec<String> = document.notifications.iter()
            .take(100)
            .map(|n| n.message.clone())
            .collect();
        let dxf = DxfWriter::new(&document)
            .write_to_vec().map_err(|e| e.to_string())?;
        if dxf.len() > 40 * 1024 * 1024 {
            return Err("转换结果过大，试用版无法处理".into());
        }
        let dxf = String::from_utf8(dxf).map_err(|e| e.to_string())?;
        serde_json::to_vec(&serde_json::json!({
            "dxf": dxf,
            "warnings": warnings,
            "notificationCount": document.notifications.len() + document.notifications.omitted_count(),
        })).map_err(|e| e.to_string())
    } else if direction == 1 {
        let reader = DxfReader::from_reader(Cursor::new(input)).map_err(|e| e.to_string())?;
        let document = reader.read().map_err(|e| e.to_string())?;
        DwgWriter::write_to_vec(&document).map_err(|e| e.to_string())
    } else {
        Err("无效的转换方向".into())
    }
}

#[no_mangle]
pub extern "C" fn run(direction: u32) -> u32 {
    let input = INPUT.with(|input| std::mem::take(&mut *input.borrow_mut()));
    let result = convert(input, direction);
    let status = u32::from(result.is_err());
    OUTPUT.with(|output| {
        *output.borrow_mut() = match result {
            Ok(bytes) => bytes,
            Err(error) => error.into_bytes(),
        };
    });
    status
}
