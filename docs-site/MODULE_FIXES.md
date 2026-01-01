# Module Format Fixes - RESOLVED ✅

## Problem
The "exports is not defined" error in dev mode was caused by module format mismatches when importing TPL packages into the browser-based VitePress documentation site.

## Root Cause
1. Direct relative imports (`../../packages/parser/index.js`) weren't being handled correctly by Vite
2. Missing Vite aliases that the playground-web uses
3. Missing global polyfills for `process` and `global` that Malloy requires

## Solution

### 1. Added Vite Aliases (matching playground-web)
```typescript
resolve: {
  alias: {
    '@tpl/parser': resolve(__dirname, '../../packages/parser'),
    '@tpl/compiler': resolve(__dirname, '../../packages/compiler'),
    '@tpl/renderer': resolve(__dirname, '../../packages/renderer'),
  }
}
```

### 2. Updated Executor Imports
Changed from:
```typescript
import { parse } from '../../packages/parser/index.js'
import { buildTableSpec } from '../../packages/compiler/table-spec-builder.js'
// ...etc
```

To:
```typescript
import { parse } from '@tpl/parser'
import { buildTableSpec, generateQueryPlan, generateMalloyQueries, buildGridSpec } from '@tpl/compiler'
import { renderGridToHTML } from '@tpl/renderer'
```

### 3. Added Global Polyfills
```typescript
define: {
  'process.env': {},
  'global': 'globalThis'
},
optimizeDeps: {
  esbuildOptions: {
    define: {
      global: 'globalThis'
    }
  }
}
```

## Files Modified
- [config.ts](.vitepress/config.ts#L136-L168) - Added aliases, polyfills, optimizations
- [tpl-executor.ts](utils/tpl-executor.ts#L6-L9) - Updated imports to use aliases

## Testing
✅ Dev mode works: `npm run docs:dev`
✅ Build works: `npm run docs:build`
✅ No "exports is not defined" error
✅ No Node.js dependency errors

## Remaining Tasks
1. Create missing example pages (19 dead links currently ignored via `ignoreDeadLinks: true`)
2. Test playground functionality in browser
3. Deploy to GitHub Pages

## Missing Example Pages
The following pages are referenced but don't exist yet:
- `/examples/advanced/measure-binding`
- `/examples/advanced/deep-hierarchy`
- `/examples/core/column-nesting`
- `/examples/core/row-concat`
- `/examples/core/multiple-aggregates`
- `/examples/totals/column-total`
- `/examples/totals/subtotals`
- `/examples/totals/full-marginals`
- `/examples/formatting/integer-format`
- `/examples/formatting/decimal-format`
- `/examples/formatting/multiple-formats`
- `/examples/limits/nested-limits`
- `/examples/limits/order-by-value`
- `/examples/limits/order-by-different-aggregate`
- `/examples/percentages/column-percentages`
- `/examples/percentages/cell-percentage`
- `/examples/percentages/value-and-percentage`

Once these pages are created, remove the `ignoreDeadLinks: true` setting from [config.ts](.vitepress/config.ts#L11).

## Success!
The documentation site now builds and runs successfully! 🎉
