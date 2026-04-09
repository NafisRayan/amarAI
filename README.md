# amarAI — UI Components Showcase (React + TypeScript + Vite)

This repository is a UI components demo and starter kit built with React, TypeScript, Vite and Tailwind. It contains a curated set of styled UI primitives (Radix-based + Tailwind + cva) and a single-page showcase application (src/App.tsx) demonstrating usage and variants.

Table of contents
- Quick start
- Project structure
- Development workflow (commands)
- Styling & theming
- Component patterns & conventions
- Add a new component (step-by-step)
- Troubleshooting common issues
- Contributing
- License

Quick start
Prerequisites
- Node 18+ recommended
- npm (or yarn/pnpm) installed

Install and run locally
```bash
# install
npm install

# development server with HMR
npm run dev

# build for production
npm run build

# preview production build locally
npm run preview
```

Project structure (important files)
- index.html — app HTML entry
- package.json — scripts & dependencies
- vite.config.ts — Vite config (path alias "@" -> ./src)
- tsconfig.app.json / tsconfig.json — TypeScript configuration (strict settings)
- tailwind.config.js, src/index.css — Tailwind setup and CSS variables
- src/main.tsx — React entry (mounts App)
- src/App.tsx — the demo/showcase page that composes and demonstrates components
- src/lib/utils.ts — small utilities (cn helper)
- src/hooks/use-theme.ts — theme management
- src/components/theme-toggle.tsx — UI for toggling theme
- src/components/ui/* — all UI primitives and components (Radix wrappers, styled primitives)

The `src/components/ui` folder contains the core building blocks. Each file typically wraps a Radix primitive or provides a small, styled component (Button, Card, Dialog, DropdownMenu, Toggle, Select, Tabs, etc.).

Development workflow & scripts
- npm run dev — start Vite dev server (HMR)
- npm run build — TypeScript project build + Vite production build (tsc -b && vite build)
- npm run preview — preview the production build
- npm run lint — run ESLint (if configured)

Type checking and linting
- TypeScript is strict by default (see tsconfig.app.json). Build runs `tsc -b` so type errors will fail the build.
- ESLint is present in devDependencies; extend or enable type-aware linting if you want stricter checks (see tsconfig paths for parserOptions.project).

Styling & theming
- Tailwind CSS is used for styles. Configuration: tailwind.config.js and src/index.css.
- CSS variables are declared in src/index.css and the `.dark` class flips variables for dark mode.
- Theme is toggled by `src/hooks/use-theme.ts` which adds `light` or `dark` (or system) to document.documentElement.
- The repo uses `clsx` + `tailwind-merge` via the `cn` helper (src/lib/utils.ts) to safely compose class names.

Component patterns & conventions
- Radix primitives: many components wrap @radix-ui primitives (e.g. Dialog, Popover, Toggle, DropdownMenu) to provide accessibility and behavior.
- Forward refs: components use React.forwardRef and set displayName.
- Variant styling: `class-variance-authority` (cva) is used for components that expose variants (Button, Toggle, etc.).
- Naming & exports: components export named parts, e.g. `export { Button, buttonVariants }` or compound components like `export { Card, CardHeader, CardContent }`.
- Utilities: use `cn(...)` to combine classes and `cva` for consistent variant definitions.

Example: create a button (pattern)
```tsx
// src/components/ui/button.tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva('inline-flex items-center', { /* variants */ })

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild=false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
})

Button.displayName = 'Button'
export { Button, buttonVariants }
```

How to add a new component (step-by-step)
1. Create a new file in `src/components/ui/`, e.g. `src/components/ui/my-component.tsx`.
2. Use Radix primitives when useful (install `@radix-ui/*` packages if needed).
3. Use `cn(...)` to compose classes. If exposing variants, use `cva`.
4. Use `React.forwardRef` and export named components (root + any subcomponents).
5. Add a small usage example to `src/App.tsx` if you want it visible in the showcase.
6. Run `npm run dev` and check behavior in the browser.

Import alias
- The project config adds `@` -> `./src` via vite.config.ts and tsconfig, so prefer imports like `import { Button } from '@/components/ui/button'`.

Common troubleshooting
- "Module does not provide an export named 'X'" — happens when App imports a named export that the module doesn't export. Fix by:
  1. Opening the component file (e.g. `src/components/ui/toggle.tsx`) and ensure `export { ToggleGroup }` is present.
  2. Restart the dev server (Vite sometimes needs a restart after changing module exports).

- TypeScript unused errors (noUnusedLocals/noUnusedParameters) — either remove the unused variables or disable the rule for a specific line with `// eslint-disable-next-line @typescript-eslint/no-unused-vars` (prefer fixing code).

- Large build bundles — Vite may warn about chunk sizes. Use code-splitting/dynamic import or manualChunks in vite.config if needed.

Developer recommendations & conventions
- Keep components small and focused; prefer composition over large monolithic components.
- Follow existing patterns in `src/components/ui/` for consistent API and styling.
- Use named exports for all components and any helper variant objects (e.g. buttonVariants) so the demo can import them directly.

Where to look for examples
- `src/App.tsx` — comprehensive examples of how to use each UI primitive and many common patterns (Button usage, Dialog, ToggleGroup, Command palette snippet, etc.). Use it as a living pattern library.
- `src/components/ui/*` — reference implementation for each primitive.

Contributing
- Fork the repo and open a PR with small, focused changes.
- Keep changes limited to feature scope and include a brief description and reasoning in the PR.
- If adding or changing public component APIs, prefer backward-compatible changes or document breaking changes clearly.

License
- This repository does not include a license file. If you'd like to open-source it, add a LICENSE file (MIT is common for UI starter kits).

Need help?
- If you want, I can:
  - Create a developer README or coding conventions file
  - Split `src/App.tsx` into modular demo pages
  - Add tests or Storybook for interactive component docs

Open an issue or ask in the repository if you'd like any of the above.
