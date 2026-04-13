#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::webview::WebviewBuilder;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalSize, WebviewUrl, Window,
};

const CONTROLLER_HEIGHT: f64 = 90.0;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WorkspaceTab {
    id: String,
    url: String,
    title: String,
    favicon_url: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WorkspaceState {
    tabs: Vec<WorkspaceTab>,
    active_tab_id: String,
    sidebar_visible: bool,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        let default_tab = WorkspaceTab {
            id: uuid::Uuid::new_v4().to_string(),
            url: "https://www.google.com/".to_string(),
            title: "New Tab".to_string(),
            favicon_url: None,
        };
        let default_id = default_tab.id.clone();
        Self {
            tabs: vec![default_tab],
            active_tab_id: default_id,
            sidebar_visible: true,
        }
    }
}

pub struct AppState {
    pub workspace: Mutex<WorkspaceState>,
    pub tab_webviews: Mutex<HashMap<String, String>>,
}

fn make_tab_label(tab_id: &str) -> String {
    let short: String = tab_id.chars().take(8).collect();
    format!("tab-{short}")
}

fn get_window_logical_size(window: &Window) -> (f64, f64) {
    let size = window.inner_size().unwrap_or(PhysicalSize::new(420, 900));
    let scale = window.scale_factor().unwrap_or(1.0);
    (size.width as f64 / scale, size.height as f64 / scale)
}

fn layout_controller(app: &AppHandle) {
    let Some(window) = app.get_window("main") else {
        return;
    };
    let (w, _h) = get_window_logical_size(&window);
    if let Some(wv) = app.get_webview("main") {
        let _ = wv.set_position(LogicalPosition::new(0.0, 0.0));
        let _ = wv.set_size(LogicalSize::new(w, CONTROLLER_HEIGHT));
    }
}

fn layout_tab(app: &AppHandle, tab_id: &str, ws: &WorkspaceState) {
    let label = make_tab_label(tab_id);
    let Some(wv) = app.get_webview(&label) else {
        return;
    };
    let Some(window) = app.get_window("main") else {
        return;
    };
    let (w, h) = get_window_logical_size(&window);
    let is_active = tab_id == ws.active_tab_id;

    if is_active && ws.sidebar_visible {
        let tab_h = h - CONTROLLER_HEIGHT;
        let _ = wv.set_position(LogicalPosition::new(0.0, CONTROLLER_HEIGHT));
        let _ = wv.set_size(LogicalSize::new(w, tab_h.max(1.0)));
        let _ = wv.show();
    } else {
        let _ = wv.set_position(LogicalPosition::new(0.0, CONTROLLER_HEIGHT));
        let _ = wv.set_size(LogicalSize::new(w, 1.0));
        let _ = wv.hide();
    }
}

fn create_tab_webview(app: &AppHandle, tab_id: &str, url: &str) {
    let label = make_tab_label(tab_id);
    let Some(window) = app.get_window("main") else {
        return;
    };
    let (w, h) = get_window_logical_size(&window);
    let tab_h = h - CONTROLLER_HEIGHT;

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url.parse().unwrap()));

    let _webview = match window.add_child(
        builder,
        LogicalPosition::new(0.0, CONTROLLER_HEIGHT),
        LogicalSize::new(w, tab_h.max(1.0)),
    ) {
        Ok(wv) => wv,
        Err(e) => {
            eprintln!("failed to create child webview: {e}");
            return;
        }
    };

    let state = app.state::<AppState>();
    let mut tab_wvs = state.tab_webviews.lock().unwrap();
    tab_wvs.insert(tab_id.to_string(), label);
}

fn layout_all(app: &AppHandle, state: &AppState) {
    layout_controller(app);
    let ws = state.workspace.lock().unwrap();
    for tab in &ws.tabs {
        layout_tab(app, &tab.id, &ws);
    }
}

#[tauri::command]
fn get_state(state: tauri::State<AppState>) -> WorkspaceState {
    state.workspace.lock().unwrap().clone()
}

#[tauri::command]
fn toggle_sidebar(state: tauri::State<AppState>, app: AppHandle) -> WorkspaceState {
    let mut ws = state.workspace.lock().unwrap();
    ws.sidebar_visible = !ws.sidebar_visible;
    let result = ws.clone();
    drop(ws);
    layout_all(&app, &state);
    let _ = app.emit("state-changed", &result);
    result
}

#[tauri::command]
fn create_tab(
    url: Option<String>,
    state: tauri::State<AppState>,
    app: AppHandle,
) -> WorkspaceState {
    let tab_url = url.unwrap_or_else(|| "https://www.google.com/".to_string());
    let new_tab = WorkspaceTab {
        id: uuid::Uuid::new_v4().to_string(),
        url: tab_url.clone(),
        title: "Loading...".to_string(),
        favicon_url: None,
    };
    let tab_id = new_tab.id.clone();
    let active_id = new_tab.id.clone();

    let mut ws = state.workspace.lock().unwrap();
    ws.tabs.insert(0, new_tab);
    ws.active_tab_id = active_id;
    let result = ws.clone();
    drop(ws);

    create_tab_webview(&app, &tab_id, &tab_url);
    layout_all(&app, &state);

    let _ = app.emit("state-changed", &result);
    result
}

#[tauri::command]
fn activate_tab(id: String, state: tauri::State<AppState>, app: AppHandle) -> WorkspaceState {
    let mut ws = state.workspace.lock().unwrap();
    ws.active_tab_id = id;
    let result = ws.clone();
    drop(ws);

    layout_all(&app, &state);
    let _ = app.emit("state-changed", &result);
    result
}

#[tauri::command]
fn close_tab(id: String, state: tauri::State<AppState>, app: AppHandle) -> WorkspaceState {
    {
        let label = make_tab_label(&id);
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.close();
        }
    }

    let mut ws = state.workspace.lock().unwrap();
    ws.tabs.retain(|t| t.id != id);
    if ws.tabs.is_empty() {
        let default_tab = WorkspaceTab {
            id: uuid::Uuid::new_v4().to_string(),
            url: "https://www.google.com/".to_string(),
            title: "New Tab".to_string(),
            favicon_url: None,
        };
        ws.active_tab_id = default_tab.id.clone();
        ws.tabs.push(default_tab);
    }
    if !ws.tabs.iter().any(|t| t.id == ws.active_tab_id) {
        ws.active_tab_id = ws.tabs[0].id.clone();
    }
    let result = ws.clone();
    drop(ws);

    {
        let mut tab_wvs = state.tab_webviews.lock().unwrap();
        tab_wvs.remove(&id);
    }

    layout_all(&app, &state);
    let _ = app.emit("state-changed", &result);
    result
}

#[tauri::command]
fn navigate_tab(
    id: String,
    url: String,
    state: tauri::State<AppState>,
    app: AppHandle,
) -> WorkspaceState {
    let label = make_tab_label(&id);
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.navigate(
            url.parse()
                .unwrap_or_else(|_| "about:blank".parse().unwrap()),
        );
    }

    let mut ws = state.workspace.lock().unwrap();
    if let Some(tab) = ws.tabs.iter_mut().find(|t| t.id == id) {
        tab.url = url;
    }
    let result = ws.clone();
    drop(ws);

    let _ = app.emit("state-changed", &result);
    result
}

#[tauri::command]
fn go_back(id: String, _state: tauri::State<AppState>, app: AppHandle) {
    let label = make_tab_label(&id);
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.eval("window.history.back()");
    }
}

#[tauri::command]
fn go_forward(id: String, _state: tauri::State<AppState>, app: AppHandle) {
    let label = make_tab_label(&id);
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.eval("window.history.forward()");
    }
}

#[tauri::command]
fn reload_tab(id: String, _state: tauri::State<AppState>, app: AppHandle) {
    let label = make_tab_label(&id);
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.eval("window.location.reload()");
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            workspace: Mutex::new(WorkspaceState::default()),
            tab_webviews: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            toggle_sidebar,
            create_tab,
            activate_tab,
            close_tab,
            navigate_tab,
            go_back,
            go_forward,
            reload_tab,
        ])
        .setup(|app| {
            let main_win = app.get_webview_window("main").unwrap();

            let (w, h) = {
                let size = main_win.inner_size().unwrap_or(PhysicalSize::new(420, 900));
                let scale = main_win.scale_factor().unwrap_or(1.0);
                (size.width as f64 / scale, size.height as f64 / scale)
            };

            if let Some(wv) = app.get_webview("main") {
                let _ = wv.set_position(LogicalPosition::new(0.0, 0.0));
                let _ = wv.set_size(LogicalSize::new(w, CONTROLLER_HEIGHT));
            }

            let ws = app.state::<AppState>();
            let initial = ws.workspace.lock().unwrap();
            let first_tab = initial.tabs.first().unwrap().clone();
            let first_active = initial.active_tab_id.clone();
            drop(initial);

            let label = make_tab_label(&first_tab.id);
            let tab_h = h - CONTROLLER_HEIGHT;
            let window = app.get_window("main").unwrap();
            let builder =
                WebviewBuilder::new(&label, WebviewUrl::External(first_tab.url.parse().unwrap()));
            let _child = window
                .add_child(
                    builder,
                    LogicalPosition::new(0.0, CONTROLLER_HEIGHT),
                    LogicalSize::new(w, tab_h.max(1.0)),
                )
                .unwrap();

            {
                let mut tab_wvs = ws.tab_webviews.lock().unwrap();
                tab_wvs.insert(first_tab.id.clone(), label);
            }

            if first_active != first_tab.id {
                if let Some(wv) = app.get_webview(&make_tab_label(&first_tab.id)) {
                    let _ = wv.hide();
                }
            }

            let app_handle = app.handle().clone();
            main_win.on_window_event(move |event| {
                if let tauri::WindowEvent::Resized(_) = event {
                    let state = app_handle.state::<AppState>();
                    layout_all(&app_handle, &state);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
