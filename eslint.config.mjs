import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: ["Old Versions/**", "node_modules/**", "*.config.js"],
	},
	{
		files: ["**/*.{js,mjs,cjs,gs}"],
		plugins: { js },
		extends: ["js/recommended"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				// Google Apps Script globals
				Logger: "readonly",
				SpreadsheetApp: "readonly",
				ScriptApp: "readonly",
				PropertiesService: "readonly",
				Utilities: "readonly",
				HtmlService: "readonly",
				LockService: "readonly",
				ContentService: "readonly",
				// Add more as needed
			},
		},
	},
	{
		files: ["**/*.js"],
		languageOptions: { sourceType: "script" },
	},
	{
		files: ["*.config.js"],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
]);
