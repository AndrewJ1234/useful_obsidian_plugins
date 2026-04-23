import {App, PluginSettingTab, Setting} from "obsidian";
import type VaultNavigatorPlugin from "./main";

export interface VaultNavigatorSettings {
	favoriteFiles: string[];
	pinnedFolders: string[];
	recentFiles: string[];
	maxRecents: number;
	sortMode: "recent" | "alphabetical" | "modified";
	autoCollapse: boolean;
	autoCollapseDepth: number;
	showFileCount: boolean;
	showHiddenFolders: boolean;
	compactMode: boolean;
	showPreview: boolean;
	previewLength: number;
}

export const DEFAULT_SETTINGS: VaultNavigatorSettings = {
	favoriteFiles: [],
	pinnedFolders: [],
	recentFiles: [],
	maxRecents: 8,
	sortMode: "recent",
	autoCollapse: true,
	autoCollapseDepth: 1,
	showFileCount: true,
	showHiddenFolders: false,
	compactMode: true,
	showPreview: true,
	previewLength: 150,
};

export class VaultNavigatorSettingTab extends PluginSettingTab {
	plugin: VaultNavigatorPlugin;

	constructor(app: App, plugin: VaultNavigatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl("h2", {text: "Vault Navigator"});

		new Setting(containerEl)
			.setName("Max recent files")
			.setDesc("How many recently opened files to show in the Recents section.")
			.addSlider((slider) =>
				slider
					.setLimits(3, 20, 1)
					.setValue(this.plugin.settings.maxRecents)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxRecents = value;
						await this.plugin.saveSettings();
						this.plugin.refreshView();
					})
			);

		new Setting(containerEl)
			.setName("Show preview on hover")
			.setDesc("Show a preview of file contents when hovering over a file.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showPreview)
					.onChange(async (value) => {
						this.plugin.settings.showPreview = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Preview length")
			.setDesc("Number of characters to show in hover preview.")
			.addSlider((slider) =>
				slider
					.setLimits(50, 400, 25)
					.setValue(this.plugin.settings.previewLength)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.previewLength = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sort mode")
			.setDesc("How to sort folders in the tree.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("recent", "Most recently used")
					.addOption("alphabetical", "Alphabetical")
					.addOption("modified", "Last modified")
					.setValue(this.plugin.settings.sortMode)
					.onChange(async (value) => {
						this.plugin.settings.sortMode = value as "recent" | "alphabetical" | "modified";
						await this.plugin.saveSettings();
						this.plugin.refreshView();
					})
			);

		new Setting(containerEl)
			.setName("Auto-collapse depth")
			.setDesc("Folders deeper than this are collapsed by default.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 5, 1)
					.setValue(this.plugin.settings.autoCollapseDepth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.autoCollapseDepth = value;
						await this.plugin.saveSettings();
						this.plugin.refreshView();
					})
			);

		new Setting(containerEl)
			.setName("Show file count")
			.setDesc("Show the number of notes next to each folder.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showFileCount)
					.onChange(async (value) => {
						this.plugin.settings.showFileCount = value;
						await this.plugin.saveSettings();
						this.plugin.refreshView();
					})
			);

		new Setting(containerEl)
			.setName("Compact mode")
			.setDesc("Reduce padding and font size for a denser tree.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.compactMode)
					.onChange(async (value) => {
						this.plugin.settings.compactMode = value;
						await this.plugin.saveSettings();
						this.plugin.refreshView();
					})
			);
	}
}
