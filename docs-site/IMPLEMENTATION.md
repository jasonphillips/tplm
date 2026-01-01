# TPLm Documentation Site Implementation

This document describes the implementation of the TPLm documentation site.

## Overview

The docs site is a modern, interactive documentation experience built with VitePress that includes:
- Full documentation with sidebar navigation
- Interactive playground embedded in every example
- WASM-powered execution (DuckDB + Malloy) running entirely in the browser
- Responsive design optimized for learning and exploration

## Architecture

### Tech Stack

- **VitePress** (v1.0) - Static site generator with Vue 3
- **Vue 3** - Component framework for interactive elements
- **DuckDB WASM** - In-browser SQL execution
- **Malloy** - Query language runtime
- **TypeScript** - Type-safe development

### Key Components

#### 1. VitePress Configuration (`.vitepress/config.ts`)

Defines:
- Sidebar navigation with all example categories
- Top navigation bar
- Site metadata and theming
- Base URL for GitHub Pages deployment

#### 2. Custom Theme (`.vitepress/theme/`)

**`index.ts`** - Registers custom components globally:
```typescript
import Playground from './components/Playground.vue'
app.component('Playground', Playground)
```

**`custom.css`** - Custom styles for:
- TPL table rendering (inherited from playground-web)
- Hero section styling
- Code block enhancements
- Responsive layouts

#### 3. Playground Component (`components/Playground.vue`)

A Vue 3 component that provides an embedded TPLm editor and executor.

**Props:**
- `initialQuery` - Pre-populated TPL query
- `autoRun` - Execute query on mount
- `showTabs` - Display Table/Malloy/Data tabs
- `showTiming` - Show execution timing
- `editorRows` - Height of editor textarea
- `dataset` - Which dataset to use (default: 'samples')
- `label` - Label above editor

**Features:**
- Monaco-like code editing with syntax highlighting
- Real-time execution via DuckDB WASM
- Tabbed output (Table HTML / Generated Malloy / JSON Data)
- Keyboard shortcuts (Cmd/Ctrl + Enter to execute)
- Error handling and display
- Loading states

**Implementation:**
```vue
<Playground
  initial-query="TABLE ROWS occupation * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Example"
/>
```

#### 4. TPLm Executor (`utils/tpl-executor.ts`)

Singleton class that manages:
- DuckDB WASM connection initialization
- Dataset loading (CSV + Malloy schema)
- TPLm compilation pipeline
- Query execution
- Result caching

**Key Methods:**
```typescript
class TPLExecutor {
  async initialize()                    // Set up DuckDB + load datasets
  async execute(tpl, source)            // Full TPLm → HTML pipeline
  isReady()                             // Check if initialized
}
```

**Pipeline:**
1. Parse TPL → AST
2. Build TableSpec from AST
3. Generate QueryPlan (deduplicated)
4. Generate Malloy queries
5. Execute via Malloy runtime
6. Build GridSpec from results
7. Render to HTML

### Directory Structure

```
docs-site/
├── .vitepress/
│   ├── config.ts              # VitePress config
│   └── theme/
│       ├── index.ts           # Theme entry point
│       ├── custom.css         # Custom styles
│       └── components/
│           └── Playground.vue # Interactive playground
│
├── utils/
│   └── tpl-executor.ts        # TPL execution engine
│
├── public/
│   └── data/
│       ├── samples.csv        # Sample dataset
│       └── samples.malloy     # Malloy schema
│
├── index.md                   # Home page (hero + features)
├── playground.md              # Full playground page
│
├── getting-started/
│   └── quick-start.md         # Installation and basics
│
├── syntax/
│   └── overview.md            # Complete syntax reference
│
└── examples/                  # Categorized examples
    ├── core/                  # Nesting, concatenation, aggregates
    ├── totals/                # Row/column totals
    ├── limits/                # Top N, ordering
    ├── percentages/           # ACROSS calculations
    ├── labels/                # Custom labels
    ├── formatting/            # Number formats
    ├── filters/               # WHERE clauses
    └── advanced/              # Complex patterns
```

## Example Page Template

Each example follows a consistent structure:

```markdown
# Feature Name

Brief description of what this feature does.

## Interactive Example

<Playground
  initial-query="TPL QUERY HERE"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="3"
  label="Try It"
/>

## How It Works

Explanation of the syntax and behavior.

## Try Variations

Alternative examples and edge cases.

## Key Takeaways

- Bullet points summarizing important concepts

## Next Steps

- Links to related examples
```

## Deployment

### GitHub Actions Workflow

The site deploys automatically to GitHub Pages via `.github/workflows/deploy-docs.yml`:

1. **Build TPL packages** - Ensures latest compiler/renderer
2. **Build docs site** - VitePress static build
3. **Build playground** - Standalone playground app
4. **Combine builds** - Merge into single dist folder
5. **Deploy to GitHub Pages** - Upload and publish

### Manual Build

```bash
# From docs-site/
npm run docs:build    # → .vitepress/dist/
```

### Local Development

```bash
npm run docs:dev      # → http://localhost:5173
```

Hot module replacement and fast refresh included.

## Data Flow

### Page Load
```
User visits page
  ↓
VitePress loads static HTML
  ↓
Vue hydration
  ↓
Playground component mounts
  ↓
(if autoRun) → Initialize executor → Load dataset → Execute query
```

### Query Execution
```
User clicks "Run"
  ↓
Playground.execute()
  ↓
tpl-executor.execute(query, source)
  ↓
Parse → Compile → Generate Malloy
  ↓
Execute via Malloy + DuckDB WASM
  ↓
Build GridSpec → Render HTML
  ↓
Display in playground
```

## Performance Considerations

### First Load
- VitePress bundle: ~100KB (gzipped)
- DuckDB WASM: ~2MB (loaded lazily)
- First execution: 1-2 seconds (WASM init + dataset load)

### Subsequent Executions
- Parsing: <10ms
- Compilation: 10-50ms
- Execution: 20-100ms (depends on query complexity)
- Rendering: <10ms

### Optimizations
- Lazy loading of DuckDB WASM (only when playground used)
- Singleton executor (one instance across all playgrounds)
- Cached connections and datasets
- Static site generation (no server required)

## Browser Compatibility

**Requirements:**
- WebAssembly support
- SharedArrayBuffer (for DuckDB WASM threading)
- Modern JavaScript (ES2020+)

**Supported:**
- Chrome/Edge 92+
- Firefox 100+
- Safari 15.2+

**Not supported:**
- Internet Explorer
- Older mobile browsers
- Browsers with disabled WebAssembly

## Development Workflow

### Adding a New Example

1. Create markdown file in appropriate category:
   ```bash
   touch docs-site/examples/core/new-feature.md
   ```

2. Write example with playground:
   ```markdown
   # New Feature

   Description here.

   <Playground
     initial-query="TABLE ROWS ..."
     :auto-run="true"
     label="Example"
   />
   ```

3. Add to sidebar in `config.ts`:
   ```typescript
   {
     text: 'Core Concepts',
     items: [
       { text: 'New Feature', link: '/examples/core/new-feature' }
     ]
   }
   ```

4. Test locally:
   ```bash
   npm run docs:dev
   ```

### Converting from public_docs

Use the conversion script:

```bash
npx tsx scripts/convert-examples.ts
```

This automatically:
- Extracts TPL queries from code blocks
- Wraps them in Playground components
- Adds standard structure (title, description, variations)
- Generates related links

Review and enhance the generated files.

## Design Decisions

### Why VitePress?

- **Fast** - Vite-powered dev server and build
- **Markdown-first** - Easy content authoring
- **Vue 3** - Great for interactive components
- **SSG** - Excellent for documentation sites
- **GitHub Pages friendly** - Static export

### Why Embedded Playgrounds?

- **Learn by doing** - Users can modify examples immediately
- **No setup required** - Runs in the browser
- **Consistent UX** - Same playground on every page
- **Progressive enhancement** - Works without JS (shows static code)

### Why DuckDB WASM?

- **No backend needed** - Fully client-side
- **Fast** - Native-speed SQL execution
- **Standard SQL** - Familiar for users
- **Malloy compatible** - Direct integration

### Why Singleton Executor?

- **Performance** - Avoid re-initializing DuckDB
- **State management** - Share connections across playgrounds
- **Memory efficiency** - One dataset in memory

## Maintenance

### Updating Examples

Examples live in `docs-site/examples/`. Update markdown files directly.

### Updating TPLm Core

When TPLm syntax or behavior changes:
1. Update `packages/` code
2. Run `npm run build` from root
3. Update example queries if needed
4. Update syntax docs in `docs-site/syntax/`
5. Test in playground

### Updating Styles

Global styles: `docs-site/.vitepress/theme/custom.css`
Component styles: `docs-site/.vitepress/theme/components/Playground.vue` (scoped)

### Adding New Categories

1. Create directory: `mkdir docs-site/examples/new-category`
2. Add examples
3. Update sidebar in `.vitepress/config.ts`

## Troubleshooting

### Playground not working

**Check:**
- Browser supports WebAssembly
- Data files in `/public/data/`
- DuckDB WASM loaded (check Network tab)
- Console errors

### Build failing

**Check:**
- TPL packages built (`npm run build` from root)
- Dependencies installed (`npm ci` in docs-site)
- Node version (18+ required)

### Slow development server

- First load initializes WASM (expected)
- Subsequent loads should be fast
- HMR should work instantly

## Future Enhancements

- **Dataset selector in embedded playgrounds** - Let users switch datasets
- **Share links** - Generate URLs with encoded queries
- **Query history** - Remember recent queries
- **Syntax highlighting** - Monaco editor integration
- **Auto-complete** - Suggest dimensions/measures
- **Error highlighting** - Show parse errors inline
- **Export results** - Download CSV/JSON
- **Dark mode** - Theme switching

## Credits

Built by expanding the existing TPLm playground into a full documentation site with VitePress.

**Technologies:**
- VitePress by Evan You and the Vue team
- DuckDB WASM by DuckDB Labs
- Malloy by Google
- TPLm - Table Producing Language for Malloy
