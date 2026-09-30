# Changelog

## 0.4.0

- Keep short single-line sum types inline in `full` clause mode; expand
  over-width declarations into one variant per line.
- Put alternatives in comment-free `any { ... }` and block `or { ... }`
  expressions on separate lines, with supported long calls wrapping to the
  configured line width.

## 0.2.0

- Wrap long multi-argument calls at a verified CST boundary inside multiline
  match arms, respecting `maxLineLength`.
- Break multiline definition match bodies after `=` while leaving one-line
  matches inline.
- Preserve match indentation across comment barriers.

## 0.1.0

- Initial release: comment-preserving Quint formatting, local alignment,
  `.quintfmt.conf` configuration, and an in-place CLI.
