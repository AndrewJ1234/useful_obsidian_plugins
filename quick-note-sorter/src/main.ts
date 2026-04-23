import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	TFile,
	TFolder,
	TAbstractFile,
	SuggestModal,
	TextComponent,
	TextAreaComponent,
} from "obsidian";

import {DEFAULT_SETTINGS, QuickNoteSorterSettings, QuickNoteSorterSettingTab} from "./settings";

export default class QuickNoteSorterPlugin extends Plugin {
	settings: QuickNoteSorterSettings;

	async onload() {
		await this.loadSettings();

		// Ribbon icon for quick capture
		this.addRibbonIcon("inbox", "Quick Note", () => {
			new QuickNoteModal(this.app, this).open();
		});

		// Command: Quick capture note
		this.addCommand({
			id: "quick-capture-note",
			name: "Capture quick note",
			callback: () => {
				new QuickNoteModal(this.app, this).open();
			},
		});

		// Command: Sort current note into a category
		this.addCommand({
			id: "sort-current-note",
			name: "Sort current note into a category",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const file = view.file;
				if (file) {
					new CategoryPickerModal(this.app, this, file).open();
				}
			},
		});

		// Command: Sort all notes in inbox
		this.addCommand({
			id: "sort-inbox",
			name: "Sort all notes in inbox",
			callback: () => {
				this.sortInbox();
			},
		});

		// Settings tab
		this.addSettingTab(new QuickNoteSorterSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<QuickNoteSorterSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Ensure a folder exists, creating it if needed.
	 */
	async ensureFolderExists(path: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder) {
			await this.app.vault.createFolder(path);
		}
	}

	/**
	 * Get all folders in the vault as category options.
	 */
	getAllFolders(): string[] {
		const folders: string[] = [];
		const recurse = (folder: TFolder) => {
			folders.push(folder.path);
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					recurse(child);
				}
			}
		};
		const root = this.app.vault.getRoot();
		for (const child of root.children) {
			if (child instanceof TFolder) {
				recurse(child);
			}
		}
		return folders;
	}

	/**
	 * Get categories: default categories merged with existing folders.
	 */
	getCategories(): string[] {
		const defaults = this.settings.defaultCategories;
		const existing = this.getAllFolders();
		const merged = [...new Set([...defaults, ...existing])];
		return merged.sort();
	}

	/**
	 * Suggest a category based on keywords in the note content.
	 */
	suggestCategory(content: string): string | null {
		if (!this.settings.autoSuggestCategory) return null;

		const lower = content.toLowerCase();
		for (const [keyword, folder] of Object.entries(this.settings.keywordMap)) {
			if (lower.includes(keyword.toLowerCase())) {
				return folder;
			}
		}
		return null;
	}

	/**
	 * Move a file to a category folder.
	 */
	async moveToCategory(file: TFile, category: string): Promise<void> {
		await this.ensureFolderExists(category);
		const newPath = `${category}/${file.name}`;

		const existing = this.app.vault.getAbstractFileByPath(newPath);
		if (existing) {
			const timestamp = Date.now();
			const uniquePath = `${category}/${file.basename}-${timestamp}.${file.extension}`;
			await this.app.fileManager.renameFile(file, uniquePath);
			new Notice(`Moved to ${category}/ (renamed to avoid conflict)`);
		} else {
			await this.app.fileManager.renameFile(file, newPath);
			new Notice(`Moved to ${category}/`);
		}
	}

	/**
	 * Sort all notes currently sitting in the inbox folder.
	 */
	async sortInbox(): Promise<void> {
		const inboxPath = this.settings.inboxFolder;
		const inbox = this.app.vault.getAbstractFileByPath(inboxPath);

		if (!inbox || !(inbox instanceof TFolder)) {
			new Notice(`Inbox folder "${inboxPath}" not found. Create it first or change it in settings.`);
			return;
		}

		const files = inbox.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md"
		);

		if (files.length === 0) {
			new Notice("Inbox is empty!");
			return;
		}

		new InboxSorterModal(this.app, this, files).open();
	}
}

// ─── Quick Note Capture Modal ────────────────────────────────────────────────

class QuickNoteModal extends Modal {
	plugin: QuickNoteSorterPlugin;
	titleInput: TextComponent;
	contentArea: TextAreaComponent;

	constructor(app: App, plugin: QuickNoteSorterPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass("quick-note-sorter-modal");

		contentEl.createEl("h2", {text: "Quick Note"});

		// Title
		const titleContainer = contentEl.createDiv({cls: "quick-note-field"});
		titleContainer.createEl("label", {text: "Title"});
		this.titleInput = new TextComponent(titleContainer);
		this.titleInput.setPlaceholder("Note title (optional)");
		this.titleInput.inputEl.addClass("quick-note-title-input");

		// Content
		const contentContainer = contentEl.createDiv({cls: "quick-note-field"});
		contentContainer.createEl("label", {text: "Note"});
		this.contentArea = new TextAreaComponent(contentContainer);
		this.contentArea.setPlaceholder("Write your quick note here...");
		this.contentArea.inputEl.addClass("quick-note-content-input");
		this.contentArea.inputEl.rows = 8;

		// Buttons
		const buttonContainer = contentEl.createDiv({cls: "quick-note-buttons"});

		const inboxBtn = buttonContainer.createEl("button", {
			text: "Save to Inbox",
			cls: "mod-muted",
		});
		inboxBtn.addEventListener("click", () => {
			this.saveNote(null);
		});

		const categorizeBtn = buttonContainer.createEl("button", {
			text: "Save & Categorize",
			cls: "mod-cta",
		});
		categorizeBtn.addEventListener("click", () => {
			this.saveAndCategorize();
		});

		// Focus content area
		setTimeout(() => {
			this.contentArea.inputEl.focus();
		}, 50);
	}

	async saveNote(category: string | null): Promise<TFile | null> {
		const content = this.contentArea.getValue().trim();
		if (!content) {
			new Notice("Note is empty!");
			return null;
		}

		let title = this.titleInput.getValue().trim();
		if (!title) {
			const firstLine = content.split("\n")[0].substring(0, 50);
			title = firstLine.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
			if (!title) {
				title = `Quick Note ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
			}
		}

		const folder = category || this.plugin.settings.inboxFolder;
		await this.plugin.ensureFolderExists(folder);

		const now = new Date().toISOString();
		const noteContent = [
			"---",
			`created: ${now}`,
			`source: quick-note`,
			category ? `category: ${category}` : `category: unsorted`,
			"---",
			"",
			content,
		].join("\n");

		let filePath = `${folder}/${title}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			filePath = `${folder}/${title}-${Date.now()}.md`;
		}

		const file = await this.app.vault.create(filePath, noteContent);
		new Notice(`Saved: ${file.path}`);
		this.close();
		return file;
	}

	async saveAndCategorize(): Promise<void> {
		const content = this.contentArea.getValue().trim();
		if (!content) {
			new Notice("Note is empty!");
			return;
		}

		const suggestion = this.plugin.suggestCategory(content);
		const file = await this.saveNote(null);
		if (file) {
			new CategoryPickerModal(this.app, this.plugin, file, suggestion).open();
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

// ─── Category Picker Modal ──────────────────────────────────────────────────

class CategoryPickerModal extends SuggestModal<string> {
	plugin: QuickNoteSorterPlugin;
	file: TFile;
	suggestion: string | null;

	constructor(app: App, plugin: QuickNoteSorterPlugin, file: TFile, suggestion: string | null = null) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.suggestion = suggestion;
		this.setPlaceholder(
			suggestion
				? `Suggested: ${suggestion} — or type to search/create...`
				: "Type a folder name to search or create new..."
		);
	}

	getSuggestions(query: string): string[] {
		const categories = this.plugin.getCategories();

		// Put suggestion at top if it exists
		let items: string[];
		if (this.suggestion) {
			const filtered = categories.filter((c) => c !== this.suggestion);
			items = [this.suggestion, ...filtered];
		} else {
			items = categories;
		}

		// Filter by query
		const lower = query.toLowerCase();
		let filtered = items;
		if (query.length > 0) {
			filtered = items.filter((item) => item.toLowerCase().includes(lower));
		}

		// If the typed query doesn't exactly match any existing category,
		// offer to create it as a new folder
		if (query.length > 0) {
			const exactMatch = items.some((item) => item.toLowerCase() === lower);
			if (!exactMatch) {
				filtered.unshift(`📁 Create: ${query}`);
			}
		}

		return filtered;
	}

	renderSuggestion(item: string, el: HTMLElement) {
		if (item === this.suggestion) {
			el.setText(`⭐ ${item} (suggested)`);
		} else {
			el.setText(item);
		}
	}

	async onChooseSuggestion(item: string): Promise<void> {
		// If they picked the "Create: ..." option, extract the folder name
		let category = item;
		if (item.startsWith("📁 Create: ")) {
			category = item.replace("📁 Create: ", "");
		}
		await this.plugin.moveToCategory(this.file, category);
	}
}

// ─── Inbox Sorter Modal (batch mode) ─────────────────────────────────────────

class InboxSorterModal extends Modal {
	plugin: QuickNoteSorterPlugin;
	files: TFile[];
	currentIndex: number;

	constructor(app: App, plugin: QuickNoteSorterPlugin, files: TFile[]) {
		super(app);
		this.plugin = plugin;
		this.files = files;
		this.currentIndex = 0;
	}

	onOpen() {
		this.showCurrentFile();
	}

	async showCurrentFile() {
		const {contentEl} = this;
		contentEl.empty();

		if (this.currentIndex >= this.files.length) {
			contentEl.createEl("h2", {text: "All done!"});
			contentEl.createEl("p", {text: `Sorted ${this.files.length} note(s).`});
			const closeBtn = contentEl.createEl("button", {text: "Close", cls: "mod-cta"});
			closeBtn.addEventListener("click", () => this.close());
			return;
		}

		const file = this.files[this.currentIndex];
		const content = await this.app.vault.cachedRead(file);
		const suggestion = this.plugin.suggestCategory(content);

		// Header
		contentEl.createEl("h2", {
			text: `Sort Note (${this.currentIndex + 1}/${this.files.length})`,
		});

		// File info
		const infoEl = contentEl.createDiv({cls: "inbox-sort-info"});
		infoEl.createEl("h3", {text: file.basename});

		// Preview
		const previewEl = contentEl.createDiv({cls: "inbox-sort-preview"});
		const previewText = content.replace(/^---[\s\S]*?---\n?/, "").substring(0, 500);
		previewEl.setText(previewText + (content.length > 500 ? "..." : ""));

		// Suggestion badge
		if (suggestion) {
			const suggestEl = contentEl.createDiv({cls: "inbox-sort-suggestion"});
			suggestEl.createEl("span", {text: `Suggested: ${suggestion}`, cls: "suggestion-badge"});
			const acceptBtn = suggestEl.createEl("button", {text: "Accept", cls: "mod-cta"});
			acceptBtn.addEventListener("click", async () => {
				await this.plugin.moveToCategory(file, suggestion);
				this.currentIndex++;
				this.showCurrentFile();
			});
		}

		// Category buttons
		const categoriesEl = contentEl.createDiv({cls: "inbox-sort-categories"});
		categoriesEl.createEl("label", {text: "Choose category:"});

		const grid = categoriesEl.createDiv({cls: "category-grid"});
		for (const cat of this.plugin.getCategories()) {
			const btn = grid.createEl("button", {text: cat, cls: "category-btn"});
			btn.addEventListener("click", async () => {
				await this.plugin.moveToCategory(file, cat);
				this.currentIndex++;
				this.showCurrentFile();
			});
		}

		// Skip
		const skipContainer = contentEl.createDiv({cls: "inbox-sort-skip"});
		const skipBtn = skipContainer.createEl("button", {text: "Skip", cls: "mod-muted"});
		skipBtn.addEventListener("click", () => {
			this.currentIndex++;
			this.showCurrentFile();
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
