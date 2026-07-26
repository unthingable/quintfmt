#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { format } from "./api.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--write") || args.includes("-w");
  const check = args.includes("--check");
  const files = args.filter((arg) => !arg.startsWith("-"));

  if (write && check) {
    console.error("quintfmt: --write and --check cannot be combined");
    process.exitCode = 2;
  } else if (!files.length) {
    process.stdin.setEncoding("utf8");
    let source = "";
    for await (const chunk of process.stdin) source += chunk;
    const result = format(source);
    if (!result.ok) {
      for (const diagnostic of result.diagnostics) console.error(`${diagnostic.line}:${diagnostic.column}: ${diagnostic.code}: ${diagnostic.message}`);
      process.exitCode = 2;
    } else {
      process.stdout.write(result.formatted);
    }
  } else {
    let changed = false;
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const result = format(source);
      if (!result.ok) {
        for (const diagnostic of result.diagnostics) console.error(`${file}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.code}: ${diagnostic.message}`);
        process.exitCode = 2;
        continue;
      }
      if (result.formatted !== source) changed = true;
      if (write && result.formatted !== source) await writeFile(file, result.formatted, "utf8");
      if (!write && !check) process.stdout.write(result.formatted);
    }
    if (check && changed && process.exitCode !== 2) process.exitCode = 1;
  }
}

void main();
