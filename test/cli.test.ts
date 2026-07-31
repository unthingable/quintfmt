import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = join(process.cwd(), "dist", "src", "cli.js");

test("in-place formatting refuses a symbolic link without changing its target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quintfmt-cli-"));
  const target = join(directory, "target.qnt");
  const link = join(directory, "link.qnt");
  const source = "module Demo {\nvar x:int\n}\n";
  await writeFile(target, source, "utf8");
  await symlink(target, link);
  const result = spawnSync(process.execPath, [cli, link], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /QFMT_SYMLINK/);
  assert.equal(await readFile(target, "utf8"), source);
});

test("in-place formatting validates every file before replacing any file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quintfmt-cli-"));
  const valid = join(directory, "valid.qnt");
  const invalid = join(directory, "invalid.qnt");
  const source = "module Demo {\nvar x:int\n}\n";
  await writeFile(valid, source, "utf8");
  await writeFile(invalid, "module {", "utf8");
  const result = spawnSync(process.execPath, [cli, valid, invalid], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(await readFile(valid, "utf8"), source);
});

test("reports named-file I/O failures without a Node stack trace", () => {
  const missing = join(tmpdir(), `quintfmt-missing-${process.pid}.qnt`);
  const result = spawnSync(process.execPath, [cli, missing], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, new RegExp(`${missing}: QFMT_IO:`));
  assert.doesNotMatch(result.stderr, /node:internal\/fs/);
});

test("discovers .quintfmt.conf and lets --no-config bypass it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quintfmt-config-"));
  const file = join(directory, "Demo.qnt");
  await writeFile(file, "module Demo {\nconst maximum:int\nvar x:int\n}\n", "utf8");
  await writeFile(join(directory, ".quintfmt.conf"), "declarations.alignment = columns\n", "utf8");
  const configured = spawnSync(process.execPath, [cli, "--stdout", file], { cwd: directory, encoding: "utf8" });
  const bypassed = spawnSync(process.execPath, [cli, "--stdout", "--no-config", file], { cwd: directory, encoding: "utf8" });
  assert.equal(configured.status, 0);
  assert.equal(bypassed.status, 0);
  assert.match(configured.stdout, /var   x:/);
  assert.match(bypassed.stdout, /var x:/);
});

test("formats named files in place by default and supports --stdout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quintfmt-cli-"));
  const file = join(directory, "Demo.qnt");
  const source = "module Demo {\nvar x:int\n}\n";
  await writeFile(file, source, "utf8");
  const preview = spawnSync(process.execPath, [cli, "--stdout", file], { encoding: "utf8" });
  assert.equal(preview.status, 0);
  assert.match(preview.stdout, /var x: int/);
  assert.equal(await readFile(file, "utf8"), source);
  const formatted = spawnSync(process.execPath, [cli, file], { encoding: "utf8" });
  assert.equal(formatted.status, 0);
  assert.equal(formatted.stdout, "");
  assert.match(await readFile(file, "utf8"), /var x: int/);
});

test("reports help and the package version", () => {
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  const version = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Named files are formatted in place by default/);
  assert.match(help.stdout, /--max-line-length <columns>/);
  assert.doesNotMatch(help.stdout, /\\n/);
  assert.equal(version.status, 0);
  assert.match(version.stdout, /^0\.2\.0\n$/);
});
