# Quick Note Sorter

An Obsidian plugin for quickly capturing notes and sorting them into categorized folders.

## Features

- **Quick Capture** — Ribbon icon + command palette to instantly jot down a note. Notes land in an Inbox folder.
- **Sort Current Note** — Move the note you're looking at into any folder with a fuzzy-search picker.
- **Batch Inbox Sorting** — Walk through every unsorted note in your Inbox one by one, preview each, and assign a category.
- **Keyword Auto-Suggest** — Map keywords to folders (e.g. "standup" → "Work/Meetings"). When you sort, the plugin suggests a category if it finds a match.

## How to use

1. Open the command palette and run **Quick Note Sorter: Capture quick note**, or click the inbox icon in the ribbon.
2. Type your note. Click **Save to Inbox** to dump it for later, or **Save & Categorize** to file it immediately.
3. To sort accumulated notes, run **Quick Note Sorter: Sort all notes in inbox**.

## Settings

- **Inbox folder** — Where quick notes land before being sorted (default: `Inbox`).
- **Default categories** — Comma-separated list of folders that always appear in the picker.
- **Auto-suggest** — Toggle keyword-based suggestions on/off.
- **Keyword map** — Add keyword → folder mappings.

## Installation

- Copy `main.js`, `styles.css`, `manifest.json` to your vault's `.obsidian/plugins/quick-note-sorter/` folder.

## Development

- Clone this repo into your vault's `.obsidian/plugins/` folder.
- `npm i` to install dependencies.
- `npm run dev` to start compilation in watch mode.
