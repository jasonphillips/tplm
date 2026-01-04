import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Playground from './components/Playground.vue'
import DimensionsEditor from './components/DimensionsEditor.vue'
import { initCellPopover, destroyCellPopover } from './cell-popover'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Playground', Playground)
    app.component('DimensionsEditor', DimensionsEditor)

    // Initialize cell popover after page loads (client-side only)
    if (typeof window !== 'undefined') {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCellPopover)
      } else {
        initCellPopover()
      }

      // Handle HMR
      if (import.meta.hot) {
        import.meta.hot.dispose(() => {
          destroyCellPopover()
        })
      }
    }
  }
} satisfies Theme
