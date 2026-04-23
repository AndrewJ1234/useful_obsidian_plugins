# Vault Navigator

A compact file tree with folder pinning, recency sorting, file counts, auto-collapse, and inline filtering.

## Features

- **Compact file tree** — A space-efficient file browser with customizable density.
- **Favorites** — Star important files for quick access.
- **Recents** — Automatically tracks and displays recently opened files.
- **Folder pinning** — Pin frequently used folders to the top of the tree.
- **Inline filtering** — Type to filter files and folders instantly.
- **File counts** — See how many notes are in each folder.
- **Auto-collapse** — Automatically collapse deep folder structures.
- **Hover previews** — Preview file contents on hover.
- **Context menus** — Right-click for quick actions like opening in new tabs or deleting files.

## How to use

1. Enable the plugin. The navigator will appear in the left sidebar.
2. Click the folder tree icon in the ribbon to toggle the navigator.
3. Use the search bar at the top to filter files and folders.
4. Star files to add them to favorites.
5. Pin folders to keep them at the top of the tree.
6. Hover over files to see content previews (if enabled).

## Settings

- **Max recent files** — How many recently opened files to show (3-20).
- **Show preview on hover** — Enable/disable content previews.
- **Preview length** — Number of characters to show in previews (50-400).
- **Sort mode** — How to sort folders: most recently used, alphabetical, or last modified.
- **Auto-collapse depth** — Folders deeper than this are collapsed by default (0-5).
- **Show file count** — Display the number of notes next to each folder.
- **Compact mode** — Reduce padding and font size for a denser tree.

## Installation

- Copy `main.js`, `styles.css`, `manifest.json` to your vault's `.obsidian/plugins/vault-navigator/` folder.

## Development

- Clone this repo into your vault's `.obsidian/plugins/` folder.
- `npm i` to install dependencies.
- `npm run dev` to start compilation in watch mode.