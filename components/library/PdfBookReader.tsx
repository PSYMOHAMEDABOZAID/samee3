'use client'

import { useEffect, useRef, useState } from 'react'

import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, RotateCw, Upload } from 'lucide-react'

import { safeIslamicLibraryLink } from '@/lib/islamic/safeLinks'

type RenderTask = {
  promise: Promise<void>
  cancel: () => void
}

type PdfPage = {
  getViewport: (options: { scale: number; rotation?: number }) => {
    width: number
    height: number
  }

  render: (options: object) => RenderTask
  cleanup: () => void
}

type PdfDocument = {
  numPages: number
  getPage: (page: number) => Promise<PdfPage>
}

type LoadingTask = {
  promise: Promise<PdfDocument>
  destroy: () => Promise<void>
}

type PdfEngine = {
  version: string

  GlobalWorkerOptions: {
    workerSrc: string
  }

  getDocument: (options: object) => LoadingTask
}

type PdfBookReaderProps = {
  bookId: string
  title: string
  url?: string
  readingUrl?: string
  fill?: boolean
}

const PDFJS_URL = '/pdfjs/5.4.296/pdf.min.mjs'

const PDF_ASSETS = '/pdfjs/5.4.296/'

let enginePromise: Promise<PdfEngine> | null = null

function loadPdf(): Promise<PdfEngine> {
  if (!enginePromise) {
    enginePromise = (
      import(
        /* webpackIgnore: true */
        PDFJS_URL
      ) as Promise<PdfEngine>
    )
      .then((engine) => {
        engine.GlobalWorkerOptions.workerSrc =
          PDF_ASSETS + 'pdf.worker.min.mjs'

        return engine
      })
      .catch((error: unknown) => {
        enginePromise = null
        throw error
      })
  }

  return enginePromise
}

export default function PdfBookReader({ bookId, title, url, readingUrl, fill = false }: PdfBookReaderProps) {
  const [pdf, setPdf] = useState<PdfDocument | null>(null)

  const [file, setFile] = useState<File | null>(null)

  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [width, setWidth] = useState(360)

  const viewport = useRef<HTMLDivElement>(null)
  const canvasHost = useRef<HTMLDivElement>(null)

  const key = `samee3_pdf_v1:${bookId}:${file?.name || url || ''}`

  const safeUrl = safeIslamicLibraryLink(url)

  const external = safeUrl || safeIslamicLibraryLink(readingUrl)

  useEffect(() => {
    const target = viewport.current

    if (!target) {
      return
    }

    const resize = () => {
      setWidth(Math.max(200, target.clientWidth - 24))
    }

    resize()

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(target)
    window.addEventListener('resize', resize)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    let alive = true
    let task: LoadingTask | null = null

    setPdf(null)
    setError('')
    setLoading(!!(safeUrl || file))
    setZoom(1)
    setRotation(0)

    if (!safeUrl && !file) {
      return
    }

    void (async () => {
      try {
        const engine = await loadPdf()

        const data = file ? new Uint8Array(await file.arrayBuffer()) : null

        if (!alive) {
          return
        }

        task = engine.getDocument({
          ...(data
            ? { data }
            : {
                url: '/api/library-pdf?url=' + encodeURIComponent(safeUrl!),
              }),

          isEvalSupported: false,
          enableXfa: false,
          disableAutoFetch: true,
          disableStream: true,
          rangeChunkSize: 65536,

          cMapUrl: PDF_ASSETS + 'cmaps/',

          cMapPacked: true,

          standardFontDataUrl: PDF_ASSETS + 'standard_fonts/',

          wasmUrl: PDF_ASSETS + 'wasm/',
        })

        const document = await task.promise

        if (!alive) {
          return
        }

        let saved = 1

        try {
          saved = Number(localStorage.getItem(key)) || 1
        } catch {}

        const initial = Math.max(1, Math.min(document.numPages, Math.floor(saved)))

        setPage(initial)
        setPageInput(String(initial))
        setPdf(document)
      } catch {
        if (alive) {
          setError(
            'تعذر فتح PDF من المصدر. أعد المحاولة أو اختر نسخة PDF من جهازك؛ سيستمر الشرح أثناء القراءة.',
          )
        }
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    })()

    return () => {
      alive = false

      if (task) {
        void task.destroy().catch(() => {})
      }
    }
  }, [safeUrl, file, key, retry])

  useEffect(() => {
    if (!pdf) {
      return
    }

    let alive = true
    let task: RenderTask | null = null
    let pdfPage: PdfPage | null = null

    const canvas = document.createElement('canvas')

    canvas.dir = 'ltr'
    canvas.style.direction = 'ltr'

    canvas.setAttribute('aria-label', `${title}، صفحة ${page}`)

    canvas.setAttribute('role', 'img')

    setRendering(true)
    setError('')
    setPageInput(String(page))

    canvasHost.current?.replaceChildren(canvas)

    void (async () => {
      try {
        pdfPage = await pdf.getPage(page)

        if (!alive) {
          pdfPage.cleanup()
          return
        }

        const natural = pdfPage.getViewport({
          scale: 1,
          rotation,
        })

        const view = pdfPage.getViewport({
          scale: (width / natural.width) * zoom,
          rotation,
        })

        const density = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(3_000_000 / (view.width * view.height)),
        )

        canvas.width = Math.floor(view.width * density)

        canvas.height = Math.floor(view.height * density)

        canvas.style.width = `${view.width}px`

        canvas.style.height = `${view.height}px`

        const ctx = canvas.getContext('2d')

        if (!ctx) {
          throw new Error('Canvas unavailable')
        }

        ctx.direction = 'ltr'
        ctx.textAlign = 'left'

        task = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport: view,

          transform: [density, 0, 0, density, 0, 0],
        })

        await task.promise

        if (alive) {
          try {
            localStorage.setItem(key, String(page))
          } catch {}

          viewport.current?.scrollTo({
            top: 0,
          })
        }
      } catch (e) {
        const cancelled = e instanceof Error && e.name === 'RenderingCancelledException'

        if (alive && !cancelled) {
          setError('تعذر رسم هذه الصفحة. جرّب صفحة أخرى أو افتح نسخة المصدر.')
        }
      } finally {
        if (alive) {
          setRendering(false)
        }

        if (pdfPage && !task) {
          pdfPage.cleanup()
        }
      }
    })()

    return () => {
      alive = false
      task?.cancel()

      if (task) {
        void task.promise
          .catch(() => {})
          .finally(() => {
            pdfPage?.cleanup()
            canvas.width = 0
            canvas.height = 0
          })
      } else {
        canvas.width = 0
        canvas.height = 0
      }

      canvas.remove()
    }
  }, [pdf, page, zoom, rotation, width, key, title])

  const choose = (value: number) => {
    if (!pdf) {
      return
    }

    setPage(Math.max(1, Math.min(pdf.numPages, Math.floor(value) || 1)))
  }

  const button = 'rounded-xl border border-[#d7ccb7] bg-white p-2 text-xs font-bold disabled:opacity-30'

  return (
    <section
      data-study-pdf
      className={`overflow-hidden rounded-2xl border border-[#ded3bf] bg-[#e8e3d8] ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-1.5 bg-[#faf7ef] p-2">
        <strong className="ml-auto text-sm">الكتاب أثناء الشرح</strong>

        {pdf && (
          <>
            <button
              type="button"
              className={button}
              disabled={page <= 1}
              onClick={() => choose(page - 1)}
              aria-label="الصفحة السابقة"
            >
              <ChevronRight size={18} />
            </button>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                choose(Number(pageInput))
              }}
              className="flex items-center gap-1 text-xs"
            >
              <input
                aria-label="رقم صفحة الكتاب"
                type="number"
                min={1}
                max={pdf.numPages}
                value={pageInput}
                onChange={(event) => {
                  setPageInput(event.target.value)
                }}
                onBlur={() => {
                  choose(Number(pageInput))
                }}
                className="w-16 rounded-lg border bg-white p-2 text-center"
              />

              <span>من {pdf.numPages.toLocaleString('ar-EG')}</span>
            </form>

            <button
              type="button"
              className={button}
              disabled={page >= pdf.numPages}
              onClick={() => choose(page + 1)}
              aria-label="الصفحة التالية"
            >
              <ChevronLeft size={18} />
            </button>

            <select
              aria-label="تكبير الكتاب"
              className={button}
              value={zoom}
              onChange={(event) => {
                setZoom(Number(event.target.value))
              }}
            >
              <option value={1}>عرض الصفحة</option>

              <option value={1.25}>125٪</option>

              <option value={1.5}>150٪</option>

              <option value={2}>200٪</option>

              <option value={2.5}>250٪</option>
            </select>

            <button
              type="button"
              className={button}
              onClick={() => {
                setRotation((value) => (value + 90) % 360)
              }}
              aria-label="تدوير الصفحة"
            >
              <RotateCw size={17} />
            </button>
          </>
        )}

        <label className={`${button} inline-flex cursor-pointer items-center gap-1`}>
          <Upload size={15} />
          PDF من جهازي
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.[0]

              if (!selected) {
                return
              }

              if (selected.size > 100 * 1024 * 1024) {
                setError('اختر ملفًا أصغر من ١٠٠ ميجابايت.')
                return
              }

              setFile(selected)
            }}
          />
        </label>

        {external && (
          <a
            className={button}
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="فتح مصدر الكتاب"
          >
            <ExternalLink size={16} />
          </a>
        )}

        {safeUrl && (
          <a
            className={button}
            href={'/api/library-pdf?url=' + encodeURIComponent(safeUrl) + '&download=1'}
            download
            target="_blank"
            rel="noopener noreferrer"
            aria-label="تنزيل PDF"
          >
            <Download size={16} />
          </a>
        )}
      </header>

      {error && (
        <div role="alert" className="bg-amber-50 p-4 text-xs leading-7 text-amber-900">
          {error}

          <button
            type="button"
            className="mr-2 underline"
            onClick={() => {
              setRetry((value) => value + 1)
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      <div
        ref={viewport}
        data-study-pdf-scroll
        className={`relative overflow-auto p-2 ${fill ? 'min-h-0 flex-1' : 'max-h-[54dvh] min-h-52'}`}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        {(loading || rendering) && (
          <div
            role="status"
            className="sticky top-2 z-10 mx-auto mb-3 flex w-fit items-center gap-2 rounded-xl bg-white/95 px-4 py-2 text-xs shadow"
          >
            <Loader2 size={17} className="animate-spin" />
            جارٍ تجهيز الصفحة…
          </div>
        )}

        {!safeUrl && !file && (
          <p className="p-5 text-center text-sm leading-8">
            اختر نسخة PDF من جهازك لقراءتها تحت الشرح، أو افتح مصدر الكتاب. يمكنك إضافة رابط PDF للكتاب من
            لوحة إدارة المكتبة.
          </p>
        )}

        <div
          ref={canvasHost}
          dir="ltr"
          className="mx-auto w-fit min-w-full [&>canvas]:mx-auto [&>canvas]:bg-white [&>canvas]:shadow-md"
        />
      </div>

      {file && (
        <p className="bg-white/80 px-3 py-2 text-xs text-[#7b715e]">
          {file.name}
          {' · '}
          يظل الملف على جهازك. آخر صفحة تُحفظ لهذا المتصفح.
        </p>
      )}
    </section>
  )
}
