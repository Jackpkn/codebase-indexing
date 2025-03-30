import * as path from "path";
import TreeSitterParser from "tree-sitter";
import { goQuery, javascriptQuery, typescriptQuery } from "./queries";
import Parser from "web-tree-sitter";

export interface LanguageParser {
  [key: string]: {
    parser: Parser;
    query: Parser.Query;
  };
}

async function loadLanguage(langName: string) {
  console.log(`Loading language: ${langName}`);
  try {
    // Resolve relative to the extension's node_modules!
    const wasmPath = require.resolve(
      `tree-sitter-wasms/out/tree-sitter-${langName}.wasm`
    );
    console.log(`Using WASM path: ${wasmPath}`);

    console.log(`Using WASM path: ${wasmPath}`);
    const language = await Parser.Language.load(wasmPath);
    console.log(`Language ${langName} loaded successfully`);
    return language;
  } catch (error) {
    console.error(`Failed to load language ${langName}:`, error);
    throw error;
  }
}

let isParserInitialized = false;

async function initializeParser() {
  console.log("initializing parser");
  if (!isParserInitialized) {
    console.log("Initializing parser module...");
    try {
      // Use require.resolve to get the correct path to tree-sitter.wasm
      const wasmPath = require.resolve("web-tree-sitter/tree-sitter.wasm");
      console.log(`Using WASM path: ${wasmPath}`);
      await Parser.init({ locateFile: () => wasmPath }); // Pass locateFile option
      isParserInitialized = true;
      console.log("Parser module initialized");
    } catch (error) {
      console.error("Error initializing parser:", error);
      throw error; // Re-throw to prevent further execution
    }
  }
}

// // Wrapper for creating a new Parser to avoid TypeScript errors
// function createParser(): Parser {
//   return new Parser();
// }

export async function loadRequiredLanguageParsers(
  filesToParse: string[]
): Promise<LanguageParser> {
  await initializeParser();
  const extensionsToLoad = new Set(
    filesToParse.map((file) => path.extname(file).toLowerCase().slice(1))
  );
  const parsers: LanguageParser = {};
  for (const ext of extensionsToLoad) {
    let language: Parser.Language;
    let query: Parser.Query;
    switch (ext) {
      case "js":
      case "jsx":
        language = await loadLanguage("javascript");
        query = language.query(javascriptQuery);
        break;
      case "ts":
        language = await loadLanguage("typescript");
        query = language.query(typescriptQuery);
        break;
      case "tsx":
        language = await loadLanguage("tsx");
        query = language.query(typescriptQuery);
        break;

      default:
        throw new Error(`Unsupported language: ${ext}`);
    }
    const parser = new Parser();
    parser.setLanguage(language);
    parsers[ext] = { parser, query };
  }
  return parsers;
}
