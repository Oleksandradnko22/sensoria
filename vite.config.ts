import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// Link previews (Instagram, Telegram, Viber…) read only the HTML, never run the app. The author pages get their own
// copy of index.html with «Станьте автором Sensoria» (the hosting serves /for-authors from for-authors.html).
const AUTHOR_META = {
  title: 'Станьте автором Sensoria',
  description: 'Створюйте психологічні програми, гайди й медитації для тих, кому потрібна підтримка. Заповніть анкету автора — ми розглянемо її й відкриємо вам кабінет.',
  image: 'https://sensoria.courses/og-authors.png?v=1',
}
function authorPreviews(): Plugin {
  return {
    name: 'author-link-previews',
    apply: 'build',
    closeBundle() {
      const html = readFileSync('dist/index.html', 'utf8')
      for (const path of ['for-authors', 'author-signup']) {
        const out = html
          .replace(/<title>[^<]*<\/title>/, `<title>${AUTHOR_META.title}</title>`)
          .replace(/(property="og:title" content=")[^"]*/, `$1${AUTHOR_META.title}`)
          .replace(/(property="og:image:alt" content=")[^"]*/, `$1${AUTHOR_META.title}`)
          .replace(/(property="og:description"\s+content=")[^"]*/, `$1${AUTHOR_META.description}`)
          .replace(/(name="description"\s+content=")[^"]*/, `$1${AUTHOR_META.description}`)
          .replace(/(property="og:url" content=")[^"]*/, `$1https://sensoria.courses/${path}`)
          .replace(/(property="og:image" content=")[^"]*/, `$1${AUTHOR_META.image}`)
          .replace(/(name="twitter:image" content=")[^"]*/, `$1${AUTHOR_META.image}`)
        mkdirSync('dist', { recursive: true })
        writeFileSync(`dist/${path}.html`, out)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), authorPreviews()],
})
