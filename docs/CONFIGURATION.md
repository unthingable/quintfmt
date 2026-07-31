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

## `.quintfmt.conf` files

`quintfmt` searches from the current working directory upward for a file named
`.quintfmt.conf`. The file uses a strict HOCON subset, and its settings apply to every input in that
invocation. Use `--config path/to/file` to select a file explicitly, or
`--no-config` to ignore discovery.

```hocon
indentWidth = 2
maxLineLength = 100

alignment {
  mode = local
  maxPadding = 16
  records = local
  recordMaxPadding = unlimited
  clauses = operator
}

declarations {
  alignment = types
}

definitions {
  spacing = nontrivial
}

blankLines.policy = preserve
lineEnding = preserve
```

The supported HOCON surface is deliberately small: comments, unquoted or quoted
scalar values, nested objects, `=`/`:` assignments, and dotted keys. Includes,
substitutions, arrays, and object merging are not supported. Unknown keys,
malformed configuration, and invalid values are errors. This is
intentional: a typo must never silently change—or fail to change—a repository's
formatting policy.

## What is configurable today

The public API accepts these options:

```ts
format(source, {
  indentWidth: 2,
  maxLineLength: 100,
  alignment: "local",
  declarationAlignment: "types",
  maxAlignmentPadding: 16,
  recordMaxAlignmentPadding: "unlimited",
  definitionSpacing: "nontrivial",
  recordAlignment: "local",
  clauseAlignment: "operator",
  blankLinePolicy: "preserve",
  lineEnding: "preserve",
})
```

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `indentWidth` | positive integer | `2` | Spaces used for block indentation. |
| `maxLineLength` | positive integer | `100` | Target width for supported wrapping. Long definition parameter lists and comment-free multi-argument calls in multiline match arms wrap one item per line. Indivisible tokens and expressions may exceed it. |
| `alignment` | `local`, `off` | `local` | Enables or disables all local alignment. |
| `declarationAlignment` | `types`, `columns`, `off` | `types` | Controls alignment within consecutive `const`/`var` groups. |
| `recordAlignment` | `local`, `off` | `local` | Controls local alignment of record fields and values. |
| `recordMaxAlignmentPadding` | positive integer, `unlimited` | `unlimited` | Maximum record-field padding. With a finite cap, oversize labels extend right while the ordinary fields stay aligned. |
| `clauseAlignment` | `off`, `operator`, `full` | `operator` | Controls layout and alignment of compatible action and Boolean clauses. `full` also aligns an unbarred first multiline sum-type variant with its `|`-prefixed siblings. |
| `maxAlignmentPadding` | positive integer | `16` | Maximum spaces added before a column. The formatter splits a local group rather than creating an excessive gap. |
| `definitionSpacing` | `nontrivial`, `compact` | `nontrivial` | Adds one blank line after a comment-led, trailing-comment, or multiline module-level definition. |
| `blankLinePolicy` | `preserve`, `single` | `preserve` | Preserves authored runs of blank lines, or normalizes each run to one line. |
| `lineEnding` | `preserve`, `lf`, `crlf` | `preserve` | Keeps the source's line ending, or emits the selected ending. |

The CLI currently exposes declaration alignment:

```sh
quintfmt --declaration-alignment types Spec.qnt
quintfmt --max-line-length 100 Spec.qnt
quintfmt --declaration-alignment columns Spec.qnt
quintfmt --declaration-alignment off Spec.qnt
quintfmt --definition-spacing compact Spec.qnt
quintfmt --record-alignment off Spec.qnt
quintfmt --record-max-padding unlimited Spec.qnt
quintfmt --clause-alignment full Spec.qnt
quintfmt --blank-lines single Spec.qnt
quintfmt --line-ending lf Spec.qnt
quintfmt --config .quintfmt.conf Spec.qnt
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
indentation level, or nested layout. Declaration and `operator` clause rows
split at the configured generic padding cap. `full` aligns an entire compatible
Boolean chain, including its head. Records default to unlimited alignment; with
a finite record cap, long labels extend right while the remaining fields retain
a shared value column.

## Clause alignment

`operator` is the default. It keeps ordinary continuation indentation and
aligns compatible relational operators. `off` keeps ordinary spacing without
vertical clause alignment. `full` uses operator-led layout for a multiline
Boolean definition: the first operand aligns after `and ` or `or `, and the
relational operators share one column.

```quint
val witness =
      observation.phase == OutcomeRecorded
  and state.live        == SciDriftedSnapshot
```

## Definition spacing

`nontrivial` is the default. It gives a comment-led, trailing-comment, or
multiline module-level `val`, `def`, `action`, `temporal`, or `nondet`
definition a blank line after it. A comment followed by a contiguous run of
simple definitions of the same kind introduces that whole run, so its separator
appears after the run rather than after the first definition. Comments otherwise
attach to the following definition:

```quint
// Current state observation.
val observation = observe(state.row)

// Safety property.
val AtMostOneKnownEffect = observation.knownEffects.size() <= 1
```

`compact` preserves dense adjacent definitions. Use it when a repository
prefers blank lines only where authors placed them.

## Blank lines and line endings

`blankLinePolicy: preserve` is the default: authored section spacing remains
intact, while `definitionSpacing` adds only its own intentional separators.
Use `single` for a fully compact profile that reduces each blank-line run to one.

`lineEnding: preserve` retains LF or CRLF from the source. Choose `lf` or
`crlf` when a repository needs one portable, explicit convention.

## Non-options

Some behavior should remain fixed because configurability would weaken the
formatter's safety or make repositories noisy:

- Invalid source fails without output; there is no best-effort rewrite mode.
- Block comments are verbatim layout barriers.
- Comments are neither reflowed nor rewritten.
- Imports and declarations are never sorted.
- Alignment is bounded and local, never a file-wide table.
- Line wrapping, range formatting, and editor integration are not part of the
  initial formatter slice.

## Adding an option

An option belongs in `quintfmt` only when it has all of these properties:

1. it represents a genuine team-level readability choice;
2. it has deterministic, idempotent behavior;
3. it can be documented with a small before/after example;
4. it does not require changing token or comment text;
5. its interaction with the existing options is simple enough to test.

New options must be added to this manual, the public API, CLI help when
applicable, and golden/idempotence tests before becoming a supported setting.
