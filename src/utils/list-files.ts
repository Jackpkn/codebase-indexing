import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Function to check if two paths are equal
function arePathsEqual(path1: string, path2: string): boolean {
  // Normalize paths to handle different path formats
  const normalizedPath1 = path.normalize(path1);
  const normalizedPath2 = path.normalize(path2);

  // Case-insensitive comparison for Windows
  if (process.platform === "win32") {
    return normalizedPath1.toLowerCase() === normalizedPath2.toLowerCase();
  }

  // Case-sensitive comparison for other platforms
  return normalizedPath1 === normalizedPath2;
}

// List files function using fs.promises
export async function listFiles(
  dirPath: string,
  recursive: boolean,
  limit: number
): Promise<[string[], boolean]> {
  // Resolve the path
  const absolutePath = path.resolve(dirPath);

  // Do not allow listing files in root or home directory
  const root =
    process.platform === "win32" ? path.parse(absolutePath).root : "/";
  const isRoot = arePathsEqual(absolutePath, root);
  if (isRoot) {
    return [[root], false];
  }

  const homeDir = os.homedir();
  const isHomeDir = arePathsEqual(absolutePath, homeDir);
  if (isHomeDir) {
    return [[homeDir], false];
  }

  // Directories to ignore - these won't be traversed
  const dirsToIgnore = new Set([
    "node_modules",
    "__pycache__",
    "env",
    "venv",
    "target",
    "dist",
    "out",
    "bundle",
    "vendor",
    "tmp",
    "temp",
    "deps",
    "pkg",
    "Pods",
  ]);

  // For hidden directories (starting with .)
  const isHiddenDir = (name: string) => name.startsWith(".");

  const listFilesImplementation = recursive
    ? listFilesRecursive
    : listFilesNonRecursive;

  try {
    const [filePaths, reachedLimit] = await listFilesImplementation(
      absolutePath,
      limit,
      dirsToIgnore,
      isHiddenDir
    );
    return [filePaths, reachedLimit];
  } catch (error) {
    console.error("Error listing files:", error);
    return [[], false];
  }
}

// Non-recursive file listing
async function listFilesNonRecursive(
  dir: string,
  limit: number,
  dirsToIgnore: Set<string>,
  isHiddenDir: (name: string) => boolean
): Promise<[string[], boolean]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      if (results.length >= limit) {
        return [results, true];
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(fullPath + "/");
      } else {
        results.push(fullPath);
      }
    }

    return [results, results.length >= limit];
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
    return [[], false];
  }
}

// Recursive file listing with breadth-first search
async function listFilesRecursive(
  startDir: string,
  limit: number,
  dirsToIgnore: Set<string>,
  isHiddenDir: (name: string) => boolean
): Promise<[string[], boolean]> {
  const results: string[] = [];
  const queue: string[] = [startDir];
  const timeoutMs = 10000; // 10 seconds timeout
  const startTime = Date.now();

  try {
    while (queue.length > 0 && results.length < limit) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        console.warn("Listing operation timed out, returning partial results");
        return [results, true];
      }

      const currentDir = queue.shift()!;

      // Skip directories we want to ignore
      const dirName = path.basename(currentDir);
      if (dirsToIgnore.has(dirName) || isHiddenDir(dirName)) {
        continue;
      }

      try {
        const entries = await fs.promises.readdir(currentDir, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          if (results.length >= limit) {
            return [results, true];
          }

          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            // Add directory to results with trailing slash
            results.push(fullPath + "/");
            // Add to queue for further processing
            queue.push(fullPath);
          } else {
            results.push(fullPath);
          }
        }
      } catch (error) {
        // Just skip directories we can't read
        console.warn(`Skipping directory ${currentDir} due to error:`, error);
      }
    }

    return [results, results.length >= limit];
  } catch (error) {
    console.error("Error in recursive listing:", error);
    return [results, false];
  }
}
