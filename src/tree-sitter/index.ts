import * as fs from "fs/promises";
import * as path from "path";

import { LanguageParser, loadRequiredLanguageParsers } from "./languageParser";
import { fileExistsAtPath } from "../path";
import { listFiles } from "../utils/list-files";

export async function parseSourceCodeForDefinitionsTopLevel(
  dirPath: string
): Promise<string> {
  const dirExists = await fileExistsAtPath(path.resolve(dirPath));
  if (!dirExists) {
    return "This directory does not exist or you do not have permission to access it.";
  }

  const [allFiles, _] = await listFiles(dirPath, false, 200);

  let result = "";

  const { filesToParse, remainingFiles } = separateFiles(allFiles);

  try {
    const languageParsers = await loadRequiredLanguageParsers(filesToParse);

    for (const filePath of filesToParse) {
      const definitions = await parseFile(filePath, languageParsers);
      if (definitions) {
        result += `${path
          .relative(dirPath, filePath)
          .toPosix()}\n${definitions}\n`;
      }
    }
  } catch (error) {
    console.error("Error during parsing:", error); // Log the full error
    return `Error during parsing: ${error}`; // Return an error message
  }

  return result ? result : "No source code definitions found.";
}

async function parseFile(
  filePath: string,
  languageParsers: LanguageParser
): Promise<string | null> {
  const fileContent = await fs.readFile(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase().slice(1);

  const { parser, query } = languageParsers[ext] || {};
  if (!parser || !query) {
    return `Unsupported file type: ${filePath}`;
  }

  let formattedOutput = "";

  try {
    // Parse the file content into an Abstract Syntax Tree (AST), a tree-like representation of the code
    const tree = parser.parse(fileContent);

    // Apply the query to the AST and get the captures
    // Captures are specific parts of the AST that match our query patterns, each capture represents a node in the AST that we're interested in.
    const captures = query.captures(tree.rootNode);

    // Sort captures by their start position
    captures.sort(
      (a, b) => a.node.startPosition.row - b.node.startPosition.row
    );

    // Split the file content into individual lines
    const lines = fileContent.split("\n");

    // Keep track of the last line we've processed
    let lastLine = -1;

    captures.forEach((capture) => {
      const { node, name } = capture;
      // Get the start and end lines of the current AST node
      const startLine = node.startPosition.row;
      const endLine = node.endPosition.row;
      // Once we've retrieved the nodes we care about through the language query, we filter for lines with definition names only.
      // name.startsWith("name.reference.") > refs can be used for ranking purposes, but we don't need them for the output
      // previously we did `name.startsWith("name.definition.")` but this was too strict and excluded some relevant definitions

      // Add separator if there's a gap between captures
      if (lastLine !== -1 && startLine > lastLine + 1) {
        formattedOutput += "|----\n";
      }
      // Only add the first line of the definition
      // query captures includes the definition name and the definition implementation, but we only want the name (I found discrepencies in the naming structure for various languages, i.e. javascript names would be 'name' and typescript names would be 'name.definition)
      if (name.includes("name") && lines[startLine]) {
        formattedOutput += `│${lines[startLine]}\n`;
      }
      // Adds all the captured lines
      // for (let i = startLine; i <= endLine; i++) {
      // 	formattedOutput += `│${lines[i]}\n`
      // }
      //}

      lastLine = endLine;
    });
  } catch (error) {
    console.log(`Error parsing file: ${error}\n`);
  }

  if (formattedOutput.length > 0) {
    return `|----\n${formattedOutput}|----\n`;
  }
  return null;
}

function separateFiles(allFiles: string[]): {
  filesToParse: string[];
  remainingFiles: string[];
} {
  const extensions = [
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "rs",
    "go",
    "c",
    "h",
    "cpp",
    "hpp",
    "cs",
    "rb",
    "java",
    "php",
    "swift",
    "kt",
  ].map((e) => `.${e}`);
  const filesToParse = allFiles
    .filter((file) => extensions.includes(path.extname(file)))
    .slice(0, 50);
  const remainingFiles = allFiles.filter(
    (file) => !filesToParse.includes(file)
  );
  return { filesToParse, remainingFiles };
}
