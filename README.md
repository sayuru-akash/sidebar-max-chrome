> **⚠️ PROJECT DISCONTINUED**
>
> This project has been discontinued. The core goal — a sidebar browser where tabs keep running (video, audio, JS) when the sidebar is closed and resume seamlessly when reopened — cannot be reliably achieved with current APIs.
>
> **Chrome Extension limitations:**
>
> 1. **Side Panel DOM is destroyed on close** — Chrome's `sidePanel` API destroys the entire DOM when the panel closes. No API prevents this. Iframes die, media stops, state is lost.
> 2. **Offscreen Document is a separate context** — `chrome.offscreen` creates a hidden document that survives panel close, but it runs a completely separate page instance. Cannot share DOM state, video position, or JS context with the sidebar.
> 3. **No way to mirror or transfer video frames** — Chrome extensions cannot capture or stream video frames between documents.
> 4. **Two-instance sync is fundamentally broken** — Sidebar + offscreen loading the same URL creates two independent pages. Sync causes reload loops, double audio, and position desync.
> 5. **Background tabs are separate instances** — `autoDiscardable: false` + tab groups still creates separate page instances from the sidebar iframe.
> 6. **Cross-origin sync is unreliable** — `contentWindow.location` access is blocked cross-origin. Content script interception is fragile and site-dependent.
>
> **Tauri Desktop App:**
>
> Also discontinued. While Tauri v2's `window.add_child()` API for embedding native WebViews in a single window is technically the right approach, it requires the `unstable` feature flag and was not fully built or tested. Without a working Chrome extension to validate the UX concept, the desktop app effort is also shelved.

<div align="center">

# 🚀 Sidebar Max

### **A Powerful Dual-Platform Sidebar Browser for Chrome & Desktop**

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg?style=for-the-badge&logo=npm)](https://github.com/sayuru-akash/sidebar-max-chrome)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge&logo=open-source-initiative)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore)
[![Tauri](https://img.shields.io/badge/Built%20with-Tauri-FFC131?style=for-the-badge&logo=tauri&logoColor=black)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-Backend-000000?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)

<p align="center">
  <strong>🔥 Browse the web without leaving your workflow</strong><br>
  Multi-tab sidebar workspace • Session persistence • Native desktop app • Chrome extension
</p>

[📦 Installation](#installation) • [🚀 Quick Start](#quick-start) • [📖 Documentation](#documentation) • [🛠️ Development](#development) • [🤝 Contributing](#contributing)

</div>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🎯 What is Sidebar Max?](#-what-is-sidebar-max)
- [🏗️ Architecture](#️-architecture)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [📖 Usage Guide](#-usage-guide)
- [🛠️ Development](#️-development)
- [📁 Project Structure](#-project-structure)
- [🔌 API Reference](#-api-reference)
- [🧪 Testing](#-testing)
- [🔧 Configuration](#-configuration)
- [🐛 Troubleshooting](#-troubleshooting)
- [🗺️ Roadmap](#️-roadmap)
- [📜 Changelog](#-changelog)
- [📄 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)

---

## ✨ Features

### 🌐 Chrome Extension Features

| Feature                    | Description                                                           | Status |
| -------------------------- | --------------------------------------------------------------------- | ------ |
| 🔲 **Native Side Panel**   | Chrome's official sidePanel API integration with persistent workspace | ✅     |
| 📑 **Multi-Tab Workspace** | Create, manage, and switch between multiple tabs in the sidebar       | ✅     |
| 💾 **Session Persistence** | Automatic session save/restore with chrome.storage.local              | ✅     |
| 🔗 **Chrome Tab Groups**   | Auto-creates "Sidebar Max" tab group for backing tabs                 | ✅     |
| 🖼️ **Frame Embedding**     | Removes X-Frame-Options and CSP headers via declarativeNetRequest     | ✅     |
| 🔊 **Media Keep-Alive**    | Prevents background tabs from being discarded, auto-plays media       | ✅     |
| 🔍 **Smart URL Input**     | Automatically detects URLs vs search queries                          | ✅     |
| 🎨 **Modern UI**           | Glassmorphism design with smooth animations                           | ✅     |
| ⌨️ **Keyboard Shortcuts**  | Ctrl+Shift+Y to toggle panel                                          | ✅     |
| 🔄 **Navigation Controls** | Back, forward, reload buttons per tab                                 | ✅     |
| 🏷️ **Favicon Support**     | Displays site favicons via Google S2 service                          | ✅     |
| 🛡️ **Type Safety**         | Full Zod schema validation for all messages                           | ✅     |

### 🖥️ Tauri Desktop App Features

| Feature                  | Description                                       | Status |
| ------------------------ | ------------------------------------------------- | ------ |
| 🪟 **Native Window**     | Standalone floating sidebar window (420×900px)    | ✅     |
| 🧩 **Child WebViews**    | Each tab runs in its own native WebView           | ✅     |
| 🎛️ **Rust Backend**      | High-performance native backend with Tauri v2     | ✅     |
| 📊 **State Management**  | Mutex-protected workspace state                   | ✅     |
| 🔀 **Tab Switching**     | Seamless tab activation with layout management    | ✅     |
| 🧭 **Navigation**        | Programmatic navigation with back/forward support | ✅     |
| 📐 **Responsive Layout** | Auto-adjusts on window resize                     | ✅     |
| 🔗 **Shell Integration** | Tauri shell plugin for system integration         | ✅     |

---

## 🎯 What is Sidebar Max?

**Sidebar Max** is a revolutionary dual-platform sidebar browser that brings the convenience of side-by-side browsing to both **Chrome users** and **desktop users**. Unlike traditional browser sidebars that are limited or iframe-based extensions that break on many sites, Sidebar Max provides:

### 🌟 Key Differentiators

1. **🔓 No Website Restrictions** - Uses Chrome's declarativeNetRequest API to remove frame-blocking headers, allowing you to embed virtually any website

2. **🔄 Real Browser Tabs** - Each workspace tab is backed by a real Chrome tab in a managed tab group, not an isolated iframe session

3. **💾 Persistent Sessions** - Your tabs, history, and scroll positions are automatically saved and restored

4. **🎵 Media-Aware** - Background tabs stay alive with auto-play injection for videos and audio streams

5. **⚡ Native Performance** - The Tauri desktop app provides native performance with Rust backend and WebViews

6. **🛡️ Type-Safe Architecture** - All inter-component communication uses Zod-validated schemas

### 🎬 Use Cases

- 📝 **Research & Writing** - Keep reference materials open while writing
- 💻 **Development** - Monitor docs, Stack Overflow, GitHub alongside your IDE
- 📊 **Data Analysis** - View dashboards while working with data
- 📱 **Testing** - Test mobile-responsive sites in a sidebar window
- 📚 **Learning** - Follow tutorials while practicing
- 🎮 **Entertainment** - Keep videos/music playing while browsing

---

## 🏗️ Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SIDEBAR MAX ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐         ┌─────────────────────────┐           │
│  │   🔶 CHROME EXTENSION   │         │  🔷 TAURI DESKTOP APP   │           │
│  │                         │         │                         │           │
│  │  ┌───────────────────┐  │         │  ┌───────────────────┐  │           │
│  │  │  SidePanel UI     │  │         │  │  Controller UI    │  │           │
│  │  │  (React 19 + TS)  │  │         │  │  (React 19 + TS)  │  │           │
│  │  └─────────┬─────────┘  │         │  └─────────┬─────────┘  │           │
│  │            │            │         │            │            │           │
│  │  ┌─────────▼─────────┐  │         │  ┌─────────▼─────────┐  │           │
│  │  │    Background     │  │         │  │    Rust Backend   │  │           │
│  │  │  Service Worker   │  │         │  │   (Tauri v2)      │  │           │
│  │  │                   │  │         │  │                   │  │           │
│  │  │ • Session Manager │  │         │  │ • State Manager   │  │           │
│  │  │ • Tab Controller  │  │         │  │ • WebView Manager │  │           │
│  │  │ • Storage Layer   │  │         │  │ • Navigation      │  │           │
│  │  └─────────┬─────────┘  │         │  └─────────┬─────────┘  │           │
│  │            │            │         │            │            │           │
│  │  ┌─────────▼─────────┐  │         │  ┌─────────▼─────────┐  │           │
│  │  │   Chrome APIs     │  │         │  │   Child WebViews  │  │           │
│  │  │                   │  │         │  │                   │  │           │
│  │  │ • tabs API        │  │         │  │ • Per-tab WebView │  │           │
│  │  │ • tabGroups API   │  │         │  │ • Native rendering│  │           │
│  │  │ • sidePanel API   │  │         │  │ • System WebKit   │  │           │
│  │  │ • storage API     │  │         │  │                   │  │           │
│  │  └───────────────────┘  │         │  └───────────────────┘  │           │
│  └─────────────────────────┘         └─────────────────────────┘           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     SHARED COMPONENTS                               │ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │  • React Components (icons, SidePanel)                              │ │
│  │  • Zod Schemas (validation, types)                                   │ │
│  │  • Utility Functions (URL parsing, workspace logic)               │ │
│  │  • Constants & Configuration                                         │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Chrome Extension Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │────▶│  SidePanel   │────▶│  Background  │────▶│  Chrome      │
│  Action      │     │   React UI   │     │  Controller  │     │   APIs       │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │                    │                    │
                            │                    │                    │
                            ▼                    ▼                    ▼
                     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                     │   Zod        │     │   Session    │     │  Tab Groups  │
                     │  Validation  │     │   Manager    │     │   + Storage  │
                     └──────────────┘     └──────────────┘     └──────────────┘
```

### Communication Protocol

All messages between UI and background use **Zod-validated schemas** for type safety:

```typescript
// Panel Request Messages
-CREATE_TAB - // Create new workspace tab
  NAVIGATE_TAB - // Navigate tab to URL/search
  ACTIVATE_TAB - // Switch active tab
  CLOSE_TAB - // Close workspace tab
  GO_BACK / FORWARD - // Browser navigation
  RELOAD - // Refresh tab
  SET_PINNED - // Pin/unpin sidebar
  GET_SESSION - // Request current session
  PANEL_READY - // UI initialization signal
  SYNC_IFRAME_URL - // URL sync from iframe
  // Panel Events (Background → UI)
  SESSION_UPDATED; // Push session state changes
```

---

## 📦 Installation

### 🔶 Chrome Extension

#### Option 1: Chrome Web Store (Coming Soon)

```
🚧 Pending Chrome Web Store review
```

#### Option 2: Load Unpacked (Development)

1. **Build the extension:**

   ```bash
   npm install
   npm run build
   ```

2. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (toggle top-right)
   - Click "Load unpacked"
   - Select the `.output/chrome-mv3-dev` folder

3. **Pin the extension:**
   - Click the puzzle icon in Chrome toolbar
   - Click the pin next to "Sidebar Max"

4. **Open the sidebar:**
   - Click the Sidebar Max icon, OR
   - Press `Ctrl+Shift+Y` (Windows/Linux) or `Cmd+Shift+Y` (Mac)

### 🔷 Tauri Desktop App

#### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) 18+
- System dependencies (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites))

#### macOS Prerequisites

```bash
xcode-select --install
```

#### Linux Prerequisites

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libappindicator3-dev librsvg2-dev
```

#### Build & Run

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build production binary
npm run tauri:build
```

The built app will be in `src-tauri/target/release/bundle/`

---

## 🚀 Quick Start

### Chrome Extension

```bash
# 1. Clone repository
git clone https://github.com/sayuru-akash/sidebar-max-chrome.git
cd sidebar-max-chrome

# 2. Install dependencies (npm 11.12.0 required)
npm install

# 3. Start development server with hot reload
npm run dev
# Extension auto-reloads on code changes

# 4. Open Chrome and load unpacked extension from .output/chrome-mv3-dev/
```

### Desktop App

```bash
# Install Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Run Tauri development server
npm run tauri:dev
# Opens native window with hot reload
```

---

## 📖 Usage Guide

### 🎛️ Chrome Extension Interface

```
┌─────────────────────────────────────────────────────┐
│  [←] [→] [↻]  google.com/search?q=...  [+]  │ 📌 │  │  ← Toolbar
├─────────────────────────────────────────────────────┤
│ ┌───┐ ┌───┐ ┌───┐                                   │
│ │ G │ │ Y │ │ 🐙│ ...                                │  ← Tab Strip
│ └───┘ └───┘ └───┘                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │           WEB CONTENT AREA                  │   │  ← Iframe Viewer
│  │         (Embedded Website)                  │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 🎯 Basic Operations

| Action             | How To                                       |
| ------------------ | -------------------------------------------- |
| **Toggle Sidebar** | Click extension icon or press `Ctrl+Shift+Y` |
| **New Tab**        | Click `[+]` button or `Ctrl+Shift+N`         |
| **Close Tab**      | Click `×` on tab                             |
| **Switch Tab**     | Click tab in strip                           |
| **Navigate**       | Type in address bar, press Enter             |
| **Go Back**        | Click `[←]` button                           |
| **Reload**         | Click `[↻]` button                           |
| **Pin/Unpin**      | Click pin icon (📌)                          |

### 🔍 Address Bar Smart Input

The address bar intelligently handles your input:

| Input                       | Result                                 |
| --------------------------- | -------------------------------------- |
| `https://example.com`       | Direct URL navigation                  |
| `example.com`               | Auto-prefixed to `https://example.com` |
| `localhost:3000`            | Direct localhost navigation            |
| `how to write react hooks`  | Google search                          |
| `github.com/facebook/react` | Direct navigation                      |

### 📑 Tab Management

- **Maximum Tabs**: Unlimited (memory permitting)
- **Tab Persistence**: Tabs auto-save every 50ms of inactivity
- **Tab Groups**: Sidebar Max auto-manages a Chrome tab group for backing tabs
- **Session Restore**: Previous session restored on new window

### 🎵 Media Handling

Background tabs with media (YouTube, Spotify, etc.) are:

- Marked as non-discardable (won't be killed by Chrome)
- Auto-reloaded if discarded
- Auto-play injected every 24 seconds to keep alive

---

## 🛠️ Development

### 📋 Prerequisites

| Requirement | Version       | Purpose              |
| ----------- | ------------- | -------------------- |
| Node.js     | 18+           | Build tooling, React |
| npm         | 11.12.0       | Package management   |
| Rust        | Latest stable | Tauri backend        |
| Chrome      | 116+          | Extension target     |

### 🏗️ Build Commands

```bash
# Chrome Extension Development
npm run dev           # Start WXT dev server with hot reload
npm run build         # Production build for Chrome Web Store
npm run zip           # Create distributable zip

# Desktop App Development
npm run dev:app       # Vite dev server for app UI
npm run build:app     # Build app UI only
npm run tauri:dev     # Full Tauri dev with Rust backend
npm run tauri:build   # Production native binary

# Code Quality
npm run lint          # ESLint check
npm run lint:fix      # ESLint with auto-fix

# Testing
npm run test          # Unit tests with Vitest
npm run test:watch    # Watch mode for tests
npm run test:e2e      # Playwright E2E tests
```

### 🧪 Development Workflow

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/sidebar-max-chrome.git

# 2. Create feature branch
git checkout -b feature/amazing-feature

# 3. Make changes and test
npm run dev      # Test in Chrome
npm run test     # Run unit tests

# 4. Build and verify
npm run build
npm run lint

# 5. Commit with conventional commits
git commit -m "feat: add amazing feature"

# 6. Push and create PR
git push origin feature/amazing-feature
```

### 🔧 Environment Setup

Create `.env.local` for local overrides:

```bash
# WXT Configuration (optional)
WXT_BROWSER=chrome
WXT_MANIFEST_VERSION=3
```

---

## 📁 Project Structure

```
sidebar-max-chrome/
│
├── 📁 entrypoints/                    # Chrome extension entry points
│   ├── 📄 background.ts               # Service worker (controller init)
│   ├── 📄 viewport.content.ts         # Content script for viewport management
│   └── 📁 sidepanel/                  # Side panel UI entry
│       ├── 📄 index.html              # Panel HTML shell
│       └── 📄 main.tsx                # Panel React mount point
│
├── 📁 src/                            # Shared source code
│   ├── 📁 background/                 # Background script modules
│   │   └── 📄 controller.ts           # Main SidePanelController (545 lines)
│   │
│   ├── 📁 components/                 # React components
│   │   ├── 📄 SidePanel.tsx           # Main side panel component (UI)
│   │   └── 📄 icons.tsx               # SVG icon components
│   │
│   ├── 📁 lib/                        # Utility libraries
│   │   ├── 📄 constants.ts            # App constants (URLs, keys)
│   │   ├── 📄 schema.ts             # Zod schemas (132 lines)
│   │   ├── 📄 storage.ts            # Chrome storage helpers
│   │   ├── 📄 url.ts                # URL parsing/normalization
│   │   └── 📄 workspace.ts          # Session state management
│   │
│   └── 📁 styles/                     # CSS styles
│       └── 📄 sidepanel.css           # Side panel styles
│
├── 📁 src-app/                        # Tauri app source
│   ├── 📄 index.html                  # App HTML shell
│   └── 📄 main.tsx                    # App React entry
│
├── 📁 src-tauri/                      # Tauri Rust backend
│   ├── 📄 Cargo.toml                 # Rust dependencies
│   ├── 📄 tauri.conf.json            # Tauri configuration
│   ├── 📄 build.rs                   # Build script
│   └── 📁 src/
│       └── 📄 main.rs                # Rust backend (348 lines)
│   └── 📁 icons/                     # App icons
│
├── 📁 public/                         # Static assets
│   └── 📄 rules.json                 # declarativeNetRequest rules
│
├── 📁 tests/                          # Test suites
│   ├── 📄 url.test.ts                # URL utility tests
│   ├── 📄 workspace.test.ts          # Session management tests
│   └── 📁 e2e/
│       └── 📄 dock.spec.ts           # Playwright E2E tests
│
├── 📄 wxt.config.ts                   # WXT extension framework config
├── 📄 vite.app.config.ts              # Vite config for desktop app
├── 📄 vitest.config.ts                # Vitest test runner config
├── 📄 playwright.config.ts             # Playwright E2E config
├── 📄 tsconfig.json                   # TypeScript configuration
├── 📄 eslint.config.mjs               # ESLint rules (flat config)
├── 📄 .prettierrc.json                # Prettier formatting rules
├── 📄 package.json                    # Node dependencies & scripts
└── 📄 SIDEPANEL_MACOS_APP_SPECIFICATION.md  # Native Swift spec (future)
```

### 🔍 Key Files Explained

| File            | Purpose                                                                     | Lines |
| --------------- | --------------------------------------------------------------------------- | ----- |
| `controller.ts` | Main background controller - session management, tab sync, message handling | 545   |
| `main.rs`       | Tauri Rust backend - native WebView management, state                       | 348   |
| `schema.ts`     | Zod schemas - type-safe message validation                                  | 132   |
| `SidePanel.tsx` | React side panel UI - tabs, navigation, iframe                              | ~300  |
| `workspace.ts`  | Session state logic - CRUD operations for tabs                              | 153   |
| `url.ts`        | URL normalization - search vs URL detection                                 | 62    |

---

## 🔌 API Reference

### Zod Schemas (Type-Safe Messaging)

#### Core Data Types

```typescript
// Workspace Tab
interface WorkspaceTab {
  id: string; // Unique tab ID (UUID)
  url: string; // Current URL
  title: string; // Display title
  faviconUrl: string | null;
  nativeTabId: number | null; // Chrome tab ID
  lastActiveAt: number; // Timestamp
}

// Side Panel Session
interface SidePanelSession {
  windowId: number;
  activeTabId: string;
  workspaceTabs: WorkspaceTab[];
  tabGroupId: number | null;
  pinned: boolean;
  lastError: string | null;
  updatedAt: number;
}

// Session Snapshot (for storage)
interface StoredSessionSnapshot {
  activeTabId: string;
  workspaceTabs: WorkspaceTab[];
  updatedAt: number;
}
```

#### Panel Request Messages

| Message           | Schema                                      | Description                      |
| ----------------- | ------------------------------------------- | -------------------------------- |
| `CREATE_TAB`      | `{ type, windowId, input? }`                | Create new tab with optional URL |
| `NAVIGATE_TAB`    | `{ type, windowId, workspaceTabId, input }` | Navigate tab to URL/search       |
| `ACTIVATE_TAB`    | `{ type, windowId, workspaceTabId }`        | Switch to tab                    |
| `CLOSE_TAB`       | `{ type, windowId, workspaceTabId }`        | Close tab                        |
| `GO_BACK`         | `{ type, windowId, workspaceTabId }`        | Browser back                     |
| `GO_FORWARD`      | `{ type, windowId, workspaceTabId }`        | Browser forward                  |
| `RELOAD`          | `{ type, windowId, workspaceTabId }`        | Refresh page                     |
| `SET_PINNED`      | `{ type, windowId, pinned }`                | Pin/unpin sidebar                |
| `GET_SESSION`     | `{ type, windowId }`                        | Request session state            |
| `PANEL_READY`     | `{ type }`                                  | UI initialized                   |
| `SYNC_IFRAME_URL` | `{ type, url }`                             | URL changed in iframe            |

#### Panel Events (Background → UI)

```typescript
// Session state update
{
  type: 'SESSION_UPDATED',
  session: SidePanelSession
}
```

### Chrome Storage Schema

| Key Pattern     | Type                    | Purpose                         |
| --------------- | ----------------------- | ------------------------------- |
| `last-session`  | `StoredSessionSnapshot` | Last active session for restore |
| `ws-{windowId}` | `SidePanelSession`      | Per-window session state        |

### Tauri Commands (Rust)

```rust
// State Management
get_state() -> WorkspaceState
toggle_sidebar() -> WorkspaceState
create_tab(url?: String) -> WorkspaceState

// Tab Operations
activate_tab(id: String) -> WorkspaceState
close_tab(id: String) -> WorkspaceState
navigate_tab(id: String, url: String) -> WorkspaceState

// Navigation
go_back(id: String)
go_forward(id: String)
reload_tab(id: String)
```

---

## 🧪 Testing

### Test Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TEST LAYERS                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🧪 Unit Tests (Vitest + jsdom)                              │
│  ├── url.test.ts          → URL parsing, normalization      │
│  └── workspace.test.ts    → Session CRUD operations         │
│                                                             │
│  🎭 E2E Tests (Playwright)                                   │
│  └── dock.spec.ts         → Extension loading, basic flow    │
│                                                             │
│  🔧 Integration                                              │
│  └── Chrome APIs          → Manual testing checklist         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Running Tests

```bash
# Unit tests
npm run test              # Run once
npm run test:watch        # Watch mode

# E2E tests (requires built extension)
npm run build
EXTENSION_PATH=$(pwd)/.output/chrome-mv3-dev npm run test:e2e
```

### Test Coverage

| File           | Coverage | Description                            |
| -------------- | -------- | -------------------------------------- |
| `url.ts`       | 100%     | URL validation, normalization, favicon |
| `workspace.ts` | 100%     | Session state management               |

### Manual Testing Checklist

- [ ] Extension loads without errors
- [ ] Sidebar opens with `Ctrl+Shift+Y`
- [ ] New tab creates successfully
- [ ] URL navigation works
- [ ] Search queries redirect to Google
- [ ] Back/forward buttons work
- [ ] Tab switching updates iframe
- [ ] Session persists after closing/reopening window
- [ ] Tab group "Sidebar Max" is created
- [ ] Media (YouTube) plays without interruption
- [ ] Favicons load correctly

---

## 🔧 Configuration

### WXT Configuration (`wxt.config.ts`)

```typescript
export default defineConfig({
  extensionApi: 'chrome',
  manifest: {
    name: 'Sidebar Max',
    version: '0.2.0',
    permissions: [
      'tabs', // Tab management
      'tabGroups', // Tab grouping
      'storage', // Session persistence
      'sidePanel', // Native side panel
      'declarativeNetRequest', // Header modification
      'favicon', // Favicon access
      'commands', // Keyboard shortcuts
      'scripting', // Script injection
      'alarms', // Background tasks
    ],
    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Ctrl+Shift+Y' },
      },
    },
  },
});
```

### Tauri Configuration (`tauri.conf.json`)

```json
{
  "productName": "sidebar-max",
  "version": "0.1.0",
  "identifier": "com.sidebar-max.app",
  "app": {
    "windows": [
      {
        "label": "main",
        "url": "src-app/index.html",
        "width": 420,
        "height": 900,
        "resizable": true,
        "decorations": true
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"]
  }
}
```

### ESLint Configuration (`eslint.config.mjs`)

```javascript
export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
```

---

## 🐛 Troubleshooting

### Common Issues

#### ❌ Extension Not Loading

**Problem**: Extension shows "Errors" button in chrome://extensions

**Solutions**:

1. Check that you ran `npm install` first
2. Ensure you're loading the correct folder (`.output/chrome-mv3-dev/`)
3. Try `npm run build` instead of `npm run dev` for testing
4. Check console for build errors

#### ❌ Websites Not Loading in Sidebar

**Problem**: Sites show "refused to connect" or blank page

**Solutions**:

1. Check `public/rules.json` is being loaded
2. Verify `declarativeNetRequest` permission is granted
3. Some sites (Google, Facebook) block iframe embedding - this is expected
4. Try sites like example.com, github.com, or wikipedia.org

#### ❌ Keyboard Shortcut Not Working

**Problem**: `Ctrl+Shift+Y` doesn't toggle panel

**Solutions**:

1. Check if shortcut conflicts with another extension
2. Go to `chrome://extensions/shortcuts` and verify binding
3. Try clicking the extension icon instead

#### ❌ Session Not Persisting

**Problem**: Tabs disappear when closing/reopening window

**Solutions**:

1. Check that `chrome.storage.local` is available
2. Look for errors in background service worker console
3. Verify `storage` permission is in manifest

#### ❌ Tauri App Won't Build

**Problem**: `npm run tauri:build` fails

**Solutions**:

```bash
# Update Rust
cd src-tauri && cargo update

# Check prerequisites
rustc --version  # Should be 1.70+
cargo --version

# Clean and rebuild
rm -rf src-tauri/target
npm run tauri:build
```

#### ❌ Media Stops Playing in Background Tab

**Problem**: YouTube/Spotify pauses when switching tabs

**This is expected behavior** - the auto-play injection runs every 24 seconds to resume media, but some sites have strict anti-autoplay policies.

### Debug Mode

Enable verbose logging:

```javascript
// In browser console (background service worker)
chrome.storage.local.get(null, console.log);

// Check current sessions
chrome.runtime.sendMessage({ type: 'GET_SESSION', windowId: 123 });
```

### Getting Help

1. **Check existing issues**: [GitHub Issues](https://github.com/sayuru-akash/sidebar-max-chrome/issues)
2. **Create new issue** with:
   - Chrome version
   - Extension version
   - Steps to reproduce
   - Screenshots if applicable

---

## 🗺️ Roadmap

### Current Version (0.1.0)

- ✅ Chrome Extension with sidePanel API
- ✅ Tauri Desktop App
- ✅ Session persistence
- ✅ Tab management
- ✅ URL normalization
- ✅ Frame header bypass

### Version 0.2.0 (Planned)

- 🔲 Settings panel (themes, search engine selection)
- 🔲 Draggable tab reordering
- 🔲 Import/export sessions
- 🔲 Keyboard shortcut customization
- 🔲 Pinned tabs (persist across sessions)

### Version 0.3.0 (Planned)

- 🔲 Split view (two tabs side-by-side)
- 🔲 Custom CSS injection per tab
- 🔲 Ad blocker integration
- 🔲 Download manager

### Version 1.0.0 (Future)

- 🔲 Native Swift macOS app (per SIDEPANEL_MACOS_APP_SPECIFICATION.md)
- 🔲 iCloud sync across devices
- 🔲 Plugin system
- 🔲 Password manager integration

### Long-term Vision

- 🎯 Windows/Linux desktop apps
- 🎯 Firefox extension
- 🎯 Mobile companion app
- 🎯 Cloud sync & collaboration

---

## 📜 Changelog

### [0.1.0] - 2024

#### Added

- 🎉 Initial release
- 🔶 Chrome Extension with sidePanel API integration
- 🔷 Tauri Desktop App for macOS/Windows/Linux
- 📑 Multi-tab workspace with session persistence
- 🔗 Chrome tab group integration ("Sidebar Max" group)
- 🖼️ X-Frame-Options and CSP header bypass
- 🔊 Background tab media keep-alive
- 🔍 Smart URL/search input detection
- 🎨 Glassmorphism UI design
- ⌨️ Keyboard shortcut support (Ctrl+Shift+Y)
- 🏷️ Favicon display via Google S2
- 🛡️ Zod schema validation for type safety
- 🧪 Comprehensive test suite (Vitest + Playwright)

#### Technical

- React 19.2.5 with TypeScript 6.0
- WXT framework for extension development
- Tauri v2 with Rust backend
- Zod 4.3.6 for runtime validation
- ESLint 10 + Prettier for code quality

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 Sidebar Max Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND...
```

---

## 🙏 Acknowledgments

### Open Source Libraries

| Library                                  | Purpose               | License        |
| ---------------------------------------- | --------------------- | -------------- |
| [React](https://react.dev)               | UI framework          | MIT            |
| [Tauri](https://tauri.app)               | Desktop app framework | MIT/Apache-2.0 |
| [WXT](https://wxt.dev)                   | Extension framework   | MIT            |
| [Zod](https://zod.dev)                   | Schema validation     | MIT            |
| [Vitest](https://vitest.dev)             | Unit testing          | MIT            |
| [Playwright](https://playwright.dev)     | E2E testing           | Apache-2.0     |
| [Vite](https://vitejs.dev)               | Build tool            | MIT            |
| [TypeScript](https://typescriptlang.org) | Type system           | Apache-2.0     |

### Special Thanks

- 🌟 [Chrome Extensions Team](https://developer.chrome.com/docs/extensions) for the sidePanel API
- 🌟 [Tauri Team](https://github.com/tauri-apps) for the amazing desktop framework
- 🌟 [WXT Team](https://github.com/wxt-dev/wxt) for simplifying extension development
- 🌟 All contributors and testers

---

<div align="center">

### ⭐ Star this repo if you find it useful! ⭐

**[🔝 Back to Top](#-sidebar-max)**

<p align="center">
  <sub>Built with ❤️ by the Sidebar Max Team</sub>
</p>

[![GitHub stars](https://img.shields.io/github/stars/sayuru-akash/sidebar-max-chrome?style=social)](https://github.com/sayuru-akash/sidebar-max-chrome/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/sayuru-akash/sidebar-max-chrome?style=social)](https://github.com/sayuru-akash/sidebar-max-chrome/fork)
[![GitHub issues](https://img.shields.io/github/issues/sayuru-akash/sidebar-max-chrome?style=social)](https://github.com/sayuru-akash/sidebar-max-chrome/issues)

</div>
