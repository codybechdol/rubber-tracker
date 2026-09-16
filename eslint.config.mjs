import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: ["Old Versions/**", "node_modules/**", "*.config.js", "scratch/**"],
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
				// Desktop Application Vendor & Cross-Script globals
				XLSX: "readonly",
				EmployeeNameResolver: "readonly",
				EmployeeProfileEngine: "readonly",
				DrugTestingEngine: "readonly",
				CertsImportEngine: "readonly",
				CertsConfigEngine: "readonly",
				CprRosterEngine: "readonly",
				SafetyEmailsEngine: "readonly",
				ProcurementEngine: "readonly",
				InventoryAgingEngine: "readonly",
				CameraScannerEngine: "readonly",
				GpsEngine: "readonly",
				TimeBreakdownEngine: "readonly",
			},
		},
	},
	{
		files: ["**/*.js"],
		languageOptions: { sourceType: "script" },
		rules: {
			"no-redeclare": ["error", { builtinGlobals: false }],
		},
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
