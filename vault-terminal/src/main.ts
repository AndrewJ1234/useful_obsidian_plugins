import {App, ItemView, Plugin, TFile, TFolder, WorkspaceLeaf} from "obsidian";

const VIEW_TYPE = "vault-terminal";

export default class VaultTerminalPlugin extends Plugin {
	async onload() {
		this.registerView(VIEW_TYPE, (leaf) => new TerminalView(leaf));

		this.addCommand({
			id: "toggle-terminal",
			name: "Toggle terminal",
			hotkeys: [{modifiers: ["Ctrl"], key: "`"}],
			callback: () => this.toggleTerminal(),
		});

		this.addRibbonIcon("terminal", "Vault Terminal", () => this.toggleTerminal());
	}

	onunload() {}

	async toggleTerminal() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length > 0) {
			for (const leaf of existing) leaf.detach();
		} else {
			const leaf = this.app.workspace.getLeaf("split", "horizontal");
			await leaf.setViewState({type: VIEW_TYPE, active: true});
			this.app.workspace.revealLeaf(leaf);
			const view = leaf.view;
			if (view instanceof TerminalView) view.focusInput();
		}
	}
}

// ─── Shell ───────────────────────────────────────────────────────────────────

interface ShellResult {
	type: "text" | "columns" | "clear" | "nano";
	lines?: string[];
	columns?: string[];
	file?: TFile;
}

class VaultShell {
	app: App;
	cwd: string;
	history: string[] = [];
	historyIndex: number = -1;

	constructor(app: App) {
		this.app = app;
		this.cwd = "";
	}

	getPrompt(): string {
		const display = this.cwd === "" ? "~" : `~/${this.cwd}`;
		return `${display} $ `;
	}

	resolvePath(input: string): string {
		if (input.startsWith("/")) return input.slice(1).replace(/\/+$/, "");
		const parts = this.cwd === "" ? [] : this.cwd.split("/");
		for (const seg of input.split("/")) {
			if (seg === "." || seg === "") continue;
			if (seg === "..") parts.pop();
			else parts.push(seg);
		}
		return parts.join("/");
	}

	parseArgs(input: string): string[] {
		const result: string[] = [];
		let current = "";
		let inQuote = false;
		let qChar = "";
		for (const ch of input) {
			if (inQuote) {
				if (ch === qChar) inQuote = false;
				else current += ch;
			} else if (ch === '"' || ch === "'") {
				inQuote = true; qChar = ch;
			} else if (ch === " ") {
				if (current) { result.push(current); current = ""; }
			} else current += ch;
		}
		if (current) result.push(current);
		return result;
	}

	async execute(input: string): Promise<ShellResult[]> {
		const trimmed = input.trim();
		if (!trimmed) return [];
		this.history.push(trimmed);
		this.historyIndex = this.history.length;

		const tokens = this.parseArgs(trimmed);
		const cmd = tokens[0].toLowerCase();
		const args = tokens.slice(1);

		switch (cmd) {
			case "help":    return this.cmdHelp();
			case "pwd":     return [{type: "text", lines: ["/" + this.cwd]}];
			case "ls":      return this.cmdLs(args);
			case "cd":      return this.cmdCd(args);
			case "touch":   return await this.cmdTouch(args);
			case "mkdir":   return await this.cmdMkdir(args);
			case "rm":      return await this.cmdRm(args);
			case "mv":      return await this.cmdMv(args);
			case "cat":     return await this.cmdCat(args);
			case "open":    return await this.cmdOpen(args);
			case "nano":    return await this.cmdNano(args);
			case "find":    return this.cmdFind(args);
			case "tree":    return this.cmdTree(args);
			case "hotkeys": return this.cmdHotkeys(args);
			case "bind":    return this.cmdBind(args);
			case "unbind":  return this.cmdBind(args.length > 0 ? [args[0], "none"] : []);
			case "clear":   return [{type: "clear"}];
			case "echo":    return [{type: "text", lines: [args.join(" ")]}];
			default:
				return [{type: "text", lines: [`command not found: ${cmd}. Type 'help' for commands.`]}];
		}
	}

	cmdHelp(): ShellResult[] {
		return [{type: "text", lines: [
			"Available commands:",
			"  pwd                    Print working directory",
			"  ls [path]              List folder contents (-l vertical)",
			"  cd <path>              Change directory",
			"  touch <name> [n2]      Create note(s) (.md auto-added)",
			"  mkdir <name>           Create folder",
			"  rm <name>              Delete file or empty folder",
			"  mv <src> <dest>        Move/rename",
			"  cat <file>             Print file contents",
			"  open <file>            Open in Obsidian editor",
			"  nano <file>            Edit file inline",
			"  find <query>           Search files by name",
			"  tree [path]            Show folder tree",
			"  hotkeys [filter]       List all hotkeys",
			"  bind <cmd> <key>       Set hotkey",
			"  unbind <cmd>           Remove hotkey",
			"  clear                  Clear terminal",
			"  help                   Show this help",
		]}];
	}

	cmdLs(args: string[]): ShellResult[] {
		const showHidden = args.includes("-a");
		const longFormat = args.includes("-l");
		const targetArgs = args.filter(a => !a.startsWith("-"));
		const targetPath = targetArgs.length > 0 ? this.resolvePath(targetArgs[0]) : this.cwd;

		const folder = targetPath === ""
			? this.app.vault.getRoot()
			: this.app.vault.getAbstractFileByPath(targetPath);

		if (!folder || !(folder instanceof TFolder))
			return [{type: "text", lines: [`ls: ${targetPath || "/"}: No such directory`]}];

		const folderNames: string[] = [];
		const fileNames: string[] = [];

		for (const child of folder.children) {
			if (!showHidden && child.name.startsWith(".")) continue;
			if (child instanceof TFolder) folderNames.push(child.name + "/");
			else if (child instanceof TFile) fileNames.push(child.name);
		}

		folderNames.sort((a, b) => a.localeCompare(b));
		fileNames.sort((a, b) => a.localeCompare(b));
		const all = [...folderNames, ...fileNames];

		if (all.length === 0) return [{type: "text", lines: ["(empty)"]}];
		if (longFormat) return [{type: "text", lines: all}];
		return [{type: "columns", columns: all}];
	}

	cmdCd(args: string[]): ShellResult[] {
		if (args.length === 0 || args[0] === "~" || args[0] === "/") {
			this.cwd = "";
			return [];
		}
		const target = this.resolvePath(args[0]);
		if (target === "") { this.cwd = ""; return []; }
		const folder = this.app.vault.getAbstractFileByPath(target);
		if (!folder || !(folder instanceof TFolder))
			return [{type: "text", lines: [`cd: ${args[0]}: No such directory`]}];
		this.cwd = target;
		return [];
	}

	async cmdTouch(args: string[]): Promise<ShellResult[]> {
		if (args.length === 0) return [{type: "text", lines: ["touch: missing file name"]}];
		const lines: string[] = [];
		for (const arg of args) {
			let name = arg;
			if (!name.includes(".")) name += ".md";
			const fullPath = this.cwd === "" ? name : `${this.cwd}/${name}`;
			if (this.app.vault.getAbstractFileByPath(fullPath)) {
				lines.push(`touch: ${name}: already exists`);
				continue;
			}
			try {
				await this.app.vault.create(fullPath, "");
				lines.push(`Created ${fullPath}`);
			} catch (e) { lines.push(`touch: ${name}: ${(e as Error).message}`); }
		}
		return [{type: "text", lines}];
	}

	async cmdMkdir(args: string[]): Promise<ShellResult[]> {
		if (args.length === 0) return [{type: "text", lines: ["mkdir: missing folder name"]}];
		const lines: string[] = [];
		for (const arg of args) {
			const fullPath = this.resolvePath(arg);
			if (this.app.vault.getAbstractFileByPath(fullPath)) {
				lines.push(`mkdir: ${arg}: already exists`);
				continue;
			}
			try {
				await this.app.vault.createFolder(fullPath);
				lines.push(`Created folder ${fullPath}`);
			} catch (e) { lines.push(`mkdir: ${arg}: ${(e as Error).message}`); }
		}
		return [{type: "text", lines}];
	}

	async cmdRm(args: string[]): Promise<ShellResult[]> {
		if (args.length === 0) return [{type: "text", lines: ["rm: missing file name"]}];
		const lines: string[] = [];
		for (const arg of args) {
			let fullPath = this.resolvePath(arg);
			let file = this.app.vault.getAbstractFileByPath(fullPath);
			if (!file && !fullPath.includes(".")) {
				file = this.app.vault.getAbstractFileByPath(fullPath + ".md");
				if (file) fullPath += ".md";
			}
			if (!file) { lines.push(`rm: ${arg}: not found`); continue; }
			if (file instanceof TFolder && file.children.length > 0) { lines.push(`rm: ${arg}: directory not empty`); continue; }
			try {
				await this.app.vault.trash(file, true);
				lines.push(`Removed ${fullPath}`);
			} catch (e) { lines.push(`rm: ${arg}: ${(e as Error).message}`); }
		}
		return [{type: "text", lines}];
	}

	async cmdMv(args: string[]): Promise<ShellResult[]> {
		if (args.length < 2) return [{type: "text", lines: ["mv: need source and destination"]}];
		let srcPath = this.resolvePath(args[0]);
		let src = this.app.vault.getAbstractFileByPath(srcPath);
		if (!src && !srcPath.includes(".")) {
			src = this.app.vault.getAbstractFileByPath(srcPath + ".md");
			if (src) srcPath += ".md";
		}
		if (!src) return [{type: "text", lines: [`mv: ${args[0]}: not found`]}];

		let destPath = this.resolvePath(args[1]);
		const dest = this.app.vault.getAbstractFileByPath(destPath);
		if (dest && dest instanceof TFolder) destPath = `${destPath}/${src.name}`;
		else if (src instanceof TFile && !destPath.includes(".")) destPath += "." + src.extension;

		try {
			await this.app.fileManager.renameFile(src, destPath);
			return [{type: "text", lines: [`${srcPath} → ${destPath}`]}];
		} catch (e) { return [{type: "text", lines: [`mv: ${(e as Error).message}`]}]; }
	}

	async cmdCat(args: string[]): Promise<ShellResult[]> {
		if (args.length === 0) return [{type: "text", lines: ["cat: missing file name"]}];
		let fullPath = this.resolvePath(args[0]);
		let file = this.app.vault.getAbstractFileByPath(fullPath);
		if (!file && !fullPath.includes(".")) file = this.app.vault.getAbstractFileByPath(fullPath + ".md");
		if (!file || !(file instanceof TFile)) return [{type: "text", lines: [`cat: ${args[0]}: not found`]}];
		try {
			const content = await this.app.vault.cachedRead(file);
			const preview = content.length > 2000 ? content.substring(0, 2000) + "\n... (truncated)" : content;
			return [{type: "text", lines: (preview || "(empty file)").split("\n")}];
		} catch (e) { return [{type: "text", lines: [`cat: ${(e as Error).message}`]}]; }
	}

	async cmdOpen(args: string[]): Promise<ShellResult[]> {
		if (args.length === 0) return [{type: "text", lines: ["open: missing file name"]}];
		let fullPath = this.resolvePath(args[0]);
		let file = this.app.vault.getAbstractFileByPath(fullPath);
		if (!file && !fullPath.includes(".")) file = this.app.vault.getAbstractFileByPath(fullPath + ".md");
		if (!file || !(file instanceof TFile)) return [{type: "text", lines: [`open: ${args[0]}: not found`]}];
		await this.app.workspace.getLeaf(false).openFile(file);
		return [{type: "text", lines: [`Opened ${file.path}`]}];
	}

	async cmdNano(args: string[]): Promise<ShellResult[]> {
		if (args.length === 0) return [{type: "text", lines: ["nano: missing file name"]}];
		let fullPath = this.resolvePath(args[0]);
		let file = this.app.vault.getAbstractFileByPath(fullPath);
		if (!file && !fullPath.includes(".")) {
			file = this.app.vault.getAbstractFileByPath(fullPath + ".md");
			if (file) fullPath += ".md";
		}
		if (!file) {
			if (!fullPath.includes(".")) fullPath += ".md";
			try {
				const newFile = await this.app.vault.create(fullPath, "");
				return [{type: "nano", file: newFile}];
			} catch (e) { return [{type: "text", lines: [`nano: ${(e as Error).message}`]}]; }
		}
		if (!(file instanceof TFile)) return [{type: "text", lines: [`nano: ${args[0]}: is a directory`]}];
		return [{type: "nano", file: file}];
	}

	cmdFind(args: string[]): ShellResult[] {
		if (args.length === 0) return [{type: "text", lines: ["find: missing search query"]}];
		const query = args.join(" ").toLowerCase();
		const matches = this.app.vault.getFiles()
			.filter(f => f.path.toLowerCase().includes(query))
			.slice(0, 30);
		if (matches.length === 0) return [{type: "text", lines: ["No files found."]}];
		return [{type: "text", lines: matches.map(f => f.path)}];
	}

	cmdTree(args: string[]): ShellResult[] {
		const targetPath = args.length > 0 ? this.resolvePath(args[0]) : this.cwd;
		const folder = targetPath === ""
			? this.app.vault.getRoot()
			: this.app.vault.getAbstractFileByPath(targetPath);
		if (!folder || !(folder instanceof TFolder))
			return [{type: "text", lines: [`tree: ${targetPath || "/"}: not found`]}];
		const lines: string[] = [targetPath === "" ? "/" : folder.name];
		this.buildTree(folder, "", lines, 0);
		return [{type: "text", lines}];
	}

	private buildTree(folder: TFolder, prefix: string, lines: string[], depth: number) {
		if (depth > 4) { lines.push(`${prefix}└── ...`); return; }
		const children = [...folder.children]
			.filter(c => !c.name.startsWith("."))
			.sort((a, b) => {
				if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
				if (!(a instanceof TFolder) && b instanceof TFolder) return 1;
				return a.name.localeCompare(b.name);
			});
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const isLast = i === children.length - 1;
			const connector = isLast ? "└── " : "├── ";
			const childPrefix = isLast ? "    " : "│   ";
			if (child instanceof TFolder) {
				lines.push(`${prefix}${connector}${child.name}/`);
				this.buildTree(child, prefix + childPrefix, lines, depth + 1);
			} else {
				lines.push(`${prefix}${connector}${child.name}`);
			}
		}
	}

	cmdHotkeys(args: string[]): ShellResult[] {
		const app = this.app as any;
		const commands = app.commands?.commands as Record<string, any> | undefined;
		const hkm = app.hotkeyManager;
		if (!commands) return [{type: "text", lines: ["hotkeys: could not access commands"]}];

		const filter = args.join(" ").toLowerCase();
		const entries: string[] = [];
		const list = Object.values(commands) as any[];
		list.sort((a: any, b: any) => (a.name || a.id).localeCompare(b.name || b.id));

		for (const cmd of list) {
			const id: string = cmd.id || "";
			const name: string = cmd.name || id;
			if (filter && !name.toLowerCase().includes(filter) && !id.toLowerCase().includes(filter)) continue;
			const customKeys = hkm?.customKeys?.[id];
			const defaultKeys = cmd.hotkeys || hkm?.defaultKeys?.[id];
			const activeKeys = customKeys && customKeys.length > 0 ? customKeys : defaultKeys;
			const hotkeys: string[] = [];
			if (activeKeys) {
				for (const hk of activeKeys) {
					const parts: string[] = [];
					if (hk.modifiers) for (const m of hk.modifiers) parts.push(m === "Mod" ? "Ctrl" : m);
					if (hk.key) parts.push(hk.key);
					hotkeys.push(parts.join("+"));
				}
			}
			entries.push(`  ${(hotkeys.join(", ") || "(none)").padEnd(24)} ${name}`);
		}
		if (entries.length === 0) return [{type: "text", lines: [`No commands matching "${filter}".`]}];
		return [{type: "text", lines: [`  ${"HOTKEY".padEnd(24)} COMMAND`, `  ${"─".repeat(24)} ${"─".repeat(40)}`, ...entries]}];
	}

	cmdBind(args: string[]): ShellResult[] {
		if (args.length < 2) return [{type: "text", lines: ["Usage: bind <command-id> <hotkey>", "Example: bind editor:toggle-bold Ctrl+B"]}];
		const commandId = args[0];
		const hotkeyStr = args.slice(1).join(" ");
		const app = this.app as any;
		const commands = app.commands?.commands;
		const hkm = app.hotkeyManager;
		if (!commands || !hkm) return [{type: "text", lines: ["bind: could not access hotkey manager"]}];
		if (!commands[commandId]) {
			const matches = Object.keys(commands).filter(id => id.includes(commandId));
			if (matches.length === 1) return this.cmdBind([matches[0], ...args.slice(1)]);
			if (matches.length > 1) return [{type: "text", lines: [`Ambiguous: ${matches.slice(0, 5).join(", ")}`]}];
			return [{type: "text", lines: [`bind: unknown command "${commandId}"`]}];
		}
		if (hotkeyStr === "none" || hotkeyStr === "-") {
			try { hkm.setHotkeys(commandId, []); return [{type: "text", lines: [`Removed hotkeys from ${commands[commandId].name || commandId}`]}]; }
			catch (e) { return [{type: "text", lines: [`bind: ${(e as Error).message}`]}]; }
		}
		const parts = hotkeyStr.split("+").map(p => p.trim());
		const key = parts.pop() || "";
		const modifiers: string[] = [];
		for (const p of parts) {
			const l = p.toLowerCase();
			if (l === "ctrl" || l === "cmd" || l === "mod") modifiers.push("Mod");
			else if (l === "shift") modifiers.push("Shift");
			else if (l === "alt" || l === "opt") modifiers.push("Alt");
			else return [{type: "text", lines: [`bind: unknown modifier "${p}"`]}];
		}
		try {
			hkm.setHotkeys(commandId, [{modifiers, key}]);
			return [{type: "text", lines: [`Bound ${hotkeyStr} → ${commands[commandId].name || commandId}`]}];
		} catch (e) { return [{type: "text", lines: [`bind: ${(e as Error).message}`]}]; }
	}
}

// ─── Terminal View ───────────────────────────────────────────────────────────

class TerminalView extends ItemView {
	shell: VaultShell;
	termEl: HTMLElement;
	currentInputEl: HTMLInputElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.shell = new VaultShell(this.app);
	}

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "Terminal"; }
	getIcon(): string { return "terminal"; }

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("vt");

		this.termEl = container.createDiv({cls: "vt-scroll"});

		// Welcome
		this.appendText("Vault Terminal v1.0 — type 'help' for commands\n");

		// First prompt
		this.appendPrompt();

		// Click anywhere to focus
		container.addEventListener("click", () => {
			if (this.currentInputEl) this.currentInputEl.focus();
		});
	}

	focusInput() {
		setTimeout(() => {
			if (this.currentInputEl) this.currentInputEl.focus();
		}, 100);
	}

	// ── Rendering helpers ────────────────────────────────────────────────────

	appendText(text: string, cls: string = "vt-output") {
		const el = this.termEl.createDiv({cls});
		el.textContent = text;
	}

	appendColumns(items: string[]) {
		const el = this.termEl.createDiv({cls: "vt-columns"});
		for (const item of items) {
			const span = el.createEl("span", {cls: "vt-col-item"});
			// Directories get highlighted
			if (item.endsWith("/")) span.addClass("vt-dir");
			span.textContent = item;
		}
	}

	appendPrompt() {
		const line = this.termEl.createDiv({cls: "vt-prompt-line"});
		const promptSpan = line.createEl("span", {cls: "vt-prompt"});
		promptSpan.textContent = this.shell.getPrompt();

		const input = line.createEl("input", {
			cls: "vt-input",
			attr: {type: "text", spellcheck: "false", autocomplete: "off"},
		});

		this.currentInputEl = input;

		input.addEventListener("keydown", (e) => this.handleKey(e, input, line));

		input.focus();
		this.scrollToBottom();
	}

	async handleKey(e: KeyboardEvent, input: HTMLInputElement, promptLine: HTMLElement) {
		if (e.key === "Enter") {
			e.preventDefault();
			const value = input.value;

			// Freeze the prompt line — replace input with static text
			input.remove();
			const typed = promptLine.createEl("span", {cls: "vt-typed"});
			typed.textContent = value;

			// Execute
			const results = await this.shell.execute(value);

			for (const result of results) {
				if (result.type === "clear") {
					this.termEl.empty();
				} else if (result.type === "columns" && result.columns) {
					this.appendColumns(result.columns);
				} else if (result.type === "nano" && result.file) {
					this.enterNano(result.file);
					return; // Don't append new prompt — nano takes over
				} else if (result.type === "text" && result.lines) {
					this.appendText(result.lines.join("\n"));
				}
			}

			this.appendPrompt();

		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (this.shell.historyIndex > 0) {
				this.shell.historyIndex--;
				input.value = this.shell.history[this.shell.historyIndex];
				setTimeout(() => input.selectionStart = input.selectionEnd = input.value.length, 0);
			}
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			if (this.shell.historyIndex < this.shell.history.length - 1) {
				this.shell.historyIndex++;
				input.value = this.shell.history[this.shell.historyIndex];
			} else {
				this.shell.historyIndex = this.shell.history.length;
				input.value = "";
			}
		} else if (e.key === "Tab") {
			e.preventDefault();
			this.handleTab(input);
		} else if (e.key === "l" && e.ctrlKey) {
			e.preventDefault();
			this.termEl.empty();
			this.appendPrompt();
		}
	}

	handleTab(input: HTMLInputElement) {
		const text = input.value;
		const tokens = this.shell.parseArgs(text);
		const partial = tokens.length > 0 ? tokens[tokens.length - 1] : "";

		let searchDir: string;
		let namePrefix: string;

		if (partial.includes("/")) {
			const lastSlash = partial.lastIndexOf("/");
			namePrefix = partial.substring(lastSlash + 1).toLowerCase();
			searchDir = this.shell.resolvePath(partial.substring(0, lastSlash));
		} else {
			namePrefix = partial.toLowerCase();
			searchDir = this.shell.cwd;
		}

		const folder = searchDir === ""
			? this.app.vault.getRoot()
			: this.app.vault.getAbstractFileByPath(searchDir);
		if (!folder || !(folder instanceof TFolder)) return;

		const matches = folder.children
			.filter(c => c.name.toLowerCase().startsWith(namePrefix))
			.sort((a, b) => a.name.localeCompare(b.name));

		if (matches.length === 0) return;

		if (matches.length === 1) {
			const match = matches[0];
			const completion = match instanceof TFolder ? match.name + "/" : match.name;
			if (text.includes(" ")) {
				const lastSpace = text.lastIndexOf(" ");
				const prefix = text.substring(0, lastSpace + 1);
				if (partial.includes("/")) {
					const lastSlash = partial.lastIndexOf("/");
					input.value = prefix + partial.substring(0, lastSlash + 1) + completion;
				} else {
					input.value = prefix + completion;
				}
			} else {
				input.value = completion;
			}
		} else {
			const names = matches.map(m => m instanceof TFolder ? m.name + "/" : m.name);
			this.appendColumns(names);
			this.scrollToBottom();
		}
	}

	scrollToBottom() {
		requestAnimationFrame(() => {
			this.termEl.scrollTop = this.termEl.scrollHeight;
		});
	}

	// ── Nano mode ────────────────────────────────────────────────────────────

	async enterNano(file: TFile) {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("vt");

		const content = await this.app.vault.cachedRead(file);

		// Top bar
		const topBar = container.createDiv({cls: "nano-topbar"});
		topBar.createEl("span", {cls: "nano-title", text: `  nano — ${file.path}`});
		const modBadge = topBar.createEl("span", {cls: "nano-modified"});

		// Editor
		const editorArea = container.createDiv({cls: "nano-editor"});
		const textarea = editorArea.createEl("textarea", {
			cls: "nano-textarea",
			attr: {spellcheck: "false"},
		});
		textarea.value = content;

		let dirty = false;

		textarea.addEventListener("input", () => {
			dirty = true;
			modBadge.textContent = " [Modified]";
		});

		// Bottom
		const bottom = container.createDiv({cls: "nano-bottom"});
		const row1 = bottom.createDiv({cls: "nano-shortcut-row"});
		this.nanoKey(row1, "^S", "Save");
		this.nanoKey(row1, "^X", "Exit");
		this.nanoKey(row1, "^K", "Cut");
		this.nanoKey(row1, "^U", "Paste");
		this.nanoKey(row1, "^W", "Find");
		const status = bottom.createDiv({cls: "nano-status"});

		let clipboard = "";

		textarea.addEventListener("keydown", async (e: KeyboardEvent) => {
			if (e.ctrlKey && e.key === "s") {
				e.preventDefault();
				await this.app.vault.modify(file, textarea.value);
				dirty = false;
				modBadge.textContent = "";
				status.textContent = `  [ Wrote ${textarea.value.split("\n").length} lines ]`;
				setTimeout(() => status.textContent = "", 3000);
			} else if (e.ctrlKey && e.key === "x") {
				e.preventDefault();
				if (dirty) { status.textContent = "  Save first (Ctrl+S), then exit"; return; }
				this.exitNano();
			} else if (e.ctrlKey && e.key === "k") {
				e.preventDefault();
				const val = textarea.value;
				const start = textarea.selectionStart;
				const lineStart = val.lastIndexOf("\n", start - 1) + 1;
				let lineEnd = val.indexOf("\n", start);
				if (lineEnd === -1) lineEnd = val.length; else lineEnd++;
				clipboard = val.substring(lineStart, lineEnd);
				textarea.value = val.substring(0, lineStart) + val.substring(lineEnd);
				textarea.selectionStart = textarea.selectionEnd = lineStart;
				dirty = true; modBadge.textContent = " [Modified]";
			} else if (e.ctrlKey && e.key === "u") {
				e.preventDefault();
				if (!clipboard) return;
				const pos = textarea.selectionStart;
				const val = textarea.value;
				textarea.value = val.substring(0, pos) + clipboard + val.substring(pos);
				textarea.selectionStart = textarea.selectionEnd = pos + clipboard.length;
				dirty = true; modBadge.textContent = " [Modified]";
			} else if (e.ctrlKey && e.key === "w") {
				e.preventDefault();
				const q = prompt("Search:");
				if (q) {
					const idx = textarea.value.indexOf(q, textarea.selectionEnd);
					if (idx !== -1) { textarea.selectionStart = idx; textarea.selectionEnd = idx + q.length; textarea.focus(); }
					else { status.textContent = `  [ "${q}" not found ]`; setTimeout(() => status.textContent = "", 3000); }
				}
			}
		});

		setTimeout(() => textarea.focus(), 50);
	}

	nanoKey(container: HTMLElement, key: string, label: string) {
		const el = container.createEl("span", {cls: "nano-shortcut"});
		el.createEl("span", {cls: "nano-key", text: key});
		el.createEl("span", {text: ` ${label}`});
	}

	exitNano() {
		// Rebuild terminal
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("vt");
		this.termEl = container.createDiv({cls: "vt-scroll"});
		this.appendPrompt();
		container.addEventListener("click", () => {
			if (this.currentInputEl) this.currentInputEl.focus();
		});
	}

	async onClose() {}
}
