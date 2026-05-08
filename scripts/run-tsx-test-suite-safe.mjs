import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv();
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "testsecret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
// Disable the 60-second auto-maintenance blackout that production mode enables on restart.
// Tests start a fresh server and immediately send requests, so the window would always block them.
process.env.AUTO_MAINTENANCE_DURATION_MS = "0";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const tsxCliPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const inputFiles = process.argv.slice(2);
const testFiles =
  inputFiles.length > 0
    ? inputFiles.map((file) => path.resolve(repoRoot, file))
    : readdirSync(path.join(repoRoot, "server", "__tests__"))
        .filter((name) => name.endsWith(".test.ts"))
        .sort()
        .map((name) => path.join(repoRoot, "server", "__tests__", name));

if (testFiles.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

console.log("Running server tests...");
for (const file of testFiles) {
  console.log(`---- Running ${path.relative(repoRoot, file)} ----`);
  const result = spawnSync(process.execPath, [tsxCliPath, file], {
    stdio: "inherit",
    cwd: repoRoot,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("All tests completed successfully");
