import * as path from "path";
import TreeSitterParser from "tree-sitter";
import { goQuery, javascriptQuery, typescriptQuery } from "./queries";

// Simple interfaces for our wrapper
interface Parser {
  parse(fileContent: string): unknown;
  setLanguage(language: any): void;
}

interface Language {
  query(source: string): any;
}

interface Query {
  matches(node: any): any[];
  captures(node: any): any[];
}

export interface LanguageParser {
  parsers: Map<string, { parser: Parser; query: Query }>;
}

// Wrapper for Parser.Language.load to avoid TypeScript errors
async function loadLanguage(langName: string): Promise<Language> {
  console.log(`Loading language: ${langName}`);
  const ParserClass = TreeSitterParser as any;
  const language = await ParserClass.Language.load(
    path.join(__dirname, `tree-sitter-${langName}.wasm`)
  );
  console.log(`Language ${langName} loaded successfully`);
  return language;
}

let isParserInitialized = false;

// Wrapper for Parser.init to avoid TypeScript errors
async function initializeParser() {
  if (!isParserInitialized) {
    console.log("Initializing parser module...");
    const ParserClass = TreeSitterParser as any;
    await ParserClass.init();
    isParserInitialized = true;
    console.log("Parser module initialized");
  }
}

// Wrapper for creating a new Parser to avoid TypeScript errors
function createParser(): Parser {
  return new TreeSitterParser();
}

export async function loadRequiredLanguageParsers(
  filesToParse: string[]
): Promise<LanguageParser> {
  console.log("Initializing parser module...");
  await initializeParser();
  console.log("Parser module initialized");

  const parsers = new Map<string, { parser: Parser; query: Query }>();
  const extensions = new Set(
    filesToParse.map((file) => path.extname(file).toLowerCase().slice(1))
  );
  console.log("Found file extensions:", Array.from(extensions));

  for (const ext of extensions) {
    console.log(`Loading parser for extension: ${ext}`);
    try {
      let langName: string;
      let query: string;

      switch (ext) {
        case "js":
        case "jsx":
          langName = "javascript";
          query = javascriptQuery;
          break;
        case "ts":
        case "tsx":
          langName = "typescript";
          query = typescriptQuery;
          break;
        case "go":
          langName = "go";
          query = goQuery;
          break;
        default:
          console.warn(`Unsupported file extension: ${ext}`);
          continue;
      }

      const language = await loadLanguage(langName);
      const parser = createParser();
      parser.setLanguage(language);
      console.log(`Parser created for ${langName}`);

      const queryObj = language.query(query);
      console.log(`Query created for ${langName}`);

      parsers.set(ext, { parser, query: queryObj });
      console.log(`Parser and query set up for ${ext}`);
    } catch (error) {
      console.error(`Failed to load parser for ${ext}:`, error);
      throw error;
    }
  }

  console.log("All parsers loaded successfully");
  return { parsers };
}
