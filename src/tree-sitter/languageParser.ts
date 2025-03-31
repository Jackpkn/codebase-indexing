import * as path from "path";
import { goQuery, javascriptQuery, typescriptQuery } from "./queries";
import Parser from "web-tree-sitter";

// Map file extensions to their language parser configurations
const LANGUAGE_CONFIG = {
  js: { wasmName: "javascript", queryFn: () => javascriptQuery },
  jsx: { wasmName: "javascript", queryFn: () => javascriptQuery },
  ts: { wasmName: "typescript", queryFn: () => typescriptQuery },
  tsx: { wasmName: "typescript", queryFn: () => typescriptQuery },
  go: { wasmName: "go", queryFn: () => goQuery },
};

// Interface for parser lookup by file extension
export interface LanguageParser {
  [key: string]: {
    parser: Parser;
    query: Parser.Query;
  };
}

// Performance metrics interface
export interface PerformanceMetrics {
  totalTimeMs: number;
  languageLoadTimes: Record<string, number>;
  fileProcessingTime?: number;
}

// Cache loaded languages to avoid reloading the same language
const loadedLanguages: Record<string, Parser.Language> = {};

/**
 * Load a Tree-sitter language by name
 */
async function loadLanguage(langName: string): Promise<Parser.Language> {
  console.log(`Loading language: ${langName}`);

  // Return cached language if already loaded
  if (loadedLanguages[langName]) {
    console.log(`Using cached language: ${langName}`);
    return loadedLanguages[langName];
  }

  try {
    const startTime = performance.now();

    // Resolve relative to the extension's node_modules
    const wasmPath = require.resolve(
      `tree-sitter-wasms/out/tree-sitter-${langName}.wasm`
    );
    console.log(`Using WASM path: ${wasmPath}`);

    const language = await Parser.Language.load(wasmPath);

    const endTime = performance.now();
    const loadTimeMs = endTime - startTime;
    console.log(
      `Language ${langName} loaded successfully in ${loadTimeMs.toFixed(2)}ms`
    );

    // Cache the loaded language
    loadedLanguages[langName] = language;
    return language;
  } catch (error) {
    console.error(`Failed to load language ${langName}:`, error);
    throw error;
  }
}

// Track parser initialization status
let isParserInitialized = false;

/**
 * Initialize the Tree-sitter parser module (only once)
 */
async function initializeParser(): Promise<number> {
  if (isParserInitialized) {
    return 0; // Already initialized
  }

  console.log("Initializing parser module...");
  const startTime = performance.now();

  try {
    // Get path to tree-sitter.wasm
    const wasmPath = require.resolve("web-tree-sitter/tree-sitter.wasm");
    console.log(`Using WASM path: ${wasmPath}`);

    // Initialize the parser module
    await Parser.init({ locateFile: () => wasmPath });
    isParserInitialized = true;

    const endTime = performance.now();
    const initTimeMs = endTime - startTime;
    console.log(`Parser module initialized in ${initTimeMs.toFixed(2)}ms`);

    return initTimeMs;
  } catch (error) {
    console.error("Error initializing parser:", error);
    throw error; // Re-throw to prevent further execution
  }
}

/**
 * Load required language parsers for the provided files
 */
export async function loadRequiredLanguageParsers(
  filesToParse: string[]
): Promise<{ parsers: LanguageParser; metrics: PerformanceMetrics }> {
  const totalStartTime = performance.now();
  const metrics: PerformanceMetrics = {
    totalTimeMs: 0,
    languageLoadTimes: {},
  };

  // Initialize parser and track time
  const initTimeMs = await initializeParser();

  // Get unique file extensions from the list of files
  const extensionsToLoad = new Set(
    filesToParse.map((file) => path.extname(file).toLowerCase().slice(1))
  );

  console.log(
    `Found ${extensionsToLoad.size} unique file extensions to process`
  );

  const parsers: LanguageParser = {};
  const loadPromises: Promise<void>[] = [];

  // Process each extension
  for (const ext of extensionsToLoad) {
    // Skip if we already processed this extension
    if (parsers[ext]) continue;

    // Check if we support this language
    const config = LANGUAGE_CONFIG[ext as keyof typeof LANGUAGE_CONFIG];
    if (!config) {
      console.warn(`Unsupported language extension: ${ext}`);
      continue;
    }

    // Create a promise to load this language
    const loadPromise = (async () => {
      try {
        const langStartTime = performance.now();

        const language = await loadLanguage(config.wasmName);
        const query = language.query(config.queryFn());

        const parser = new Parser();
        parser.setLanguage(language);

        parsers[ext] = { parser, query };

        const langEndTime = performance.now();
        const langLoadTime = langEndTime - langStartTime;
        metrics.languageLoadTimes[ext] = langLoadTime;

        console.log(`Parser for ${ext} loaded in ${langLoadTime.toFixed(2)}ms`);
      } catch (error) {
        console.error(`Error loading parser for ${ext}:`, error);
        // Don't throw here - continue with other parsers
      }
    })();

    loadPromises.push(loadPromise);
  }

  // Wait for all parsers to load
  await Promise.all(loadPromises);

  const totalEndTime = performance.now();
  metrics.totalTimeMs = totalEndTime - totalStartTime;

  console.log(
    `Parser loading completed in ${metrics.totalTimeMs.toFixed(2)}ms`
  );
  console.log(`Loaded ${Object.keys(parsers).length} language parsers`);

  // Check if we loaded any parsers
  if (Object.keys(parsers).length === 0) {
    throw new Error("No language parsers could be loaded");
  }

  return { parsers, metrics };
}

/**
 * Parse source code and collect performance metrics
 */
export async function parseSourceWithMetrics(
  filesToParse: string[]
): Promise<{ result: string; metrics: PerformanceMetrics }> {
  const startTime = performance.now();

  // Load parsers with performance metrics
  const { parsers, metrics } = await loadRequiredLanguageParsers(filesToParse);

  // Process files here...
  // const result = await processFiles(filesToParse, parsers);

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  metrics.fileProcessingTime = totalTime - metrics.totalTimeMs;
  metrics.totalTimeMs = totalTime;

  // Output performance summary
  console.log("=== Performance Summary ===");
  console.log(`Total indexing time: ${metrics.totalTimeMs.toFixed(2)}ms`);
  console.log(
    `Language loading time: ${Object.values(metrics.languageLoadTimes)
      .reduce((a, b) => a + b, 0)
      .toFixed(2)}ms`
  );
  console.log(
    `File processing time: ${metrics.fileProcessingTime.toFixed(2)}ms`
  );
  console.log("=========================");

  // Return result and metrics
  return {
    result: "Processing complete", // Replace with actual result
    metrics,
  };
}
