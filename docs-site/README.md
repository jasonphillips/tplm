# TPLm Documentation Site

This is the documentation site for TPLm (Table Producing Language for Malloy), built with [VitePress](https://vitepress.dev/).

## Features

- **Interactive Playground**: Every example includes an embedded playground for hands-on experimentation
- **Comprehensive Examples**: Categorized examples covering all TPLm features
- **Syntax Reference**: Complete language reference with live demos
- **Fast & Modern**: Built with VitePress for optimal performance
- **WASM-Powered**: Runs DuckDB entirely in the browser via WebAssembly

## Development

### Prerequisites

- Node.js 18+ and npm
- Build the main TPLm packages first

### Setup

```bash
# From the root tplm directory, build packages
npm run build

# Install docs dependencies
cd docs-site
npm install
```

### Local Development

```bash
npm run docs:dev
```

This starts a local development server at `http://localhost:5173` with:
- Hot module replacement
- Fast refresh
- Live playground execution

### Build

```bash
npm run docs:build
```

Builds static files to `.vitepress/dist`.

### Preview Build

```bash
npm run docs:preview
```

Preview the built site locally before deployment.

## Structure

```
docs-site/
├── .vitepress/
│   ├── config.ts              # VitePress configuration & sidebar
│   ├── theme/
│   │   ├── index.ts           # Custom theme
│   │   ├── custom.css         # Custom styles
│   │   └── components/
│   │       └── Playground.vue # Interactive playground component
│
├── utils/
│   └── tpl-executor.ts        # TPLm execution engine for playground
│
├── public/
│   └── data/                  # Sample datasets (CSV + Malloy)
│
├── index.md                   # Home page
├── playground.md              # Full playground page
├── getting-started/
│   └── quick-start.md
├── syntax/
│   └── overview.md
└── examples/
    ├── core/                  # Basic concepts
    ├── totals/                # Row/column totals
    ├── limits/                # Top N and ordering
    ├── percentages/           # ACROSS percentages
    ├── labels/                # Custom labels
    ├── formatting/            # Number formats
    ├── filters/               # WHERE clauses
    └── advanced/              # Complex patterns
```

## Adding Examples

### Create a New Example

1. Create a markdown file in the appropriate category:
   ```bash
   touch examples/core/my-example.md
   ```

2. Add the example content with embedded playground:
   ```markdown
   # My Example

   Description of what this example demonstrates.

   <Playground
     initial-query="TABLE ROWS occupation * income.sum;"
     :auto-run="true"
     :show-tabs="true"
     :editor-rows="2"
     label="Example Name"
   />

   ## Explanation

   Details about how it works...
   ```

3. Add to sidebar in `.vitepress/config.ts`:
   ```typescript
   {
     text: 'Core Concepts',
     items: [
       { text: 'My Example', link: '/examples/core/my-example' }
     ]
   }
   ```

### Playground Component Props

```vue
<Playground
  :initial-query="string"    // TPL query
  :auto-run="boolean"        // Run on mount
  :show-tabs="boolean"       // Show Table/Malloy/Data tabs
  :show-timing="boolean"     // Show timing info
  :show-dataset="boolean"    // Show dataset info
  :editor-rows="number"      // Textarea rows
  :dataset="string"          // Dataset name (default: 'samples')
  label="string"             // Label above editor
/>
```

## Deployment

The site is automatically deployed to GitHub Pages on push to `main` via GitHub Actions.

### Manual Deployment

```bash
# Build the site
npm run docs:build

# The static files are in .vitepress/dist
# Deploy to your hosting provider
```

### GitHub Pages Configuration

1. Enable GitHub Pages in repository settings
2. Set source to "GitHub Actions"
3. The workflow in `.github/workflows/deploy-docs.yml` handles the rest

## Dataset

The playground uses a sample employment survey dataset (`samples`) with:

- **Dimensions**: occupation, education, gender, custtype, size
- **Measures**: income, record_count

Files:
- `/public/data/samples.csv` - Raw data
- `/public/data/samples.malloy` - Malloy schema

## Troubleshooting

### Playground not loading

- Ensure sample data files are in `/public/data/`
- Check browser console for errors
- DuckDB WASM requires certain browser features (WebAssembly, SharedArrayBuffer)

### Build fails

- Ensure main TPLm packages are built: `npm run build` from root
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### Dev server slow

- VitePress uses Vite's dev server which should be fast
- First load initializes DuckDB WASM (one-time ~1-2 seconds)
- Subsequent playground executions are fast

## Technologies

- **VitePress** - Static site generator
- **Vue 3** - Component framework for playground
- **DuckDB WASM** - In-browser SQL execution
- **Malloy** - Query language runtime
- **TPLm** - Table Producing Language for Malloy

## License

MIT
