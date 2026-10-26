# Winget App Catalog

A modern, dark-mode Windows desktop app to **browse, search, install, update and uninstall** apps using the Windows Package Manager (`winget`) — styled like the Microsoft Store.

Built with **Electron.js**.

---

## Features

- 🔍 **Search** — Instant winget search with up to 50 results, clear button, and search context preservation
- 🏠 **Home** — Category browsing chips + rotating featured apps with skeleton loading
- 🔄 **Updates** — Dedicated updates page with per-app update actions, Update All, and a nav badge showing pending updates
- 📦 **Library** — All winget-managed installed apps with live filter/search and refresh
- ⬇️ **Install** — One-click install with streaming output, version selection, and status feedback
- 🎯 **Specific Version** — Choose any available version from a dropdown in the detail modal
- ⬆️ **Update** — Individual and bulk update with real-time progress
- 🗑️ **Uninstall** — Confirmed uninstall with a clean confirm dialog and live output
- 📦 **Bundles** — Create, edit, install, export and import reusable app collections (saved as JSON)
- 📋 **History** — Persistent log of all installations, updates, and removals with timestamps
- ℹ️ **App Details** — Publisher and description loaded from `winget show`
- 📋 **Copy Command** — Copies the accurate winget install command (respecting selected version)
- 📄 **Console Output** — Copy or clear streaming output from any operation
- ⌨️ **Shortcuts** — `Ctrl+F` to search, `Esc` to close modals, `Ctrl+R` to refresh library/updates

## Requirements

- Windows 10/11
- [Windows Package Manager (winget)](https://github.com/microsoft/winget-cli) — pre-installed on Windows 11

## Running from Source

```bash
git clone https://github.com/caesium06/WingetAppInstaller.git
cd WingetAppInstaller
npm install
npm start
```

## Build

```bash
npm run build
```

Outputs an NSIS installer to `dist/`.

## Download

Grab the latest `.exe` installer from the [Releases](../../releases) page — no Node.js required.

## License

MIT
