import {App, Notice, Plugin, TFile, TFolder, TAbstractFile} from "obsidian";

import {DEFAULT_SETTINGS, FolderTocSettings, FolderTocSettingTab} from "./settings";

export default class FolderTocPlugin extends Plugin {
	settings: FolderTocSettings;
	private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	async onload() {
		await this.loadSettings();

		// Register event listeners inside onLayoutReady to skip vault-load create events
		this.app.workspace.onLayoutReady(() => {
			// When a new file or folder is created
			this.registerEvent(
				this.app.vault.on("create", (file: TAbstractFile) => {
					if (file instanceof TFolder) {
						if (this.settings.autoCreateOnFolderCreate) {
							this.createTocForFolder(file);
						}
					} else if (file instanceof TFile && file.extension === "md") {
						if (this.settings.autoUpdate) {
							this.debouncedUpdateToc(this.getFolderPath(file));
						}
					}
				})
			);

			// When a file is deleted
			this.registerEvent(
				this.app.vault.on("delete", (file: TAbstractFile) => {
					if (file instanceof TFile && this.settings.autoUpdate && file.extension === "md") {
						const folderPath = this.getParentFolderPath(file.path);
						if (folderPath !== null) {
							this.debouncedUpdateToc(folderPath);
						}
					}
				})
			);

			// When a file is renamed or moved
			this.registerEvent(
				this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
					if (file instanceof TFile && this.settings.autoUpdate && file.extension === "md") {
						// Update TOC in old location
						const oldFolder = this.getParentFolderPath(oldPath);
						if (oldFolder !== null) {
							this.debouncedUpdateToc(oldFolder);
						}
						// Update TOC in new location
						this.debouncedUpdateToc(this.getFolderPath(file));
					}
				})
			);
		});

		// Commands
		this.addCommand({
			id: "create-toc-current-folder",
			name: "Create TOC for current folder",
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					const folder = activeFile.parent;
					if (folder) {
						this.createTocForFolder(folder);
					}
				} else {
					new Notice("No active file. Open a file in the folder you want a TOC for.");
				}
			},
		});

		this.addCommand({
			id: "update-toc-current-folder",
			name: "Update TOC for current folder",
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					this.updateToc(this.getFolderPath(activeFile));
				} else {
					new Notice("No active file.");
				}
			},
		});

		this.addCommand({
			id: "create-all-tocs",
			name: "Create TOCs for all folders",
			callback: () => {
				this.createAllTocs();
			},
		});

		this.addCommand({
			id: "update-all-tocs",
			name: "Update all TOCs",
			callback: () => {
				this.updateAllTocs();
			},
		});

		// Settings tab
		this.addSettingTab(new FolderTocSettingTab(this.app, this));
	}

	onunload() {
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<FolderTocSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	getFolderPath(file: TFile): string {
		const parts = file.path.split("/");
		parts.pop();
		return parts.join("/") || "/";
	}

	getParentFolderPath(path: string): string | null {
		const parts = path.split("/");
		parts.pop();
		if (parts.length === 0) return "/";
		return parts.join("/");
	}

	getTocPath(folderPath: string): string {
		const name = this.settings.tocFileName;
		if (folderPath === "/" || folderPath === "") {
			return `${name}.md`;
		}
		return `${folderPath}/${name}.md`;
	}

	isExcluded(folderPath: string): boolean {
		return this.settings.excludedFolders.some(
			(excluded) => folderPath === excluded || folderPath.startsWith(excluded + "/")
		);
	}

	debouncedUpdateToc(folderPath: string) {
		const existing = this.debounceTimers.get(folderPath);
		if (existing) {
			clearTimeout(existing);
		}
		const timer = setTimeout(() => {
			this.debounceTimers.delete(folderPath);
			this.updateToc(folderPath);
		}, 500);
		this.debounceTimers.set(folderPath, timer);
	}

	buildLink(file: TFile, relativeTo: string): string {
		if (this.settings.linkStyle === "wiki") {
			return `[[${file.basename}]]`;
		} else {
			let targetPath = file.path;
			if (relativeTo && relativeTo !== "/") {
				targetPath = file.path.startsWith(relativeTo + "/")
					? file.path.slice(relativeTo.length + 1)
					: file.path;
			}
			const encoded = encodeURIComponent(targetPath).replace(/%2F/g, "/");
			return `[${file.basename}](${encoded})`;
		}
	}

	sortFiles(files: TFile[]): TFile[] {
		const sorted = [...files];
		switch (this.settings.sortOrder) {
			case "modified":
				sorted.sort((a, b) => b.stat.mtime - a.stat.mtime);
				break;
			case "created":
				sorted.sort((a, b) => b.stat.ctime - a.stat.ctime);
				break;
			case "alphabetical":
			default:
				sorted.sort((a, b) => a.basename.localeCompare(b.basename));
				break;
		}
		return sorted;
	}

	// ── TOC Generation ───────────────────────────────────────────────────────

	generateTocContent(folderPath: string): string {
		const folder =
			folderPath === "/" || folderPath === ""
				? this.app.vault.getRoot()
				: (this.app.vault.getAbstractFileByPath(folderPath) as TFolder);

		if (!folder || !(folder instanceof TFolder)) {
			return "";
		}

		const tocFileName = this.settings.tocFileName;
		const lines: string[] = [];

		const folderName = (folderPath === "/" || folderPath === "") ? "Vault" : folder.name;
		lines.push(`# ${folderName}`);
		lines.push("");
		lines.push(`> *Auto-generated table of contents. Last updated: ${new Date().toLocaleString()}*`);
		lines.push("");

		if (this.settings.groupBySubfolder && this.settings.includeSubfolders) {
			this.generateGroupedContent(folder, folderPath, tocFileName, lines);
		} else {
			this.generateFlatContent(folder, folderPath, tocFileName, lines);
		}

		// Backlink to parent TOC
		if (folderPath !== "/" && folderPath !== "") {
			const parentPath = this.getParentFolderPath(folderPath);
			if (parentPath !== null) {
				const parentTocPath = this.getTocPath(parentPath);
				const parentTocFile = this.app.vault.getAbstractFileByPath(parentTocPath);
				if (parentTocFile && parentTocFile instanceof TFile) {
					lines.push("");
					lines.push("---");
					lines.push(`← Back to ${this.buildLink(parentTocFile, folderPath)}`);
				}
			}
		}

		return lines.join("\n");
	}

	private generateGroupedContent(folder: TFolder, folderPath: string, tocFileName: string, lines: string[]) {
		// Direct files in this folder
		const directFiles = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md" && f.basename !== tocFileName
		);
		const sortedDirect = this.sortFiles(directFiles);

		if (sortedDirect.length > 0) {
			lines.push("## Notes");
			lines.push("");
			for (const file of sortedDirect) {
				lines.push(`- ${this.buildLink(file, folderPath)}`);
			}
			lines.push("");
		}

		// Subfolders as sections
		const subfolders = folder.children
			.filter((f): f is TFolder => f instanceof TFolder && !this.isExcluded(f.path))
			.sort((a, b) => a.name.localeCompare(b.name));

		for (const subfolder of subfolders) {
			const subTocPath = this.getTocPath(subfolder.path);
			const subTocFile = this.app.vault.getAbstractFileByPath(subTocPath);

			if (subTocFile && subTocFile instanceof TFile) {
				lines.push(`## ${this.buildLink(subTocFile, folderPath)}`);
			} else {
				lines.push(`## ${subfolder.name}`);
			}
			lines.push("");

			const subFiles = this.getFilesInFolder(subfolder, tocFileName);
			const sortedSub = this.sortFiles(subFiles);

			if (sortedSub.length > 0) {
				for (const file of sortedSub.slice(0, 10)) {
					lines.push(`- ${this.buildLink(file, folderPath)}`);
				}
				if (sortedSub.length > 10) {
					lines.push(`- *...and ${sortedSub.length - 10} more*`);
				}
			} else {
				lines.push("- *(empty)*");
			}
			lines.push("");
		}
	}

	private generateFlatContent(folder: TFolder, folderPath: string, tocFileName: string, lines: string[]) {
		const files = this.settings.includeSubfolders
			? this.getFilesInFolder(folder, tocFileName)
			: folder.children.filter(
				(f): f is TFile => f instanceof TFile && f.extension === "md" && f.basename !== tocFileName
			);

		const sorted = this.sortFiles(files);

		if (sorted.length > 0) {
			for (const file of sorted) {
				lines.push(`- ${this.buildLink(file, folderPath)}`);
			}
		} else {
			lines.push("*(No notes yet)*");
		}
	}

	getFilesInFolder(folder: TFolder, excludeName: string): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === "md" && child.basename !== excludeName) {
				files.push(child);
			} else if (child instanceof TFolder && !this.isExcluded(child.path)) {
				files.push(...this.getFilesInFolder(child, excludeName));
			}
		}
		return files;
	}

	// ── TOC CRUD ─────────────────────────────────────────────────────────────

	async createTocForFolder(folder: TFolder): Promise<void> {
		if (this.isExcluded(folder.path)) return;

		const tocPath = this.getTocPath(folder.path);
		const existing = this.app.vault.getAbstractFileByPath(tocPath);

		if (existing) {
			await this.updateToc(folder.path);
			return;
		}

		const content = this.generateTocContent(folder.path);
		await this.app.vault.create(tocPath, content);
		new Notice(`Created TOC: ${tocPath}`);

		// Update parent TOC so it links to this new folder
		const parentPath = this.getParentFolderPath(folder.path);
		if (parentPath !== null) {
			this.debouncedUpdateToc(parentPath);
		}
	}

	async updateToc(folderPath: string): Promise<void> {
		if (this.isExcluded(folderPath)) return;

		const tocPath = this.getTocPath(folderPath);
		const tocFile = this.app.vault.getAbstractFileByPath(tocPath);

		if (!tocFile || !(tocFile instanceof TFile)) {
			return;
		}

		const content = this.generateTocContent(folderPath);
		await this.app.vault.modify(tocFile, content);
	}

	async createAllTocs(): Promise<void> {
		let count = 0;
		const recurse = async (folder: TFolder) => {
			if (this.isExcluded(folder.path)) return;

			const tocPath = this.getTocPath(folder.path);
			if (!this.app.vault.getAbstractFileByPath(tocPath)) {
				const content = this.generateTocContent(folder.path);
				await this.app.vault.create(tocPath, content);
				count++;
			}

			for (const child of folder.children) {
				if (child instanceof TFolder) {
					await recurse(child);
				}
			}
		};

		await recurse(this.app.vault.getRoot());
		new Notice(`Created ${count} new TOC file(s).`);
	}

	async updateAllTocs(): Promise<void> {
		const tocName = this.settings.tocFileName;
		const allFiles = this.app.vault.getMarkdownFiles();
		let count = 0;

		for (const file of allFiles) {
			if (file.basename === tocName) {
				await this.updateToc(this.getFolderPath(file));
				count++;
			}
		}

		new Notice(`Updated ${count} TOC file(s).`);
	}
}
