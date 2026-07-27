<!-- provenance: agent-authored; created: 2026-07-27 -->
# Configuration and style

`quintfmt` aims for the useful part of the `scalafmt` model: one stable,
deterministic style; a small number of meaningful layout choices; and a clear
contract for every option. It is deliberately not a general layout engine or a
catalogue of knobs for every grammar production.

The formatter's priority order is:

1. preserve valid Quint source and comment text;
2. produce idempotent output;
3. make local structure easy to scan;
4. permit a few team-level visual preferences without making style unstable.

## `.quintfmt` files

`quintfmt` searches from the current working directory upward for a file named
`.quintfmt`. The file is JSON, and its settings apply to every input in that
invocation. Use `--config path/to/file` to select a file explicitly, or
`--no-config` to ignore discovery.

```json
{
  "indentWidth": 2,
  "alignment": "local",
  "declarationAlignment": "types",
  "maxAlignmentPadding": 12
}
```

Unknown keys, malformed JSON, and invalid values are errors. This is
intentional: a typo must never silently change—or fail to change—a repository's
formatting policy.

## What is configurable today

The public API accepts these options:

```ts
format(source, {
  indentWidth: 2,
  alignment: "local",
  declarationAlignment: "types",
  maxAlignmentPadding: 12,
})
```

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `indentWidth` | positive integer | `2` | Spaces used for block indentation. |
| `alignment` | `local`, `off` | `local` | Enables or disables all local alignment. |
| `declarationAlignment` | `types`, `columns`, `off` | `types` | Controls alignment within consecutive `const`/`var` groups. |
| `maxAlignmentPadding` | positive integer | `12` | Maximum spaces added before a column. The formatter splits or leaves a local group unaligned rather than creating an excessive gap. |

The CLI currently exposes declaration alignment:

```sh
quintfmt --declaration-alignment types Spec.qnt
quintfmt --declaration-alignment columns Spec.qnt
quintfmt --declaration-alignment off Spec.qnt
quintfmt --config .quintfmt Spec.qnt
quintfmt --no-config Spec.qnt
```

## Declaration alignment

`types` is the default. It keeps declaration keywords natural, keeps `:`
attached to the name, and aligns the type values:

```quint
const maxAttempts: int
var owner:         str
var phase:         Phase
```

`columns` makes the complete declaration grid explicit:

```quint
const maxAttempts: int
var   owner:       str
var   phase:       Phase
```

`off` applies ordinary spacing only:

```quint
const maxAttempts: int
var owner: str
var phase: Phase
```

Alignment is local. It never crosses a blank line, comment, different
indentation level, nested layout, or the configured padding cap.

## Blank lines and declaration grouping

This is the next intended style dimension; it is **not implemented yet**.
The proposed option is:

```ts
declarationSpacing: "compact" | "groups" | "declarations"
```

| Proposed value | Intended effect |
| --- | --- |
| `compact` | Preserve the current compact layout, normalizing repeated blank lines to one. |
| `groups` | Keep small, tightly parallel declaration groups together; separate groups and comment-led declarations with one blank line. |
| `declarations` | Give each top-level short declaration its own visual unit. Comments remain attached to the declaration below them. |

`groups` is the likely default once implemented. It matches typical Quint
specifications: related predicates stay together, while witness explanations,
actions, invariants, and temporal properties become visibly distinct sections.

## Non-options

Some behavior should remain fixed because configurability would weaken the
formatter's safety or make repositories noisy:

- Invalid or unsupported source fails without output; there is no best-effort
  rewrite mode.
- Block comments are verbatim layout barriers.
- Comments are neither reflowed nor rewritten.
- Imports and declarations are never sorted.
- Alignment is bounded and local, never a file-wide table.
- Line wrapping, range formatting, editor integration, and configuration-file
  discovery are not part of the initial formatter slice.

## Adding an option

An option belongs in `quintfmt` only when it has all of these properties:

1. it represents a genuine team-level readability choice;
2. it has deterministic, idempotent behavior;
3. it can be documented with a small before/after example;
4. it does not require changing token or comment text;
5. its interaction with the existing options is simple enough to test.

New options must be added to this manual, the public API, CLI help when
applicable, and golden/idempotence tests before becoming a supported setting.
