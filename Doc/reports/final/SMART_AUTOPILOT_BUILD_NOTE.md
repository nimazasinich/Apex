# Build note

This source package intentionally excludes the previously stale `dist/` bundle.
The source implementation and dependency-independent QA passed, but the current sandbox registry could not install fresh Vite/Vitest dependencies.

On a machine with a healthy npm registry run:

```bash
npm ci
npm run verify
npm run build
```

Then perform the final 1368×753 browser screenshot pass against the fresh bundle.
