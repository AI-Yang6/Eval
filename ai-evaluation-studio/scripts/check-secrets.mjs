import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const sensitivePath = /(^|\/)(\.env[^/]*|[^/]*\.(pem|key)|credentials?|secrets?|eval-studio-backup-[^/]*\.json)$/i;
const chars = "[A-Za-z0-9_-]";
const tokenChars = "[A-Za-z0-9._~+/-]";
const secretPatterns = [
  ["OpenAI-style key", new RegExp(`sk-${chars}{16,}`, "g")],
  ["Anthropic key", new RegExp(`sk-ant-${chars}{16,}`, "g")],
  ["Bearer token", new RegExp(`Bearer\\s+${tokenChars}{16,}`, "gi")],
  ["Volcano-style access key", new RegExp(`AK(?:LT|ID)[A-Za-z0-9]{12,}`, "g")],
  ["Google API key", new RegExp(`AIza${chars}{20,}`, "g")],
  ["GitHub token", new RegExp(`gh[pousr]_[A-Za-z0-9]{20,}`, "g")],
  [
    "Assigned API key",
    new RegExp(
      `(api[_-]?key|access[_-]?token|secret[_-]?key)\\s*[:=]\\s*["']${tokenChars}{20,}["']`,
      "gi"
    ),
  ],
];

const output = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" }
);
const files = output.split("\0").filter(Boolean);
const findings = [];

for (const file of files) {
  if (sensitivePath.test(file)) {
    findings.push(`${file}: sensitive file path`);
    continue;
  }
  if (file === "scripts/check-secrets.mjs" || file === "package-lock.json") continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${file}: ${label}`);
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found. Review before commit:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} tracked/untracked files checked).`);
