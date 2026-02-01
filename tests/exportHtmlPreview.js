import { buildExportHtml } from '../electron/exportHtml.js'

const samplePages = [
  { pageNumber: 12, text: '[[PAGE_SPLIT]]Destra: testo di prova.' },
]

const html = buildExportHtml({
  bookName: 'Test',
  pages: samplePages,
  options: {
    exportOptions: {
      splitSpreadIntoTwoPages: true,
      insertBlankPages: true,
      outputFormat: 'A4',
      previewInReader: false
    }
  }
})

const countPages = (s) => (s.match(/class="page"/g) || []).length
console.log('page_count=' + countPages(html))
