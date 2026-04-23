import {App, PluginSettingTab, Setting} from "obsidian";
import type FolderTocPlugin from "./main";

export interface FolderTocSettings {
	tocFileName: string;
	autoUpdate: boolean;
	autoCreateOnFolderCreate: boolean;
	includeSubfolders: boolean;
	excludedFolders: string[];
	sortOrder: "alphabetical" | "modified" | "created";
	groupBySubfolder: boolean;
	linkStyle: "wiki" | "markdown";
}

export const DEFAULT_SETTINGS: FolderTocSettings = {
	tocFileName: "_Index",
	autoUpdate: true,
	autoCreateOnFolderCreate: true,
	includeSubfolders: true,
	excludedFolders: [".obsidian", ".trash"],
	sortOrder: "alphabetical",
	groupBySubfolder: true,
	linkStyle: "wiki",
};

export class FolderTocSettingTab extends PluginSettingTab {
	plugin: FolderTocPlugin;

	constructor(app: App, plugin: FolderTocPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl("h2", {text: "Folder Table of Contents"});

		new Setting(containerEl)
			.setName("TOC file name")
			.setDesc("Name for the TOC file created in each folder (without .md extension).")
			.addText((text) =>
				text
					.setPlaceholder("_Index")
					.setValue(this.plugin.settings.tocFileName)
					.onChange(async (value) => {
						this.plugin.settings.tocFileName = value.trim() || "_Index";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-update TOC")
			.setDesc("Automatically update the TOC when files are created, deleted, or moved.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUpdate)
					.onChange(async (value) => {
						this.plugin.settings.autoUpdate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-create TOC on folder create")
			.setDesc("Automatically create a TOC file whenever a new folder is created.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoCreateOnFolderCreate)
					.onChange(async (value) => {
						this.plugin.settings.autoCreateOnFolderCreate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include subfolders")
			.setDesc("Include files from subfolders in the TOC.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeSubfolders)
					.onChange(async (value) => {
						this.plugin.settings.includeSubfolders = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Group by subfolder")
			.setDesc("Organize TOC entries under subfolder headings instead of a flat list.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.groupBySubfolder)
					.onChange(async (value) => {
						this.plugin.settings.groupBySubfolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sort order")
			.setDesc("How to sort files in the TOC.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("alphabetical", "Alphabetical")
					.addOption("modified", "Last modified")
					.addOption("created", "Date created")
					.setValue(this.plugin.settings.sortOrder)
					.onChange(async (value) => {
						this.plugin.settings.sortOrder = value as "alphabetical" | "modified" | "created";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Link style")
			.setDesc("Use wiki-style [[links]] or markdown [links](url).")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("wiki", "Wiki [[links]]")
					.addOption("markdown", "Markdown [links](url)")
					.setValue(this.plugin.settings.linkStyle)
					.onChange(async (value) => {
						this.plugin.settings.linkStyle = value as "wiki" | "markdown";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("Comma-separated list of folders to exclude (e.g. .obsidian, .trash, templates).")
			.addTextArea((text) =>
				text
					.setPlaceholder(".obsidian, .trash")
					.setValue(this.plugin.settings.excludedFolders.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);
	}
}
