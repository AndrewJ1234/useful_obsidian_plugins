# Vault Terminal

A terminal interface for your vault. Create files, navigate folders, and manage your vault with shell commands.

## Features

- **Shell commands** — Navigate and manage your vault using familiar terminal commands.
- **File operations** — Create, move, delete, and edit files and folders.
- **Inline editing** — Edit files directly in the terminal with the `nano` command.
- **Search and navigation** — Find files, list directories, and navigate with `cd`, `ls`, `find`, etc.
- **Hotkey management** — View and modify Obsidian hotkeys with `hotkeys`, `bind`, and `unbind`.
- **Command history** — Use arrow keys to navigate through previous commands.

## How to use

1. Enable the plugin. Use the command palette or ribbon icon to open the terminal.
2. Type commands at the prompt. Use `help` to see available commands.
3. Press Ctrl+` to toggle the terminal quickly.
4. Use `nano <filename>` to edit files inline.

## Available Commands

- `pwd` — Print working directory
- `ls [path]` — List folder contents (`-l` for vertical, `-a` for hidden)
- `cd <path>` — Change directory
- `touch <name> [n2]` — Create note(s) (.md auto-added)
- `mkdir <name>` — Create folder
- `rm <name>` — Delete file or empty folder
- `mv <src> <dest>` — Move/rename
- `cat <file>` — Print file contents
- `open <file>` — Open in Obsidian editor
- `nano <file>` — Edit file inline
- `find <query>` — Search files by name
- `tree [path]` — Show folder tree
- `hotkeys [filter]` — List all hotkeys
- `bind <cmd> <key>` — Set hotkey
- `unbind <cmd>` — Remove hotkey
- `clear` — Clear terminal
- `echo <text>` — Print text
- `help` — Show help

## Examples

```
$ ls
Documents/  Notes/  Projects/

$ cd Documents
~/Documents $ touch my-note
Created ~/Documents/my-note.md

~/Documents $ nano my-note.md
# Edit your file here
# Press Ctrl+S to save, Ctrl+X to exit

~/Documents $ cat my-note.md
# Edit your file here
# Press Ctrl+S to save, Ctrl+X to exit

~/Documents $ find meeting
~/Documents/meeting-notes.md
~/Projects/client-meeting.md
```

## Settings

No settings are available for this plugin.

## Installation

- Copy `main.js`, `styles.css`, `manifest.json` to your vault's `.obsidian/plugins/vault-terminal/` folder.

## Development

- Clone this repo into your vault's `.obsidian/plugins/` folder.
- `npm i` to install dependencies.
- `npm run dev` to start compilation in watch mode.