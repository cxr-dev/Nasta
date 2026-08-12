# Documentation

Use the short documents below as the current project reference. Git history contains earlier planning material; it is not part of the active documentation set.

## Current reference

- [Project overview and development](../README.md)
- [Architecture](ARCHITECTURE.md)
- [API and persistence](API.md)
- [Adding a data source](guides/adding-data-sources.md)
- [Design system](../DESIGN.md)
- [Product principles](../PRODUCT.md)
- [Image credits](../CREDITS.md)
- [Accepted ADRs](adr/)

## Working rules

- Verify behavior against `src/`, `vite.config.ts`, `package.json`, and `.github/workflows/` before updating documentation.
- Prefer links to source types and implementation over copied interfaces or line counts.
- Keep public docs concise. Put implementation history, rejected alternatives, and future ideas in Git history or an accepted ADR when they need to remain part of the current project record.
