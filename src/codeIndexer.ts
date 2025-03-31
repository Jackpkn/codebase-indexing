import * as path from "path";
import * as fs from "fs";
import ParserModule from "web-tree-sitter";
import {
  loadRequiredLanguageParsers,
  LanguageParser,
} from "./tree-sitter/languageParser";

interface CodeNode {
  id: string;
  type: string;
  name?: string;
  text: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  filePath: string;
  children: CodeNode[];
  parent?: CodeNode;
}

interface QueryResult {
  node: CodeNode;
  score: number;
  matches: string[];
}

export class CodeIndexer {
  private parsers: LanguageParser | null = null;
  private fileIndex: Map<string, CodeNode> = new Map();
  private nodeIndex: Map<string, CodeNode> = new Map();

  async initialize(workspaceFolders: string[]): Promise<void> {
    console.log("Initializing CodeIndexer with folders:", workspaceFolders);
    const allFiles = this.getAllFiles(workspaceFolders);
    console.log("Found files to index:", allFiles);

    console.log("Loading language parsers...");
    try {
      this.parsers = await loadRequiredLanguageParsers(allFiles);
      console.log("Language parsers loaded successfully");
      //Log only keys, query is too much.
      if (this.parsers) {
        console.log("Available parsers:", Object.keys(this.parsers));
      }
    } catch (error) {
      console.error("Failed to load language parsers:", error);
      throw error;
    }

    console.log("Starting to index files...");
    for (const file of allFiles) {
      console.log(`Indexing file: ${file}`);
      try {
        await this.indexFile(file);
        console.log(`Successfully indexed file: ${file}`);
      } catch (error) {
        console.error(`Failed to index file ${file}:`, error);
        throw error;
      }
    }

    console.log(
      `Indexing complete. Indexed ${this.fileIndex.size} files with ${this.nodeIndex.size} code nodes`
    );
  }

  private getAllFiles(folders: string[]): string[] {
    console.log("Scanning folders for files:", folders);
    const files: string[] = [];

    const processFolder = (folder: string) => {
      console.log(`Processing folder: ${folder}`);
      try {
        const items = fs.readdirSync(folder);

        for (const item of items) {
          const itemPath = path.join(folder, item);
          const stats = fs.statSync(itemPath);

          if (
            stats.isDirectory() &&
            !item.startsWith(".") &&
            item !== "node_modules"
          ) {
            console.log(`Found subfolder: ${itemPath}`);
            processFolder(itemPath);
          } else if (stats.isFile() && this.isSupportedFileType(itemPath)) {
            console.log(`Found supported file: ${itemPath}`);
            files.push(itemPath);
          }
        }
      } catch (error) {
        console.error(`Error reading folder ${folder}:`, error);
      }
    };

    for (const folder of folders) {
      processFolder(folder);
    }

    console.log(`Total files found: ${files.length}`);
    return files;
  }

  private isSupportedFileType(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return ["js", "jsx", "ts", "tsx", "go"].includes(ext);
  }

  async indexFile(filePath: string): Promise<void> {
    console.log(`Starting to index file: ${filePath}`);
    if (!this.parsers) {
      console.error("Indexer not initialized - parsers is null");
      throw new Error("Indexer not initialized");
    }

    const ext = path.extname(filePath).toLowerCase().slice(1);
    console.log(`File extension: ${ext}`);

    const parserEntry = this.parsers[ext];
    if (!parserEntry) {
      console.warn(`No parser available for ${ext} files`); // Use warn here to not break execution
      return;
    }

    const { parser, query } = parserEntry;

    console.log(`Using parser for ${ext} files`);

    try {
      console.log(`Reading file content: ${filePath}`);
      const fileContent = fs.readFileSync(filePath, "utf8");
      console.log(`File content length: ${fileContent.length} characters`);

      console.log("Parsing file content...");
      const tree = parser.parse(fileContent) as ParserModule.Tree;
      console.log("File parsed successfully");

      console.log("Converting to CodeNode...");
      const rootNode = this.convertToCodeNode(
        tree.rootNode,
        filePath,
        fileContent
      );
      console.log("Conversion complete");

      this.fileIndex.set(filePath, rootNode);
      this.indexNode(rootNode);
      console.log(`File ${filePath} indexed successfully`);
    } catch (error) {
      console.error(`Error indexing file ${filePath}:`, error);
      throw error;
    }
  }

  private convertToCodeNode(
    node: any,
    filePath: string,
    fileContent: string
  ): CodeNode {
    const id = `${filePath}:${node.startPosition.row}:${node.startPosition.column}`;

    const codeNode: CodeNode = {
      id,
      type: node.type,
      text: node.text,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      startCol: node.startPosition.column,
      endCol: node.endPosition.column,
      filePath,
      children: [],
    };

    // Extract name for various node types
    if (
      [
        "function_declaration",
        "method_definition",
        "class_declaration",
        "variable_declaration",
        "interface_declaration", // Added for interfaces
        "type_alias", // Added for type aliases
        "property_signature", // Added for interface properties
      ].includes(node.type)
    ) {
      const nameNode = node.childForFieldName
        ? node.childForFieldName("name")
        : null;
      if (nameNode) {
        codeNode.name = nameNode.text;
      } else {
        // Fallback for property signatures that might not have childForFieldName
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (
            child &&
            (child.type === "property_identifier" ||
              child.type === "type_identifier")
          ) {
            codeNode.name = child.text;
            break;
          }
        }
      }
    }

    // Process all children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type !== "comment") {
        const childNode = this.convertToCodeNode(child, filePath, fileContent);
        childNode.parent = codeNode;
        codeNode.children.push(childNode);
      }
    }

    return codeNode;
  }
  // Add this new method for scoring interfaces and types
  private calculateSpecialTypeScore(
    node: CodeNode,
    queryTerms: string[]
  ): number {
    let score = 1.0;

    // Check if any of the query terms match properties within the interface/type
    const nodeText = node.text.toLowerCase();
    const matchingTerms = queryTerms.filter((term) => nodeText.includes(term));

    score += matchingTerms.length * 0.5;

    // Boost score for interfaces/types with a name that matches a query term
    if (node.name) {
      const matchesName = queryTerms.some((term) =>
        node.name?.toLowerCase().includes(term)
      );

      if (matchesName) {
        score *= 2;
      }
    }

    // Look for property names in the interface that match query terms
    const propertyMatches = node.children.filter(
      (child) =>
        child.type === "property_signature" &&
        child.name &&
        queryTerms.some((term) => child.name?.toLowerCase().includes(term))
    ).length;

    score += propertyMatches * 0.75;

    return score;
  }
  private indexNode(node: CodeNode): void {
    this.nodeIndex.set(node.id, node);

    for (const child of node.children) {
      this.indexNode(child);
    }
  }

  async search(query: string): Promise<QueryResult[]> {
    console.log(`Starting search for query: "${query}"`);
    const results: QueryResult[] = [];

    // Normalize query
    const searchQueryLower = query.toLowerCase().trim();
    // Split into terms for more flexible matching
    const queryTerms = searchQueryLower.split(/\s+/);

    console.log("Query terms:", queryTerms);

    // Create a map to track nodes we've already added to avoid duplicates
    const addedNodes = new Map<string, boolean>();

    // First pass: Look for exact matches with the full query
    for (const node of this.nodeIndex.values()) {
      const nodeText = node.text.toLowerCase();
      const nodeType = node.type.toLowerCase();
      const nodeName = node.name?.toLowerCase() || "";

      // Check for exact matches in text, type, or name
      if (
        nodeText.includes(searchQueryLower) ||
        nodeType.includes(searchQueryLower) ||
        nodeName.includes(searchQueryLower)
      ) {
        const score = this.calculateScore(node, queryTerms);

        if (score > 0 && !addedNodes.has(node.id)) {
          addedNodes.set(node.id, true);
          results.push({
            node,
            score: score * 2, // Prioritize exact matches
            matches: [searchQueryLower],
          });
          console.log(
            `Found exact match in node: ${node.id}, type: ${node.type}, name: ${
              node.name || "unnamed"
            }`
          );
        }
      }
    }

    // Second pass: Look for partial matches using terms
    for (const node of this.nodeIndex.values()) {
      // Skip if we've already added this node
      if (addedNodes.has(node.id)) continue;

      const nodeText = node.text.toLowerCase();
      const nodeType = node.type.toLowerCase();
      const nodeName = node.name?.toLowerCase() || "";

      // Calculate matching terms
      const matchingTerms = queryTerms.filter(
        (term) =>
          nodeText.includes(term) ||
          nodeType.includes(term) ||
          nodeName.includes(term)
      );

      if (matchingTerms.length > 0) {
        const score = this.calculateScore(node, matchingTerms);

        if (score > 0) {
          results.push({
            node,
            score,
            matches: matchingTerms,
          });
          console.log(
            `Found partial match in node: ${node.id}, type: ${
              node.type
            }, name: ${node.name || "unnamed"}`
          );
        }
      }
    }

    // Third pass: Special handling for interfaces and types
    if (
      searchQueryLower.includes("interface") ||
      searchQueryLower.includes("type")
    ) {
      for (const node of this.nodeIndex.values()) {
        // Skip if we've already added this node
        if (addedNodes.has(node.id)) continue;

        // Look specifically for interface_declaration and type_alias nodes
        if (
          node.type === "interface_declaration" ||
          node.type === "type_alias"
        ) {
          const score = this.calculateSpecialTypeScore(node, queryTerms);

          if (score > 0) {
            results.push({
              node,
              score: score * 1.5, // Boost for interfaces/types when explicitly looking for them
              matches: ["interface"],
            });
            console.log(
              `Found interface/type match: ${node.id}, type: ${
                node.type
              }, name: ${node.name || "unnamed"}`
            );
          }
        }
      }
    }

    if (results.length === 0) {
      console.log("No matching code found.");
    } else {
      console.log(`Search found ${results.length} results.`);
    }

    // Sort by score (highest first)
    return results.sort((a, b) => b.score - a.score);
  }
  private calculateScore(node: CodeNode, matchingTerms: string[]): number {
    let score = matchingTerms.length;

    if (
      [
        "function_declaration",
        "method_definition",
        "class_declaration",
      ].includes(node.type)
    ) {
      score *= 2;
    }

    const lines = node.endLine - node.startLine + 1;
    if (lines <= 30 && lines >= 3) {
      score *= 1.5;
    }

    if (node.name) {
      const matchesName = matchingTerms.some((term) =>
        node.name?.toLowerCase().includes(term)
      );

      if (matchesName) {
        score *= 3;
      }
    }

    return score;
  }

  getNodeAtPosition(
    filePath: string,
    line: number,
    column: number
  ): CodeNode | null {
    const rootNode = this.fileIndex.get(filePath);
    if (!rootNode) return null;

    return this.findNodeAtPosition(rootNode, line, column);
  }

  private findNodeAtPosition(
    node: CodeNode,
    line: number,
    column: number
  ): CodeNode | null {
    if (
      line < node.startLine ||
      (line === node.startLine && column < node.startCol) ||
      line > node.endLine ||
      (line === node.endLine && column > node.endCol)
    ) {
      return null;
    }

    for (const child of node.children) {
      const childResult = this.findNodeAtPosition(child, line, column);
      if (childResult) {
        return childResult;
      }
    }

    return node;
  }

  async updateFile(filePath: string): Promise<void> {
    const oldRootNode = this.fileIndex.get(filePath);
    if (oldRootNode) {
      this.removeNodeFromIndex(oldRootNode);
    }

    await this.indexFile(filePath);
  }

  private removeNodeFromIndex(node: CodeNode): void {
    this.nodeIndex.delete(node.id);

    for (const child of node.children) {
      this.removeNodeFromIndex(child);
    }
  }

  getNodeText(nodeId: string): string | null {
    const node = this.nodeIndex.get(nodeId);
    return node ? node.text : null;
  }

  getNodePosition(nodeId: string): {
    filePath: string;
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  } | null {
    const node = this.nodeIndex.get(nodeId);
    if (!node) return null;

    return {
      filePath: node.filePath,
      startLine: node.startLine,
      startCol: node.startCol,
      endLine: node.endLine,
      endCol: node.endCol,
    };
  }
}
