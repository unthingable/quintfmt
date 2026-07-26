import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = join(process.cwd(), "dist", "src", "cli.js");

test("--write refuses a symbolic link without changing its target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quintfmt-cli-"));
  const target = join(directory, "target.qnt");
  const link = join(directory, "link.qnt");
  const source = "module Demo {\nvar x:int\n}\n";
  await writeFile(target, source, "utf8");
  await symlink(target, link);
  const result = spawnSync(process.execPath, [cli, "--write", link], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /QFMT_SYMLINK/);
  assert.equal(await readFile(target, "utf8"), source);
});

test("--write validates every file before replacing any file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quintfmt-cli-"));
  const valid = join(directory, "valid.qnt");
  const invalid = join(directory, "invalid.qnt");
  const source = "module Demo {\nvar x:int\n}\n";
  await writeFile(valid, source, "utf8");
  await writeFile(invalid, "module {", "utf8");
  const result = spawnSync(process.execPath, [cli, "--write", valid, invalid], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(await readFile(valid, "utf8"), source);
});
