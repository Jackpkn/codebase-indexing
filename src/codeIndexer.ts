import * as path from "path";
import * as fs from "fs";
import ParserModule from "web-tree-sitter";
import {
  loadRequiredLanguageParsers,
  LanguageParser,
} from "./tree-sitter/languageParser";

// Interface to represent a code node for indexing
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

// Interface for query results
interface QueryResult {
  node: CodeNode;
  score: number;
  matches: string[];
}

// Class to handle code indexing and searching
export class CodeIndexer {
  private parsers: LanguageParser | null = null;
  private fileIndex: Map<string, CodeNode> = new Map();
  private nodeIndex: Map<string, CodeNode> = new Map();

  // Initialize the indexer with tree-sitter parsers
  async initialize(workspaceFolders: string[]): Promise<void> {
    console.log("Initializing CodeIndexer with folders:", workspaceFolders);
    const allFiles = this.getAllFiles(workspaceFolders);
    console.log("Found files to index:", allFiles);

    console.log("Loading language parsers...");
    try {
      this.parsers = await loadRequiredLanguageParsers(allFiles);
      console.log("Language parsers loaded successfully");
      console.log(
        "Available parsers:",
        Array.from(this.parsers.parsers.keys())
      );
    } catch (error) {
      console.error("Failed to load language parsers:", error);
      throw error;
    }

    // Index all files
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

  // Get all files recursively from workspace folders
  private getAllFiles(folders: string[]): string[] {
    console.log("Scanning folders for files:", folders);
    const files: string[] = [];

    const processFolder = (folder: string) => {
      console.log(`Processing folder: ${folder}`);
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
    };

    for (const folder of folders) {
      processFolder(folder);
    }

    console.log(`Total files found: ${files.length}`);
    return files;
  }

  // Check if file is a supported type
  private isSupportedFileType(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return ["js", "jsx", "ts", "tsx", "go"].includes(ext);
  }

  // Index a single file
  async indexFile(filePath: string): Promise<void> {
    console.log(`Starting to index file: ${filePath}`);
    if (!this.parsers) {
      console.error("Indexer not initialized - parsers is null");
      throw new Error("Indexer not initialized");
    }

    const ext = path.extname(filePath).toLowerCase().slice(1);
    console.log(`File extension: ${ext}`);
    console.log(
      `Available parsers: ${Array.from(this.parsers.parsers.keys())}`
    );

    const parser = this.parsers.parsers.get(ext);

    if (!parser) {
      console.error(`No parser available for ${ext} files`);
      throw new Error(`No parser available for ${ext} files`);
    }

    console.log(`Using parser for ${ext} files`);

    try {
      console.log(`Reading file content: ${filePath}`);
      const fileContent = fs.readFileSync(filePath, "utf8");
      console.log(`File content length: ${fileContent.length} characters`);

      console.log("Parsing file content...");
      const tree = parser.parser.parse(fileContent) as ParserModule.Tree;
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

  // Convert tree-sitter node to our CodeNode format
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

    // Extract name for certain node types
    if (
      [
        "function_declaration",
        "method_definition",
        "class_declaration",
        "variable_declaration",
      ].includes(node.type)
    ) {
      const nameNode = node.childForFieldName
        ? node.childForFieldName("name")
        : null;
      if (nameNode) {
        codeNode.name = nameNode.text;
      }
    }

    // Process children
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

  // Index a node and all its children
  private indexNode(node: CodeNode): void {
    this.nodeIndex.set(node.id, node);

    for (const child of node.children) {
      this.indexNode(child);
    }
  }

  // Search for code nodes matching a query
  async search(query: string): Promise<QueryResult[]> {
    const results: QueryResult[] = [];
    const queryTerms = query.toLowerCase().split(/\s+/);

    for (const node of this.nodeIndex.values()) {
      // Skip very small nodes
      if (node.text.length < 10) continue;

      const nodeText = node.text.toLowerCase();
      const matchingTerms = queryTerms.filter((term) =>
        nodeText.includes(term)
      );

      if (matchingTerms.length > 0) {
        const score = this.calculateScore(node, matchingTerms);

        if (score > 0) {
          results.push({
            node,
            score,
            matches: matchingTerms,
          });
        }
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }

  // Calculate relevance score for a node
  private calculateScore(node: CodeNode, matchingTerms: string[]): number {
    let score = matchingTerms.length;

    // Prefer functions, methods, classes
    if (
      [
        "function_declaration",
        "method_definition",
        "class_declaration",
      ].includes(node.type)
    ) {
      score *= 2;
    }

    // Prefer smaller chunks of code (but not too small)
    const lines = node.endLine - node.startLine + 1;
    if (lines <= 30 && lines >= 3) {
      score *= 1.5;
    }

    // If the node has a name, and the name matches, boost score
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

  // Get a code node by its position in a file
  getNodeAtPosition(
    filePath: string,
    line: number,
    column: number
  ): CodeNode | null {
    const rootNode = this.fileIndex.get(filePath);
    if (!rootNode) return null;

    return this.findNodeAtPosition(rootNode, line, column);
  }

  // Find the most specific node at a position
  private findNodeAtPosition(
    node: CodeNode,
    line: number,
    column: number
  ): CodeNode | null {
    // Check if position is within this node
    if (
      line < node.startLine ||
      (line === node.startLine && column < node.startCol) ||
      line > node.endLine ||
      (line === node.endLine && column > node.endCol)
    ) {
      return null;
    }

    // Check children for more specific nodes
    for (const child of node.children) {
      const childResult = this.findNodeAtPosition(child, line, column);
      if (childResult) {
        return childResult;
      }
    }

    // If no child contains the position, return this node
    return node;
  }

  // Update index when a file changes
  async updateFile(filePath: string): Promise<void> {
    // Remove all nodes from this file
    const oldRootNode = this.fileIndex.get(filePath);
    if (oldRootNode) {
      this.removeNodeFromIndex(oldRootNode);
    }

    // Re-index the file
    await this.indexFile(filePath);
  }

  // Remove a node and all its children from the index
  private removeNodeFromIndex(node: CodeNode): void {
    this.nodeIndex.delete(node.id);

    for (const child of node.children) {
      this.removeNodeFromIndex(child);
    }
  }

  // Get the code text for a specific node
  getNodeText(nodeId: string): string | null {
    const node = this.nodeIndex.get(nodeId);
    return node ? node.text : null;
  }

  // Get the position info needed to insert code
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
