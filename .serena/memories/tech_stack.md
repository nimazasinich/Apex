# Tech Stack

- Language: TypeScript ~5.8.2; ESM (`"type":"module"`). Typecheck = `tsc --noEmit` (the `lint` script).
- UI: React 19.2 + react-dom 19.2; icons lucide-react; charts recharts 3 + d3 7; animation `motion`; fonts @fontsource inter / jetbrains-mono.
- Styling: Tailwind CSS v4 (@tailwindcss/vite) + postcss + autoprefixer; plus hand-authored co-located CSS files (class prefix `apex-`).
- Build/dev: Vite 6 (@vitejs/plugin-react). Custom entrypoints run via tsx: dev = scripts/utilities/devWithFunctionIndex.mts; build = scripts/utilities/buildAndBundle.mts (bundles server → dist/server.cjs using esbuild 0.25).
- Server: Express 4 (`server.ts`). HTTP: undici; socks-proxy-agent for proxied fetch.
- Tests: Vitest 4. Browser/geometry/screenshots: Playwright 1.61. Import-cycle check: madge 8.
- HF integration: @huggingface/hub.
- Package manager: npm 10.9.2 (lockfile committed). Script runner: tsx 4.
