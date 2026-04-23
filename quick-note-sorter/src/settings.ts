import {App, PluginSettingTab, Setting, TextComponent} from "obsidian";
import type QuickNoteSorterPlugin from "./main";

export interface QuickNoteSorterSettings {
	inboxFolder: string;
	defaultCategories: string[];
	autoSuggestCategory: boolean;
	keywordMap: Record<string, string>;
}

export const DEFAULT_SETTINGS: QuickNoteSorterSettings = {
	inboxFolder: "Inbox",
	defaultCategories: [
		"Work",
		"Personal",
		"Ideas",
		"Reference",
		"Projects",
	],
	autoSuggestCategory: true,
	keywordMap: {},
};

export class QuickNoteSorterSettingTab extends PluginSettingTab {
	plugin: QuickNoteSorterPlugin;

	constructor(app: App, plugin: QuickNoteSorterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl("h2", {text: "Quick Note Sorter"});

		new Setting(containerEl)
			.setName("Inbox folder")
			.setDesc("Where quick notes land before being sorted.")
			.addText((text) =>
				text
					.setPlaceholder("Inbox")
					.setValue(this.plugin.settings.inboxFolder)
					.onChange(async (value) => {
						this.plugin.settings.inboxFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default categories")
			.setDesc("Comma-separated list of category folder names.")
			.addTextArea((text) =>
				text
					.setPlaceholder("Work, Personal, Ideas")
					.setValue(this.plugin.settings.defaultCategories.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.defaultCategories = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-suggest category")
			.setDesc("Use keyword matching to suggest a category when sorting.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSuggestCategory)
					.onChange(async (value) => {
						this.plugin.settings.autoSuggestCategory = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", {text: "Keyword → Category Map"});
		containerEl.createEl("p", {
			text: "When a note contains a keyword, suggest the mapped category.",
			cls: "setting-item-description",
		});

		const keywordContainer = containerEl.createDiv({
			cls: "keyword-map-container",
		});

		this.renderKeywordMap(keywordContainer);

		new Setting(containerEl).setName("Add keyword mapping").then(
			(setting) => {
				let keywordInput: TextComponent;
				let folderInput: TextComponent;

				setting.addText((text) => {
					keywordInput = text;
					text.setPlaceholder("keyword");
				});
				setting.addText((text) => {
					folderInput = text;
					text.setPlaceholder("folder path");
				});
				setting.addButton((btn) => {
					btn.setButtonText("Add").onClick(async () => {
						const keyword = keywordInput.getValue().trim();
						const folder = folderInput.getValue().trim();
						if (keyword && folder) {
							this.plugin.settings.keywordMap[keyword] = folder;
							await this.plugin.saveSettings();
							keywordInput.setValue("");
							folderInput.setValue("");
							this.renderKeywordMap(keywordContainer);
						}
					});
				});
			}
		);
	}

	renderKeywordMap(container: HTMLElement) {
		container.empty();
		const map = this.plugin.settings.keywordMap;

		for (const [keyword, folder] of Object.entries(map)) {
			const row = container.createDiv({cls: "keyword-map-row"});
			row.createEl("span", {text: `"${keyword}" → ${folder}`});
			const removeBtn = row.createEl("button", {
				text: "✕",
				cls: "keyword-remove-btn",
			});
			removeBtn.addEventListener("click", async () => {
				delete this.plugin.settings.keywordMap[keyword];
				await this.plugin.saveSettings();
				this.renderKeywordMap(container);
			});
		}

		if (Object.keys(map).length === 0) {
			container.createEl("em", {text: "No keyword mappings yet."});
		}
	}
}
