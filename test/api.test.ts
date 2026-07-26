import assert from "node:assert/strict";
import test from "node:test";
import { format } from "../src/api.js";

test("aligns local declarations without changing comments", () => {
  const source = `module Demo {\nvar owner:str\nconst maxAttempts :int\n// barrier\nvar x: int\n}\n`;
  const result = format(source);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.formatted, `module Demo {\n  var owner       : str\n  const maxAttempts : int\n  // barrier\n  var x: int\n}\n`);
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

test("rejects lexical errors instead of producing best-effort output", () => {
  const result = format("module Demo { var value: int @ }");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.formatted, null);
});
