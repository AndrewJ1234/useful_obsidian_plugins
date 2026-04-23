import {App, ItemView, Menu, Notice, Plugin, TFile, TFolder, TAbstractFile, WorkspaceLeaf} from "obsidian";

import {DEFAULT_SETTINGS, VaultNavigatorSettings, VaultNavigatorSettingTab} from "./settings";

const VIEW_TYPE = "vault-navigator";

export default class VaultNavigatorPlugin extends Plugin {
	settings: VaultNavigatorSettings;
	folderAccessTimes: Record<string, number> = {};

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE, (leaf) => new NavigatorView(leaf, this));

		this.addRibbonIcon("folder-tree", "Vault Navigator", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-navigator",
			name: "Open navigator",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "toggle-favorite",
			name: "Toggle favorite on current file",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (file) this.toggleFavorite(file.path);
			},
		});

		// Track file opens for recents
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file) {
					this.recordFileOpen(file.path);
					if (file.parent) {
						this.folderAccessTimes[file.parent.path] = Date.now();
					}
				}
			})
		);

		this.registerEvent(this.app.vault.on("create", () => this.refreshView()));
		this.registerEvent(this.app.vault.on("delete", (f) => {
			if (f instanceof TFile) {
				this.settings.recentFiles = this.settings.recentFiles.filter(p => p !== f.path);
				this.settings.favoriteFiles = this.settings.favoriteFiles.filter(p => p !== f.path);
				this.saveSettings();
			}
			this.refreshView();
		}));
		this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
			if (f instanceof TFile) {
				// Update recents
				this.settings.recentFiles = this.settings.recentFiles.map(p => p === oldPath ? f.path : p);
				// Update favorites
				this.settings.favoriteFiles = this.settings.favoriteFiles.map(p => p === oldPath ? f.path : p);
				this.saveSettings();
			}
			this.refreshView();
		}));

		this.addSettingTab(new VaultNavigatorSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => this.activateView());
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<VaultNavigatorSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	recordFileOpen(path: string) {
		const recents = this.settings.recentFiles.filter(p => p !== path);
		recents.unshift(path);
		this.settings.recentFiles = recents.slice(0, this.settings.maxRecents);
		this.saveSettings();
		this.refreshView();
	}

	isFavorite(path: string): boolean {
		return this.settings.favoriteFiles.includes(path);
	}

	async toggleFavorite(path: string) {
		if (this.isFavorite(path)) {
			this.settings.favoriteFiles = this.settings.favoriteFiles.filter(p => p !== path);
		} else {
			this.settings.favoriteFiles.push(path);
		}
		await this.saveSettings();
		this.refreshView();
	}

	isPinnedFolder(path: string): boolean {
		return this.settings.pinnedFolders.includes(path);
	}

	async togglePinFolder(path: string) {
		if (this.isPinnedFolder(path)) {
			this.settings.pinnedFolders = this.settings.pinnedFolders.filter(p => p !== path);
		} else {
			this.settings.pinnedFolders.push(path);
		}
		await this.saveSettings();
		this.refreshView();
	}

	async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({type: VIEW_TYPE, active: true});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	refreshView() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			if (leaf.view instanceof NavigatorView) {
				leaf.view.render();
			}
		}
	}

	sortFolders(folders: TFolder[]): TFolder[] {
		const pinned = folders.filter(f => this.isPinnedFolder(f.path));
		const unpinned = folders.filter(f => !this.isPinnedFolder(f.path));

		const sortFn = (a: TFolder, b: TFolder): number => {
			switch (this.settings.sortMode) {
				case "recent": {
					const aTime = this.folderAccessTimes[a.path] || 0;
					const bTime = this.folderAccessTimes[b.path] || 0;
					if (aTime !== bTime) return bTime - aTime;
					return a.name.localeCompare(b.name);
				}
				case "modified": {
					const aT = this.getLatestModified(a);
					const bT = this.getLatestModified(b);
					if (aT !== bT) return bT - aT;
					return a.name.localeCompare(b.name);
				}
				default:
					return a.name.localeCompare(b.name);
			}
		};

		pinned.sort(sortFn);
		unpinned.sort(sortFn);
		return [...pinned, ...unpinned];
	}

	getLatestModified(folder: TFolder): number {
		let latest = 0;
		for (const child of folder.children) {
			if (child instanceof TFile && child.stat.mtime > latest) latest = child.stat.mtime;
		}
		return latest;
	}

	countFiles(folder: TFolder): number {
		let count = 0;
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === "md") count++;
			else if (child instanceof TFolder) count += this.countFiles(child);
		}
		return count;
	}
}

// ─── Navigator View ──────────────────────────────────────────────────────────

class NavigatorView extends ItemView {
	plugin: VaultNavigatorPlugin;
	expandedFolders: Set<string> = new Set();
	filterQuery: string = "";
	previewTooltip: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: VaultNavigatorPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "Navigator"; }
	getIcon(): string { return "folder-tree"; }

	async onOpen() {
		this.render();
	}

	render() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("vault-nav-container");
		if (this.plugin.settings.compactMode) container.addClass("vault-nav-compact");
		else container.removeClass("vault-nav-compact");

		// Search bar
		const searchBar = container.createDiv({cls: "vault-nav-search"});
		const searchInput = searchBar.createEl("input", {
			cls: "vault-nav-search-input",
			attr: {type: "text", placeholder: "Filter...", spellcheck: "false"},
		});
		searchInput.value = this.filterQuery;
		searchInput.addEventListener("input", () => {
			this.filterQuery = searchInput.value;
			this.renderSections(scrollArea);
		});

		const scrollArea = container.createDiv({cls: "vault-nav-scroll"});
		this.renderSections(scrollArea);
	}

	renderSections(container: HTMLElement) {
		container.empty();

		// If filtering, skip sections and show flat results
		if (this.filterQuery.length > 0) {
			this.renderFilteredResults(container);
			return;
		}

		// ── Favorites ──
		const favPaths = this.plugin.settings.favoriteFiles;
		if (favPaths.length > 0) {
			const favSection = container.createDiv({cls: "vault-nav-section"});
			favSection.createDiv({cls: "vault-nav-section-header", text: "⭐ Favorites"});
			const favList = favSection.createDiv({cls: "vault-nav-section-list"});

			for (const path of favPaths) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file && file instanceof TFile) {
					this.renderFileRow(file, favList, true);
				}
			}
		}

		// ── Recents ──
		const recentPaths = this.plugin.settings.recentFiles;
		if (recentPaths.length > 0) {
			const recentSection = container.createDiv({cls: "vault-nav-section"});
			recentSection.createDiv({cls: "vault-nav-section-header", text: "🕐 Recent"});
			const recentList = recentSection.createDiv({cls: "vault-nav-section-list"});

			for (const path of recentPaths) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file && file instanceof TFile) {
					this.renderFileRow(file, recentList, false, true);
				}
			}
		}

		// ── Folder tree ──
		const treeSection = container.createDiv({cls: "vault-nav-section"});
		treeSection.createDiv({cls: "vault-nav-section-header", text: "📂 Folders"});
		const treeContainer = treeSection.createDiv({cls: "vault-nav-tree"});
		this.renderFolder(this.app.vault.getRoot(), treeContainer, 0);
	}

	renderFilteredResults(container: HTMLElement) {
		const q = this.filterQuery.toLowerCase();
		const allFiles = this.app.vault.getFiles()
			.filter(f => f.path.toLowerCase().includes(q))
			.sort((a, b) => a.basename.localeCompare(b.basename))
			.slice(0, 40);

		if (allFiles.length === 0) {
			container.createDiv({cls: "vault-nav-empty", text: "No matching files."});
			return;
		}

		for (const file of allFiles) {
			this.renderFileRow(file, container, false, false, true);
		}
	}

	// ── File row ─────────────────────────────────────────────────────────────

	renderFileRow(file: TFile, container: HTMLElement, isFav: boolean, isRecent: boolean = false, showPath: boolean = false) {
		const row = container.createDiv({cls: "vault-nav-row vault-nav-file"});

		const isFavorite = this.plugin.isFavorite(file.path);

		// Star for favorites
		const starEl = row.createEl("span", {
			cls: `vault-nav-star ${isFavorite ? "vault-nav-star-active" : ""}`,
			text: isFavorite ? "★" : "☆",
		});
		starEl.addEventListener("click", (e) => {
			e.stopPropagation();
			this.plugin.toggleFavorite(file.path);
		});

		// Icon
		row.createEl("span", {cls: "vault-nav-icon", text: this.getFileIcon(file)});

		// Name + path
		const nameContainer = row.createDiv({cls: "vault-nav-name-container"});
		const displayName = file.extension === "md" ? file.basename : file.name;
		nameContainer.createEl("span", {cls: "vault-nav-name", text: displayName});

		if (showPath && file.parent) {
			nameContainer.createEl("span", {cls: "vault-nav-path-hint", text: file.parent.path});
		} else if (isRecent && file.parent) {
			nameContainer.createEl("span", {cls: "vault-nav-path-hint", text: file.parent.path});
		}

		// Highlight active
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && activeFile.path === file.path) {
			row.addClass("vault-nav-active");
		}

		// Click to open
		row.addEventListener("click", async (e) => {
			e.stopPropagation();
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		});

		// Hover preview
		if (this.plugin.settings.showPreview) {
			row.addEventListener("mouseenter", (e) => this.showPreview(file, e));
			row.addEventListener("mouseleave", () => this.hidePreview());
		}

		// Right-click
		row.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const menu = new Menu();

			menu.addItem((item) => {
				item.setTitle(isFavorite ? "Remove from favorites" : "Add to favorites");
				item.setIcon(isFavorite ? "star-off" : "star");
				item.onClick(() => this.plugin.toggleFavorite(file.path));
			});

			menu.addItem((item) => {
				item.setTitle("Open in new tab");
				item.setIcon("file-plus");
				item.onClick(async () => {
					const leaf = this.app.workspace.getLeaf(true);
					await leaf.openFile(file);
				});
			});

			menu.addSeparator();

			menu.addItem((item) => {
				item.setTitle("Delete");
				item.setIcon("trash");
				item.onClick(() => this.app.vault.trash(file, true));
			});

			menu.showAtMouseEvent(e);
		});
	}

	// ── Preview tooltip ──────────────────────────────────────────────────────

	async showPreview(file: TFile, event: MouseEvent) {
		this.hidePreview();

		if (file.extension !== "md") return;

		try {
			const content = await this.app.vault.cachedRead(file);
			// Strip frontmatter
			const cleaned = content.replace(/^---[\s\S]*?---\n?/, "").trim();
			if (!cleaned) return;

			const preview = cleaned.substring(0, this.plugin.settings.previewLength);
			const truncated = cleaned.length > this.plugin.settings.previewLength;

			this.previewTooltip = document.body.createDiv({cls: "vault-nav-preview"});
			this.previewTooltip.createEl("div", {cls: "vault-nav-preview-title", text: file.basename});
			this.previewTooltip.createEl("div", {
				cls: "vault-nav-preview-content",
				text: preview + (truncated ? "..." : ""),
			});

			// Position near the mouse
			const rect = (event.target as HTMLElement).getBoundingClientRect();
			this.previewTooltip.style.top = `${rect.top}px`;
			this.previewTooltip.style.left = `${rect.right + 8}px`;

			// Clamp to viewport
			requestAnimationFrame(() => {
				if (!this.previewTooltip) return;
				const tipRect = this.previewTooltip.getBoundingClientRect();
				if (tipRect.bottom > window.innerHeight - 10) {
					this.previewTooltip.style.top = `${window.innerHeight - tipRect.height - 10}px`;
				}
				if (tipRect.right > window.innerWidth - 10) {
					this.previewTooltip.style.left = `${rect.left - tipRect.width - 8}px`;
				}
			});
		} catch (e) {
			// Silently fail
		}
	}

	hidePreview() {
		if (this.previewTooltip) {
			this.previewTooltip.remove();
			this.previewTooltip = null;
		}
	}

	// ── Folder tree ──────────────────────────────────────────────────────────

	renderFolder(folder: TFolder, container: HTMLElement, depth: number) {
		const isRoot = folder.path === "/";

		let subfolders = folder.children.filter((c): c is TFolder => c instanceof TFolder);
		let files = folder.children.filter((c): c is TFile => c instanceof TFile);

		if (!this.plugin.settings.showHiddenFolders) {
			subfolders = subfolders.filter(f => !f.name.startsWith("."));
		}

		subfolders = this.plugin.sortFolders(subfolders);
		files.sort((a, b) => a.name.localeCompare(b.name));

		if (isRoot) {
			// Pinned folders first
			const pinned = subfolders.filter(f => this.plugin.isPinnedFolder(f.path));
			const unpinned = subfolders.filter(f => !this.plugin.isPinnedFolder(f.path));

			if (pinned.length > 0) {
				container.createDiv({cls: "vault-nav-tree-label", text: "📌 Pinned"});
				for (const sub of pinned) this.renderFolderNode(sub, container, 0);
			}

			for (const sub of unpinned) this.renderFolderNode(sub, container, 0);

			// Root-level files
			for (const file of files) this.renderTreeFileRow(file, container, 0);
		} else {
			for (const sub of subfolders) this.renderFolderNode(sub, container, depth);
			for (const file of files) this.renderTreeFileRow(file, container, depth);
		}
	}

	renderFolderNode(folder: TFolder, container: HTMLElement, depth: number) {
		const isExpanded = this.isFolderExpanded(folder.path, depth);
		const isPinned = this.plugin.isPinnedFolder(folder.path);
		const fileCount = this.plugin.settings.showFileCount ? this.plugin.countFiles(folder) : -1;

		const row = container.createDiv({cls: "vault-nav-row vault-nav-folder"});
		row.style.paddingLeft = `${depth * 14 + 4}px`;
		if (isPinned) row.addClass("vault-nav-pinned");

		row.createEl("span", {cls: "vault-nav-chevron", text: isExpanded ? "▾" : "▸"});
		row.createEl("span", {cls: "vault-nav-icon", text: isExpanded ? "📂" : "📁"});
		row.createEl("span", {cls: "vault-nav-name", text: folder.name});

		if (fileCount >= 0) {
			row.createEl("span", {cls: "vault-nav-count", text: `${fileCount}`});
		}

		row.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleFolder(folder.path, depth);
		});

		row.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const menu = new Menu();

			menu.addItem((item) => {
				item.setTitle(isPinned ? "Unpin folder" : "Pin folder");
				item.setIcon(isPinned ? "pin-off" : "pin");
				item.onClick(() => this.plugin.togglePinFolder(folder.path));
			});

			menu.addItem((item) => {
				item.setTitle("New note here");
				item.setIcon("file-plus");
				item.onClick(async () => {
					const path = `${folder.path}/Untitled ${Date.now()}.md`;
					const f = await this.app.vault.create(path, "");
					await this.app.workspace.getLeaf(false).openFile(f);
				});
			});

			menu.addItem((item) => {
				item.setTitle("New subfolder");
				item.setIcon("folder-plus");
				item.onClick(() => this.app.vault.createFolder(`${folder.path}/New Folder`));
			});

			menu.addSeparator();

			menu.addItem((item) => {
				item.setTitle("Collapse all");
				item.setIcon("chevrons-up");
				item.onClick(() => { this.expandedFolders.clear(); this.render(); });
			});

			menu.showAtMouseEvent(e);
		});

		if (isExpanded) {
			const childContainer = container.createDiv({cls: "vault-nav-children"});
			this.renderFolder(folder, childContainer, depth + 1);
		}
	}

	renderTreeFileRow(file: TFile, container: HTMLElement, depth: number) {
		const row = container.createDiv({cls: "vault-nav-row vault-nav-file"});
		row.style.paddingLeft = `${depth * 14 + 22}px`;

		const isFavorite = this.plugin.isFavorite(file.path);

		const starEl = row.createEl("span", {
			cls: `vault-nav-star ${isFavorite ? "vault-nav-star-active" : ""}`,
			text: isFavorite ? "★" : "☆",
		});
		starEl.addEventListener("click", (e) => {
			e.stopPropagation();
			this.plugin.toggleFavorite(file.path);
		});

		row.createEl("span", {cls: "vault-nav-icon", text: this.getFileIcon(file)});
		row.createEl("span", {cls: "vault-nav-name", text: file.extension === "md" ? file.basename : file.name});

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && activeFile.path === file.path) row.addClass("vault-nav-active");

		row.addEventListener("click", async (e) => {
			e.stopPropagation();
			await this.app.workspace.getLeaf(false).openFile(file);
		});

		if (this.plugin.settings.showPreview) {
			row.addEventListener("mouseenter", (e) => this.showPreview(file, e));
			row.addEventListener("mouseleave", () => this.hidePreview());
		}

		row.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const menu = new Menu();
			menu.addItem((item) => {
				item.setTitle(isFavorite ? "Remove from favorites" : "Add to favorites");
				item.setIcon(isFavorite ? "star-off" : "star");
				item.onClick(() => this.plugin.toggleFavorite(file.path));
			});
			menu.addItem((item) => {
				item.setTitle("Open in new tab");
				item.setIcon("file-plus");
				item.onClick(async () => await this.app.workspace.getLeaf(true).openFile(file));
			});
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle("Delete");
				item.setIcon("trash");
				item.onClick(() => this.app.vault.trash(file, true));
			});
			menu.showAtMouseEvent(e);
		});
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	getFileIcon(file: TFile): string {
		switch (file.extension) {
			case "md": return "📄";
			case "png": case "jpg": case "jpeg": case "gif": case "svg": case "webp": return "🖼";
			case "pdf": return "📕";
			case "canvas": return "🎯";
			default: return "📎";
		}
	}

	isFolderExpanded(path: string, depth: number): boolean {
		if (this.expandedFolders.has(`__collapsed__${path}`)) return false;
		if (this.expandedFolders.has(path)) return true;
		if (this.plugin.settings.autoCollapse) return depth < this.plugin.settings.autoCollapseDepth;
		return false;
	}

	toggleFolder(path: string, depth: number) {
		const wasExpanded = this.isFolderExpanded(path, depth);
		if (wasExpanded) {
			this.expandedFolders.delete(path);
			if (this.plugin.settings.autoCollapse && depth < this.plugin.settings.autoCollapseDepth) {
				this.expandedFolders.add(`__collapsed__${path}`);
			}
		} else {
			this.expandedFolders.add(path);
			this.expandedFolders.delete(`__collapsed__${path}`);
		}
		this.render();
	}
}
