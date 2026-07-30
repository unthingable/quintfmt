# quintfmt

`quintfmt` formats Quint source into one stable, comment-preserving style. It
normalizes spacing and indentation, uses restrained local alignment, and fails
without output when the input is not valid for its pinned Quint grammar.

It is pre-1.0 software: use it to make supported Quint modules easier to scan,
then keep `--check` in CI to hold the chosen style.

## Before and after

```quint
// before
module Counter {
var count:int
action step=all {
count'=count+1,
}
}

// after
module Counter {
  var count: int
  action step = all {
    count' = count + 1,
  }
}
```

## Install and use

Requires Node.js 20 or 22.

> **Named files are formatted in place by default.** Preview safely with
> `--stdout`, or use `--check` in CI. With no file argument, `quintfmt` reads
> stdin and writes formatted source to stdout.

```sh
# No installation: preview output
npx quintfmt --stdout Spec.qnt

# Check whether a file already matches the style; exits 1 when it does not
npx quintfmt --check Spec.qnt

# Safe filter form; reads stdin and writes formatted source to stdout
cat Spec.qnt | npx quintfmt
```

Once the result looks right, format in place:

```sh
npx quintfmt Spec.qnt
```

For a project-local install:

```sh
npm install --save-dev quintfmt
npx quintfmt --check Spec.qnt
```

For a global command:

```sh
npm install --global quintfmt
quintfmt Spec.qnt
```

`--write` / `-w` are explicit aliases for the default in-place behavior. Run
`quintfmt --help` for the complete CLI reference.

## Style and configuration

The default style uses two-space indentation, aligns local declarations and
record fields, and separates nontrivial definitions. Record fields align to
their widest name by default; declaration and Boolean/action-clause alignment
remain locally bounded.

Declaration alignment keeps `:` attached to its name and aligns the type value:

```quint
const maxAttempts: int
var owner:         str
var phase:         Phase
```

Use a `.quintfmt.conf` file for team-level choices such as declaration columns,
record alignment, clause alignment, blank-line handling, and line endings. See
[Configuration and style](docs/CONFIGURATION.md), available both in the npm
package and the GitHub repository.

## API

The package supports both CommonJS and ESM imports.

```js
// ESM
import { format } from "quintfmt"

const result = format("module Demo { var owner:str }")
if (result.ok) console.log(result.formatted)
```

```js
// CommonJS
const { format } = require("quintfmt")
```

`format()` returns diagnostics and no formatted text when parsing or formatter
validation fails.

## Guarantees and limits

- Significant token text and order are preserved.
- Ordinary, documentation, and block-comment text is preserved.
- Formatting is idempotent.
- Invalid source produces diagnostics and no partial output.

The formatter wraps supported long definition parameter lists and comment-free
multi-argument calls in multiline match arms at the configured
`maxLineLength` (100 by default); it does not yet split arbitrary expressions.
It does not sort imports or declarations, reflow comments, or provide range/LSP
formatting. Multiline block comments are preserved verbatim and act as layout
barriers.

## Compatibility

`quintfmt` validates against the vendored Quint grammar snapshot from
[`quint-co/quint` commit `4e6a580`](vendor/quint/UPSTREAM.md). Quint evolves
independently, so compatibility is declared by that snapshot rather than by an
unbounded Quint version range.

## Development and releases

```sh
npm test
npm run check
```

`npm run check` additionally installs and exercises the packed npm artifact:
its CLI plus CommonJS and ESM entry points. See [CHANGELOG.md](CHANGELOG.md)
for release notes.

## License

MIT. The vendored Quint grammar remains subject to its Apache-2.0 license.
