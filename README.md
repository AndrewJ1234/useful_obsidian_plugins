# Useful Obsidian Plugins

A collection of useful plugins for Obsidian.md that enhance productivity and vault management.

## Plugins

### [Folder TOC](folder-toc/)
Automatically creates and maintains table of contents files in every folder, keeping your graph view connected.

- Auto-create TOCs when folders are made
- Auto-update when files are added/removed/renamed
- Grouped by subfolders with backlinks
- Batch commands for setup

### [Quick Note Sorter](quick-note-sorter/)
Quickly capture notes and sort them into categorized folders using hotkeys.

- Instant note capture with ribbon icon or hotkey
- Fuzzy-search picker for sorting into folders
- Batch inbox sorting
- Keyword auto-suggestions

### [Vault Navigator](vault-navigator/)
A compact file tree navigator with advanced features for large vaults.

- Favorites and recents sections
- Folder pinning and sorting options
- Inline filtering and search
- File counts and hover previews
- Auto-collapse for deep structures

### [Vault Terminal](vault-terminal/)
Terminal interface for vault management with shell-like commands.

- Navigate with `cd`, `ls`, `pwd`
- Create files/folders with `touch`, `mkdir`
- Edit files inline with `nano`
- Search with `find`, `tree`
- Manage hotkeys with `bind`, `unbind`

## Installation

Each plugin can be installed by copying its `main.js`, `styles.css`, and `manifest.json` files to your vault's `.obsidian/plugins/[plugin-id]/` folder.

For development, clone the plugin folder into `.obsidian/plugins/`, run `npm install`, and use `npm run dev` for watch mode compilation.

## Contributing

These plugins are developed for personal use. Feel free to fork and modify for your own needs.