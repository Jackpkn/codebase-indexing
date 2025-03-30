// // scripts/copy-wasm.js
// const fs = require("fs");
// const path = require("path");

// const sourceDir = path.join(__dirname, "..", "tree-sitter");
// const targetDir = path.join(__dirname, "..", "out", "tree-sitter");

// // Create target directory if it doesn't exist
// if (!fs.existsSync(targetDir)) {
//   fs.mkdirSync(targetDir, { recursive: true });
// }

// // Copy all WASM files
// const wasmFiles = fs
//   .readdirSync(sourceDir)
//   .filter((file) => file.endsWith(".wasm"));
// for (const file of wasmFiles) {
//   const source = path.join(sourceDir, file);
//   const target = path.join(targetDir, file);
//   console.log(`Copying ${source} to ${target}`);
//   fs.copyFileSync(source, target);
// }

// console.log("WASM files copied successfully");
