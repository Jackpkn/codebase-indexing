// // setup-tree-sitter.js
// const fs = require("fs");
// const path = require("path");
// const childProcess = require("child_process");

// // Create directory for tree-sitter WASM files
// const wasmDir = path.join(__dirname, "tree-sitter");
// if (!fs.existsSync(wasmDir)) {
//   fs.mkdirSync(wasmDir, { recursive: true });
// }

// // Function to install and build a tree-sitter grammar
// async function setupGrammar(language) {
//   console.log(`Setting up tree-sitter-${language}...`);

//   // Check if we already have the package installed
//   const packagePath = path.join(
//     __dirname,
//     "node_modules",
//     `tree-sitter-${language}`
//   );
//   if (!fs.existsSync(packagePath)) {
//     console.log(`Installing tree-sitter-${language}...`);
//     childProcess.execSync(`npm install tree-sitter-${language}`, {
//       stdio: "inherit",
//     });
//   }

//   // Path to the output WASM file
//   const wasmFile = path.join(wasmDir, `tree-sitter-${language}.wasm`);

//   // If the WASM file doesn't exist yet, build it
//   if (!fs.existsSync(wasmFile)) {
//     console.log(`Building WASM for tree-sitter-${language}...`);

//     // This requires tree-sitter-cli to be installed
//     try {
//       const inputPath = path.join(
//         __dirname,
//         "node_modules",
//         `tree-sitter-${language}`
//       );
//       childProcess.execSync(`npx tree-sitter build-wasm ${inputPath}`, {
//         stdio: "inherit",
//       });

//       // The build command creates a .wasm file in the current directory
//       // Move it to our desired location
//       const builtWasm = path.join(__dirname, `tree-sitter-${language}.wasm`);
//       if (fs.existsSync(builtWasm)) {
//         fs.copyFileSync(builtWasm, wasmFile);
//         fs.unlinkSync(builtWasm); // Remove the original file
//         console.log(`Successfully built and moved ${language} WASM file`);
//       } else {
//         console.error(`Failed to find built WASM file for ${language}`);
//       }
//     } catch (error) {
//       console.error(`Error building WASM for ${language}:`, error);
//     }
//   } else {
//     console.log(`WASM file for ${language} already exists`);
//   }
// }

// // Set up the grammars we need
// async function main() {
//   // Install tree-sitter-cli if not already installed
//   try {
//     childProcess.execSync("npx tree-sitter --version", { stdio: "ignore" });
//   } catch (error) {
//     console.log("Installing tree-sitter-cli...");
//     childProcess.execSync("npm install -g tree-sitter-cli", {
//       stdio: "inherit",
//     });
//   }

//   // Set up each language
//   await setupGrammar("javascript");
//   await setupGrammar("typescript");
//   await setupGrammar("tsx");
//   await setupGrammar("go");

//   console.log("All tree-sitter grammars set up successfully");
// }

// main().catch(console.error);
