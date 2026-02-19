import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "testsecret";

const inputFiles = process.argv.slice(2);
const testFiles =
  inputFiles.length > 0
    ? inputFiles
    : readdirSync("server/__tests__")
        .filter((name) => name.endsWith(".test.ts"))
        .sort()
        .map((name) => path.join("server", "__tests__", name));

if (testFiles.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

console.log("Running server tests...");
for (const file of testFiles) {
  console.log(`---- Running ${file} ----`);
  const result = spawnSync("npx", ["tsx", file], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("All tests completed successfully");
