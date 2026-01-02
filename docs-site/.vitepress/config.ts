import { defineConfig } from "vitepress";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  title: "TPLm",
  description:
    "TPLm - Table Programming Language for Malloy. Declarative syntax for cross-tabulated tables.",
  base: "/tplm/",

  themeConfig: {
    logo: "📊",

    nav: [
      { text: "Home", link: "/" },
      { text: "Getting Started", link: "/getting-started/quick-start" },
      { text: "Syntax", link: "/syntax/overview" },
      { text: "Examples", link: "/examples/core/basic-crosstab" },
      { text: "Playground", link: "/playground" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        collapsed: false,
        items: [
          { text: "Quick Start", link: "/getting-started/quick-start" },
          { text: "Playground", link: "/playground" },
        ],
      },
      {
        text: "Syntax",
        collapsed: false,
        items: [{ text: "Overview", link: "/syntax/overview" }],
      },
      {
        text: "Core Concepts",
        collapsed: false,
        items: [
          { text: "Basic Crosstab", link: "/examples/core/basic-crosstab" },
          { text: "Row Nesting", link: "/examples/core/row-nesting" },
          { text: "Column Nesting", link: "/examples/core/column-nesting" },
          { text: "Row Concatenation", link: "/examples/core/row-concat" },
          {
            text: "Column Concatenation",
            link: "/examples/core/column-concat",
          },
          {
            text: "Multiple Aggregates",
            link: "/examples/core/multiple-aggregates",
          },
        ],
      },
      {
        text: "Totals",
        collapsed: true,
        items: [
          { text: "Row Total", link: "/examples/totals/row-total" },
          { text: "Column Total", link: "/examples/totals/column-total" },
          { text: "Labeled Totals", link: "/examples/totals/labeled-totals" },
          { text: "Subtotals", link: "/examples/totals/subtotals" },
          { text: "Full Marginals", link: "/examples/totals/full-marginals" },
        ],
      },
      {
        text: "Limits & Ordering",
        collapsed: true,
        items: [
          {
            text: "Alphabetic Limit",
            link: "/examples/limits/row-limit-alpha",
          },
          {
            text: "Reverse Alphabetic",
            link: "/examples/limits/row-limit-alpha-desc",
          },
          { text: "Top N by Value", link: "/examples/limits/limit-by-value" },
          { text: "Order by Value", link: "/examples/limits/order-by-value" },
          {
            text: "Order Ascending by Value",
            link: "/examples/limits/order-asc-by-value",
          },
          {
            text: "Order by Different Aggregate",
            link: "/examples/limits/order-by-different-aggregate",
          },
          {
            text: "Order by Underlying Code",
            link: "/examples/limits/order-by-code-column",
          },
          { text: "Nested Limits", link: "/examples/limits/nested-limits" },
          { text: "Column Limits", link: "/examples/limits/column-limits" },
        ],
      },
      {
        text: "Percentages",
        collapsed: true,
        items: [
          {
            text: "Cell Percentage",
            link: "/examples/percentages/cell-percentage",
          },
          {
            text: "Row Percentages",
            link: "/examples/percentages/row-percentages",
          },
          {
            text: "Column Percentages",
            link: "/examples/percentages/column-percentages",
          },
          {
            text: "Value and Percentage",
            link: "/examples/percentages/value-and-percentage",
          },
        ],
      },
      {
        text: "Labels",
        collapsed: true,
        items: [
          {
            text: "Dimension Labels",
            link: "/examples/labels/dimension-labels",
          },
          {
            text: "Aggregate Labels",
            link: "/examples/labels/aggregate-labels",
          },
          { text: "Total Labels", link: "/examples/labels/total-labels" },
        ],
      },
      {
        text: "Formatting",
        collapsed: true,
        items: [
          {
            text: "Currency Format",
            link: "/examples/formatting/currency-format",
          },
          {
            text: "Decimal Format",
            link: "/examples/formatting/decimal-format",
          },
          {
            text: "Integer Format",
            link: "/examples/formatting/integer-format",
          },
          { text: "Custom Format", link: "/examples/formatting/custom-format" },
          {
            text: "Multiple Formats",
            link: "/examples/formatting/multiple-formats",
          },
        ],
      },
      {
        text: "Filters",
        collapsed: true,
        items: [
          { text: "String Filter", link: "/examples/filters/string-filter" },
          { text: "Numeric Filter", link: "/examples/filters/numeric-filter" },
          {
            text: "Compound Filter",
            link: "/examples/filters/compound-filter",
          },
        ],
      },
      {
        text: "Advanced",
        collapsed: true,
        items: [
          {
            text: "Measure Binding",
            link: "/examples/advanced/measure-binding",
          },
          { text: "Deep Hierarchy", link: "/examples/advanced/deep-hierarchy" },
          {
            text: "Complex Crosstab",
            link: "/examples/advanced/complex-crosstab",
          },
          {
            text: "Concatenation with Totals",
            link: "/examples/advanced/concat-with-totals",
          },
        ],
      },
      {
        text: "Styling",
        collapsed: false,
        items: [{ text: "CSS Reference", link: "/styling/css-reference" }],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/jasonphillips/tplm" },
    ],

    footer: {
      message: "Powered by Malloy and DuckDB",
      copyright: "MIT Licensed",
    },
  },

  vite: {
    resolve: {
      alias: {
        "@tpl/parser": resolve(__dirname, "../../dist/parser/index.js"),
        "@tpl/compiler": resolve(__dirname, "../../dist/compiler/index.js"),
        "@tpl/renderer": resolve(__dirname, "../../dist/renderer/index.js"),
      },
    },
    optimizeDeps: {
      exclude: ["@duckdb/duckdb-wasm"],
      include: ["@malloydata/malloy"],
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    build: {
      target: "esnext",
      rollupOptions: {
        external: ["@mapbox/node-pre-gyp", "mock-aws-s3", "nock", "aws-sdk"],
      },
    },
    define: {
      "process.env": {},
      global: "globalThis",
    },
  },
});
