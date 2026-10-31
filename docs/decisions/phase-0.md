# Phase 0 decisions

- One `uv.lock` for Python services and one `package-lock.json` for the web app;
  CI and containers install frozen dependencies.
- The web lockfile overrides vulnerable transitive `minimatch` and `compression`
  versions; keep the overrides under review when upgrading their parents.
- Both Python Docker images currently install the shared runtime dependencies,
  trading image size for a single reproducible lockfile. Revisit only if needed.
- The frontend is a static placeholder, not a simulated request workspace.
- No Alembic migrations are created until there is a Phase 1 schema to migrate.
