import * as fs from "fs/promises";
import * as path from "path";

import { LanguageParser, loadRequiredLanguageParsers } from "./languageParser";
import { fileExistsAtPath } from "../path";
import { listFiles } from "../utils/list-files";

const SUPPORTED_EXTENSIONS = new Set(["js", "jsx", "ts", "tsx", "go"]);

export async function parseSourceCodeForDefinitionsTopLevel(
  dirPath: string
): Promise<string> {
  try {
    const normalizedPath = path.resolve(dirPath);
    if (!(await fileExistsAtPath(normalizedPath))) {
      return "This directory does not exist or you do not have permission to access it.";
    }

    const [allFiles, _] = await listFiles(normalizedPath, false, 200);
    if (!allFiles.length) {
      return "No files found in directory.";
    }

    const filesToParse = allFiles
      .filter((file) =>
        SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase().slice(1))
      )
      .slice(0, 50);

    if (!filesToParse.length) {
      return "No supported source code files found.";
    }

    // Load language parsers once for all required file types
    const { parsers: languageParsers } = await loadRequiredLanguageParsers(
      filesToParse
    );

    // Process files in parallel for better performance
    const parseResults = await Promise.all(
      filesToParse.map(async (filePath) => {
        const definitions = await parseFile(filePath, languageParsers);
        if (definitions) {
          return {
            relativePath: path
              .relative(normalizedPath, filePath)
              .replace(/\\/g, "/"),
            definitions,
          };
        }
        return null;
      })
    );

    // Combine results
    const validResults = parseResults.filter(Boolean);
    if (!validResults.length) {
      return "No source code definitions found.";
    }

    return validResults
      .map((result) => `${result?.relativePath}\n${result?.definitions}`)
      .join("\n");
  } catch (error) {
    console.error("Error during parsing:", error);
    return `Error during parsing: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

async function parseFile(
  filePath: string,
  languageParsers: LanguageParser
): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const parser = languageParsers[ext];

  if (!parser) {
    return null; // Skip unsupported file types silently
  }

  try {
    const fileContent = await fs.readFile(filePath, "utf8");
    const { parser: treeParser, query } = parser;

    // Parse the file content into an AST
    const tree = treeParser.parse(fileContent);
    const lines = fileContent.split("\n");

    // Apply the query to the AST and get the captures
    const captures = query.captures(tree.rootNode);

    if (captures.length === 0) {
      return null;
    }

    // Sort captures by their start position
    captures.sort(
      (a, b) => a.node.startPosition.row - b.node.startPosition.row
    );

    let formattedOutput = "";
    let lastLine = -1;

    for (const { node, name } of captures) {
      const startLine = node.startPosition.row;

      // Only process name definitions
      if (!name.includes("name")) {
        continue;
      }

      // Add separator if there's a gap between captures
      if (lastLine !== -1 && startLine > lastLine + 1) {
        formattedOutput += "|----\n";
      }

      // Add the line containing the definition
      if (lines[startLine]) {
        formattedOutput += `│${lines[startLine]}\n`;
        lastLine = node.endPosition.row;
      }
    }

    return formattedOutput.length > 0
      ? `|----\n${formattedOutput}|----\n`
      : null;
  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error);
    return null; // Skip files with parsing errors
  }
}
