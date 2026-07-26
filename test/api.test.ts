import assert from "node:assert/strict";
import test from "node:test";
import { format } from "../src/api.js";

test("aligns local declarations without changing comments", () => {
  const source = `module Demo {\nvar owner:str\nconst maxAttempts :int\n// barrier\nvar x: int\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.formatted, `module Demo {\n  var owner:         str\n  const maxAttempts: int\n  // barrier\n  var x: int\n}\n`);
});

test("keeps declaration colons attached while aligning local type values", () => {
  const source = `module Demo {\nconst maxAttempts:int\nvar owner:str\nvar phase:Phase\ndef retryAllowed(s):bool=s.retries<maxAttempts\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /const maxAttempts: int/);
  assert.match(result.formatted, /var owner:\s+str/);
  assert.match(result.formatted, /var phase:\s+Phase/);
  assert.match(result.formatted, /def retryAllowed\(s\): bool = s\.retries < maxAttempts/);
});

test("offers columns and off declaration alignment modes", () => {
  const source = `module Demo {\nconst maximum:int\nvar x:int\n}\n`;
  const columns = format(source, { declarationAlignment: "columns" });
  const off = format(source, { declarationAlignment: "off" });
  assert.equal(columns.ok, true);
  assert.equal(off.ok, true);
  if (!columns.ok || !off.ok) return;
  assert.match(columns.formatted, /var   x:/);
  assert.match(off.formatted, /const maximum: int\n  var x: int/);
});

test("aligns record fields and action relations locally", () => {
  const source = `module Demo {\nval request={\nid:requestId,\nretries:retryCount,\n}\naction step=all {\nowner'=nextOwner,\nretries'=retries+1,\n}\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /id      : requestId,/);
  assert.match(result.formatted, /retries : retryCount/);
  assert.match(result.formatted, /owner'\s+= nextOwner,/);
  assert.match(result.formatted, /retries'\s+= retries \+ 1,/);
});

test("is idempotent and rejects malformed Quint without output", () => {
  const source = `module Demo {\nvar a:int\nvar longer:int\n}\n`;
  const first = format(source);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = format(first.formatted);
  assert.deepEqual(second, first);
  const invalid = format("module {");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.formatted, null);
});

test("preserves inline and block-comment bodies at their token boundaries", () => {
  const source = `module Demo {\nvar alpha:int // keep this\n/* keep\n  this exact body */\nvar beta:int\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /var alpha: int  \/\/ keep this/);
  assert.match(result.formatted, /\/\* keep\n  this exact body \*\//);
  assert.deepEqual(format(result.formatted), result);
});

test("keeps a multiline block comment and code on its closing line verbatim", () => {
  const source = `module Demo {\n/* keep\n  this exact body */ var beta:int\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\/\* keep\n  this exact body \*\/ var beta:int/);
  assert.deepEqual(format(result.formatted), result);
});

test("preserves an inline-started multiline comment before later code", () => {
  const source = `module Demo {\nval x = 1 /* keep\n  exact */ + 2\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /val x = 1 \/\* keep\n  exact \*\/ \+ 2/);
  assert.deepEqual(format(result.formatted), result);
});

test("does not move an inline block comment across significant tokens", () => {
  const source = `module Demo {\nval x = 1 /* explains one */ + 2\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /1 \/\* explains one \*\/ \+ 2/);
});

test("keeps comment trailing whitespace when the line is a comment barrier", () => {
  const source = `module Demo {\n/* keep two spaces  \n  body */\n// keep three   \n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /\/\* keep two spaces  \n  body \*\//);
  assert.match(result.formatted, /  \/\/ keep three   \n/);
});

test("rejects valid Quint outside the implemented formatter slice", () => {
  const result = format(`module Demo {\ndef f(x) = match x { | _ => 0 }\n}\n`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostics[0]?.code, "QFMT_UNSUPPORTED");
});

test("keeps nested action assignments in their own alignment island", () => {
  const source = `module Demo {\naction extraordinarilyLongStep=all {\nx'=1,\nlonger'=2,\n}\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.formatted, /x'\s+= 1,/);
  assert.match(result.formatted, /longer'\s+= 2,/);
});

test("rejects lexical errors instead of producing best-effort output", () => {
  const result = format("module Demo { var value: int @ }");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.formatted, null);
});
