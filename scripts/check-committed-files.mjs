import { execFileSync } from "node:child_process";

const forbiddenPatterns = [
  /^dist\//,
  /(^|\/)\.DS_Store$/,
  /^accelprojects-dashboard-redesign\.png$/
];

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const forbiddenFiles = trackedFiles.filter((file) => forbiddenPatterns.some((pattern) => pattern.test(file)));

if (forbiddenFiles.length > 0) {
  console.error("Forbidden generated or unrelated files are tracked:");
  for (const file of forbiddenFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("Committed-file guard passed.");
