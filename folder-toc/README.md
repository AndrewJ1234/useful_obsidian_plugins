# Folder Table of Contents

An Obsidian plugin that automatically creates and maintains a `_Index.md` table of contents in every folder, keeping your graph view connected.

## Features

- **Auto-create on folder create** — When you make a new folder, an `_Index.md` appears inside it.
- **Auto-update** — When you add, delete, rename, or move a note, the parent folder's TOC updates automatically.
- **Grouped by subfolder** — TOC entries are organized under subfolder headings, with links to each subfolder's own TOC.
- **Parent backlinks** — Each TOC links back to its parent folder's TOC, so your graph stays connected top-to-bottom.
- **Batch commands** — "Create TOCs for all folders" and "Update all TOCs" for one-shot setup.

## How to use

1. Enable the plugin. From now on, every new folder gets a `_Index.md`.
2. To backfill existing folders, run **Folder TOC: Create TOCs for all folders** from the command palette.
3. Notes are automatically added/removed from the TOC as you work.

## Settings

- **TOC file name** — What to call the TOC file (default: `_Index`).
- **Auto-update** / **Auto-create** — Toggle automatic behavior.
- **Include subfolders** / **Group by subfolder** — Control TOC depth and layout.
- **Sort order** — Alphabetical, last modified, or date created.
- **Link style** — Wiki `[[links]]` or markdown `[links](url)`.
- **Excluded folders** — Skip folders like `.obsidian` or `templates`.

## Installation

- Copy `main.js`, `styles.css`, `manifest.json` to your vault's `.obsidian/plugins/folder-toc/` folder.

## Development

- Clone this repo into your vault's `.obsidian/plugins/` folder.
- `npm i` to install dependencies.
- `npm run dev` to start compilation in watch mode.
