import * as vscode from "vscode";
import * as path from "path";
import { CodeIndexer } from "./codeIndexer";
import { LlmService, LlmServiceOptions } from "./llmService";

export function activateCodeSearchChat(
  context: vscode.ExtensionContext,
  indexer: CodeIndexer
) {
  // Create output channel for chat
  const chatOutput = vscode.window.createOutputChannel("Code Search Chat");

  // Initialize LLM service
  const llmOptions: LlmServiceOptions = {
    apiKey: "test-key", // Use your actual API key in production
    model:
      vscode.workspace.getConfiguration("aiCodeEditor").get("llmModel") ||
      "gpt-4",
  };
  const llmService = new LlmService(llmOptions);

  // Register chat command
  const chatCommand = vscode.commands.registerCommand(
    "aiCodeEditor.searchChat",
    async () => {
      chatOutput.show(true);
      chatOutput.appendLine("========== Code Search Chat ==========");
      chatOutput.appendLine(
        "Type your query about the codebase and I'll try to find relevant code."
      );

      await startChatSession(chatOutput, indexer, llmService);
    }
  );

  context.subscriptions.push(chatCommand);
}

async function startChatSession(
  chatOutput: vscode.OutputChannel,
  indexer: CodeIndexer,
  llmService: LlmService
) {
  let chatActive = true;

  while (chatActive) {
    // Get user query
    const query = await vscode.window.showInputBox({
      prompt: "What would you like to know about the codebase?",
      placeHolder: "e.g., How does the code handle API requests?",
      ignoreFocusOut: true,
    });

    if (!query) {
      chatOutput.appendLine("\nChat session ended.");
      chatActive = false;
      continue;
    }

    chatOutput.appendLine(`\n> ${query}`);

    try {
      // Log indexing stats
      // const stats = indexer.getIndexStats();
      // chatOutput.appendLine(
      //   `\n[DEBUG] Index status: ${stats.fileCount} files, ${stats.nodeCount} code nodes indexed`
      // );

      // Search for matching code
      chatOutput.appendLine(`\nSearching for relevant code...`);
      const results = await indexer.search(query);

      if (results.length === 0) {
        chatOutput.appendLine(`No matching code found for query: "${query}"`);
        continue;
      }

      // Display results
      chatOutput.appendLine(`Found ${results.length} matching code sections.`);
      chatOutput.appendLine(
        `Showing top ${Math.min(3, results.length)} results:\n`
      );

      const topResults = results.slice(0, 3);
      for (let i = 0; i < topResults.length; i++) {
        const result = topResults[i];
        const node = result.node;

        chatOutput.appendLine(`Result ${i + 1}:`);
        chatOutput.appendLine(
          `File: ${path.basename(node.filePath)} (${node.filePath})`
        );
        chatOutput.appendLine(
          `Type: ${node.type} ${node.name ? `- ${node.name}` : ""}`
        );
        chatOutput.appendLine(
          `Location: Lines ${node.startLine + 1}-${node.endLine + 1}`
        );
        chatOutput.appendLine(`Relevance score: ${result.score.toFixed(2)}`);
        chatOutput.appendLine(`\nCode snippet:`);
        chatOutput.appendLine("```");
        chatOutput.appendLine(node.text);
        chatOutput.appendLine("```\n");

        // Option to view this file
        const openFile = await vscode.window.showInformationMessage(
          `Found relevant code in ${path.basename(node.filePath)}`,
          "View File",
          "Continue Searching"
        );

        if (openFile === "View File") {
          const document = await vscode.workspace.openTextDocument(
            node.filePath
          );
          const editor = await vscode.window.showTextDocument(document);

          // Highlight the relevant code section
          const startPos = new vscode.Position(node.startLine, node.startCol);
          const endPos = new vscode.Position(node.endLine, node.endCol);
          editor.selection = new vscode.Selection(startPos, endPos);
          editor.revealRange(
            new vscode.Range(startPos, endPos),
            vscode.TextEditorRevealType.InCenter
          );

          // Add temp decoration
          const decoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor(
              "editor.findMatchHighlightBackground"
            ),
            isWholeLine: true,
          });

          editor.setDecorations(decoration, [
            new vscode.Range(startPos, endPos),
          ]);

          // Remove decoration after a few seconds
          setTimeout(() => {
            decoration.dispose();
          }, 3000);
        }
      }

      // Generate LLM response based on search results
      chatOutput.appendLine(
        `\nAnalyzing search results to answer your query...`
      );

      // Construct prompt with found code
      const codeContexts = topResults
        .map((result, i) => {
          return `Code snippet ${i + 1} (${path.basename(
            result.node.filePath
          )}):
\`\`\`
${result.node.text}
\`\`\``;
        })
        .join("\n\n");

      const llmPrompt = `
You are a code assistant that helps developers understand their codebase.
Based on the following code snippets from the codebase, please answer this query:
"${query}"

${codeContexts}

Please provide a concise but thorough response that explains how the code works in relation to the query.
`;

      // This would use your LLM service to get a response
      // For now we'll just simulate a response
      let llmResponse: string;
      try {
        // This would be your actual LLM call
        llmResponse = await llmService.getCompletion(llmPrompt);
      } catch (error) {
        llmResponse = `I encountered an error while analyzing the code: ${error}. 
However, I found some relevant code sections you can examine manually above.`;
      }

      chatOutput.appendLine("\nResponse:");
      chatOutput.appendLine(llmResponse);

      // Ask if user wants to continue
      const continueChat = await vscode.window.showInformationMessage(
        "Would you like to ask another question?",
        "Yes",
        "No"
      );

      if (continueChat !== "Yes") {
        chatOutput.appendLine("\nChat session ended.");
        chatActive = false;
      }
    } catch (error) {
      chatOutput.appendLine(`\nError: ${error}`);
    }
  }
}
// Track document changes
let documentChangeTimeout: NodeJS.Timeout | null = null;

export async function activate(context: vscode.ExtensionContext) {
  console.log("Activating AI Code Editor extension");
  console.log("Workspace folders:", vscode.workspace.workspaceFolders);

  // Initialize the indexer
  const indexer = new CodeIndexer();
  const workspaceFolders =
    vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) || [];

  if (workspaceFolders.length === 0) {
    console.log("No workspace folders found");
    vscode.window.showWarningMessage(
      "No workspace folder open. Please open a folder to use AI Code Editor."
    );
    return;
  }

  console.log("Found workspace folders:", workspaceFolders);

  // Show indexing progress
  const indexingProgress = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  indexingProgress.text = "$(sync~spin) Indexing code...";
  indexingProgress.show();

  try {
    console.log("Starting code indexing...");
    await indexer.initialize(workspaceFolders);
    console.log("Code indexing completed successfully");
    indexingProgress.dispose();
    vscode.window.setStatusBarMessage("Code indexing complete!", 3000);
  } catch (error) {
    console.error("Failed to index code:", error);
    indexingProgress.dispose();
    vscode.window.showErrorMessage(`Failed to index code: ${error}`);
    return;
  }

  // Initialize LLM service with temporary API key bypass
  const llmOptions: LlmServiceOptions = {
    // Temporarily comment out API key requirement for testing
    // apiKey: await getApiKey(),
    apiKey: "test-key", // Temporary test key
    model:
      vscode.workspace.getConfiguration("aiCodeEditor").get("llmModel") ||
      "gpt-4",
  };
  console.log("Initializing LLM service with options:", llmOptions);
  const llmService = new LlmService(llmOptions);

  // Register command to search and modify code
  const searchCommand = vscode.commands.registerCommand(
    "aiCodeEditor.searchAndModify",
    async () => {
      // Get user query
      const query = await vscode.window.showInputBox({
        prompt: "Search for code to modify",
        placeHolder: "e.g., login function, user authentication, API request",
      });

      if (!query) return;

      // Search for matching code
      const results = await indexer.search(query);

      if (results.length === 0) {
        vscode.window.showInformationMessage("No matching code found.");
        return;
      }

      // Create quick pick items
      const quickPickItems = results.slice(0, 10).map((result) => {
        const node = result.node;
        const preview =
          node.text.length > 100
            ? `${node.text.substring(0, 100)}...`
            : node.text;

        return {
          label: node.name || node.type,
          description: `${path.basename(node.filePath)}:${node.startLine + 1}`,
          detail: preview.replace(/\n/g, "␤"),
          node: node,
        };
      });

      // Let user pick a result
      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: "Select code to modify",
      });

      if (!selected) return;

      // Get modification instructions
      const instruction = await vscode.window.showInputBox({
        prompt: "What would you like to change about this code?",
        placeHolder:
          "e.g., add error handling, refactor to use async/await, add documentation",
      });

      if (!instruction) return;

      // Get selected code
      const code = indexer.getNodeText(selected.node.id);
      if (!code) {
        vscode.window.showErrorMessage("Could not retrieve code.");
        return;
      }

      // Get language from file extension
      const fileExt = path
        .extname(selected.node.filePath)
        .toLowerCase()
        .slice(1);
      const languageMap: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        go: "go",
      };
      const language = languageMap[fileExt] || fileExt;

      // Show progress while LLM processes
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Generating code modification...",
          cancellable: false,
        },
        async (progress) => {
          try {
            // Transform code with LLM
            const modifiedCode = await llmService.transformCode({
              code,
              instruction,
              language,
            });

            // Get position info
            const position = indexer.getNodePosition(selected.node.id);
            if (!position) {
              throw new Error("Could not determine code position");
            }

            // Open file and apply edit
            const document = await vscode.workspace.openTextDocument(
              position.filePath
            );
            const editor = await vscode.window.showTextDocument(document);

            const startPos = new vscode.Position(
              position.startLine,
              position.startCol
            );
            const endPos = new vscode.Position(
              position.endLine,
              position.endCol
            );
            const range = new vscode.Range(startPos, endPos);

            await editor.edit((editBuilder) => {
              editBuilder.replace(range, modifiedCode);
            });

            vscode.window.showInformationMessage("Code modification applied!");

            // Re-index the file to update our index
            await indexer.updateFile(position.filePath);
          } catch (error) {
            vscode.window.showErrorMessage(`Error modifying code: ${error}`);
          }
        }
      );
    }
  );

  // Register file change listeners to keep index updated
  const fileChangeListener = vscode.workspace.onDidSaveTextDocument(
    async (document) => {
      const filePath = document.uri.fsPath;

      // Only process supported file types
      const ext = path.extname(filePath).toLowerCase().slice(1);
      if (!["js", "jsx", "ts", "tsx", "go"].includes(ext)) {
        return;
      }

      // Debounce updates to avoid too many reindexes
      if (documentChangeTimeout) {
        clearTimeout(documentChangeTimeout);
      }

      documentChangeTimeout = setTimeout(async () => {
        try {
          await indexer.updateFile(filePath);
          console.log(`Reindexed file: ${filePath}`);
        } catch (error) {
          console.error(`Error reindexing file ${filePath}:`, error);
        }
      }, 1000);
    }
  );

  // Register context menu command for selected code
  const contextMenuCommand = vscode.commands.registerTextEditorCommand(
    "aiCodeEditor.modifySelectedCode",
    async (editor) => {
      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showInformationMessage("Please select some code first");
        return;
      }

      const selectedText = editor.document.getText(selection);
      const filePath = editor.document.uri.fsPath;
      const fileExt = path.extname(filePath).toLowerCase().slice(1);
      const language =
        {
          js: "javascript",
          jsx: "javascript",
          ts: "typescript",
          tsx: "typescript",
          go: "go",
        }[fileExt] || fileExt;

      // Get modification instructions
      const instruction = await vscode.window.showInputBox({
        prompt: "What would you like to change about this code?",
        placeHolder:
          "e.g., add error handling, refactor to use async/await, add documentation",
      });

      if (!instruction) return;

      // Show progress while LLM processes
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Generating code modification...",
          cancellable: false,
        },
        async (progress) => {
          try {
            // Transform code with LLM
            const modifiedCode = await llmService.transformCode({
              code: selectedText,
              instruction,
              language,
            });

            // Apply edit
            await editor.edit((editBuilder) => {
              editBuilder.replace(selection, modifiedCode);
            });

            vscode.window.showInformationMessage("Code modification applied!");

            // Re-index the file to update our index
            await indexer.updateFile(filePath);
          } catch (error) {
            vscode.window.showErrorMessage(`Error modifying code: ${error}`);
          }
        }
      );
    }
  );

  // Register command to get API key if needed
  const apiKeyCommand = vscode.commands.registerCommand(
    "aiCodeEditor.setApiKey",
    async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your API key",
        password: true,
        ignoreFocusOut: true,
      });

      if (apiKey) {
        await context.secrets.store("aiCodeEditor.apiKey", apiKey);
        vscode.window.showInformationMessage("API key saved!");
      }
    }
  );

  context.subscriptions.push(
    searchCommand,
    contextMenuCommand,
    apiKeyCommand,
    fileChangeListener,
    // Register a command for cursor-position-based transformations
    vscode.commands.registerTextEditorCommand(
      "aiCodeEditor.transformAtCursor",
      async (editor) => {
        const position = editor.selection.active;
        const filePath = editor.document.uri.fsPath;

        // Get node at cursor position
        const node = indexer.getNodeAtPosition(
          filePath,
          position.line,
          position.character
        );

        if (!node) {
          vscode.window.showInformationMessage(
            "Could not identify code structure at cursor position"
          );
          return;
        }

        // Continue with transformation flow similar to searchAndModify command
        const instruction = await vscode.window.showInputBox({
          prompt: "What would you like to change about this code?",
          placeHolder:
            "e.g., add error handling, refactor to use async/await, add documentation",
        });

        if (!instruction) return;

        // Get code
        const code = node.text;
        const fileExt = path.extname(filePath).toLowerCase().slice(1);
        const language =
          {
            js: "javascript",
            jsx: "javascript",
            ts: "typescript",
            tsx: "typescript",
            go: "go",
          }[fileExt] || fileExt;

        // Show progress while LLM processes
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Generating code modification...",
            cancellable: false,
          },
          async (progress) => {
            try {
              // Transform code with LLM
              const modifiedCode = await llmService.transformCode({
                code: code,
                instruction,
                language,
              });

              // Apply edit
              const startPos = new vscode.Position(
                node.startLine,
                node.startCol
              );
              const endPos = new vscode.Position(node.endLine, node.endCol);
              const range = new vscode.Range(startPos, endPos);

              await editor.edit((editBuilder) => {
                editBuilder.replace(range, modifiedCode);
              });

              vscode.window.showInformationMessage(
                "Code modification applied!"
              );

              // Re-index the file to update our index
              await indexer.updateFile(filePath);
            } catch (error) {
              vscode.window.showErrorMessage(`Error modifying code: ${error}`);
            }
          }
        );
      }
    )
  );

  async function getApiKey(): Promise<string> {
    // Try to get from secrets
    const apiKey = await context.secrets.get("aiCodeEditor.apiKey");
    if (apiKey) return apiKey;

    // Schedule a command to prompt for API key
    setTimeout(() => {
      vscode.commands.executeCommand("aiCodeEditor.setApiKey");
    }, 1000);

    return "";
  }
}

export function deactivate() {
  if (documentChangeTimeout) {
    clearTimeout(documentChangeTimeout);
  }
}
