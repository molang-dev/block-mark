import { BlockMakerPlugin } from '../core/types'

export interface ThemeCssConfig {
  id: string
  light: string
  dark: string
}

export function blockMakerThemeCss(config: ThemeCssConfig): BlockMakerPlugin {
  return {
    name: `theme-css-${config.id}`,
    applyTheme(theme: string) {
      let link = document.getElementById(config.id) as HTMLLinkElement | null
      if (!link) {
        link = document.createElement('link')
        link.id  = config.id
        link.rel = 'stylesheet'
        document.head.appendChild(link)
      }
      link.href = theme === 'dark' ? config.dark : config.light
    },
  }
}
