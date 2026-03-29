import fs from "node:fs";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "tsconfig.json");

const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
if (readResult.error) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => ts.sys.newLine,
  };
  console.error(ts.formatDiagnosticsWithColorAndContext([readResult.error], host));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, repoRoot);

const walkTypeScriptFiles = (dirPath) => {
  const collected = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collected.push(...walkTypeScriptFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) {
      continue;
    }

    collected.push(fullPath);
  }
  return collected;
};

const fallbackRoots = [
  path.join(repoRoot, "client", "src"),
  path.join(repoRoot, "shared"),
  path.join(repoRoot, "server"),
];

const rootNames = parsed.fileNames.length
  ? parsed.fileNames
  : fallbackRoots.flatMap((root) => (fs.existsSync(root) ? walkTypeScriptFiles(root) : []));

if (!rootNames.length) {
  console.error("[typecheck-safe] No TypeScript inputs were found from tsconfig or fallback scanning.");
  process.exit(1);
}

const program = ts.createProgram({
  rootNames,
  options: {
    ...parsed.options,
    noEmit: true,
  },
});

const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length > 0) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => ts.sys.newLine,
  };
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
  process.exit(1);
}

console.log("[typecheck-safe] TypeScript check passed.");
