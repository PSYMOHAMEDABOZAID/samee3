type ArtworkInput = {
  text: string
  surah: string
  ayah: number
  reciter: string
  riwaya: string
  kind?: 'quran' | 'adhkar'
  total?: number
}

type TextLayout = {
  font: number
  lines: string[]
  lineHeight: number
  ascent: number
  height: number
}

const SIZE = 1024
const covers = new Map<string, string>()
let assets: Promise<HTMLImageElement> | undefined

function digits(value: number) {
  return String(value).replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)])
}

function loadAssets() {
  if (assets) return assets
  assets = (async () => {
    await Promise.all([
      document.fonts.load('48px "Amiri Quran"'),
      document.fonts.load('700 28px Tajawal'),
    ])
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const logo = new Image()
      logo.onload = () => resolve(logo)
      logo.onerror = () => reject(new Error('Artwork logo unavailable'))
      logo.src = new URL('/icon-512.png', location.origin).href
    })
  })().catch((error) => { assets = undefined; throw error })
  return assets
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > width) {
      lines.push(line)
      line = word
    } else line = candidate
  }
  if (line) lines.push(line)
  return lines
}

function layout(context: CanvasRenderingContext2D, text: string, font: number, width: number): TextLayout {
  context.font = `${font}px "Amiri Quran", serif`
  const lines = wrap(context, text, width)
  let ascent = font
  let descent = font * .4
  for (const line of lines) {
    const measure = context.measureText(line)
    ascent = Math.max(ascent, measure.actualBoundingBoxAscent || font)
    descent = Math.max(descent, measure.actualBoundingBoxDescent || font * .4)
  }
  const lineHeight = Math.ceil(Math.max(font * 1.9, ascent + descent + font * .12))
  return { font, lines, lineHeight, ascent, height: ascent + descent + Math.max(0, lines.length - 1) * lineHeight }
}

/** Every word is retained. Font size is measured before drawing; no ellipsis. */
export function fitArtworkText(context: CanvasRenderingContext2D, text: string, width: number, height: number): TextLayout {
  let minimum = 8
  let maximum = 78
  let best = layout(context, text, minimum, width)
  while (minimum <= maximum) {
    const font = Math.floor((minimum + maximum) / 2)
    const candidate = layout(context, text, font, width)
    const fits = candidate.height <= height && candidate.lines.every((line) => context.measureText(line).width <= width)
    if (fits) { best = candidate; minimum = font + 1 }
    else maximum = font - 1
  }
  return best
}

function label(context: CanvasRenderingContext2D, text: string, y: number, maxSize = 28) {
  let size = maxSize
  do { context.font = `700 ${size}px Tajawal, sans-serif` } while (context.measureText(text).width > 850 && --size > 10)
  context.fillText(text, SIZE / 2, y)
}

export async function createMediaArtwork(input: ArtworkInput): Promise<string> {
  const key = JSON.stringify(input)
  const saved = covers.get(key)
  if (saved) return saved
  const logo = await loadAssets()
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')

  context.fillStyle = '#fbf5e8'
  context.fillRect(0, 0, SIZE, SIZE)
  context.strokeStyle = '#ba9454'
  context.lineWidth = 3
  context.strokeRect(25, 25, SIZE - 50, SIZE - 50)
  context.strokeStyle = '#e4d3ae'
  context.lineWidth = 1
  context.strokeRect(36, 36, SIZE - 72, SIZE - 72)
  context.direction = 'rtl'
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.drawImage(logo, SIZE / 2 - 46, 49, 92, 92)

  context.fillStyle = '#846232'
  const reference = input.kind === 'adhkar'
    ? `الذكر ${digits(input.ayah)}${input.total ? ` من ${digits(input.total)}` : ''}`
    : `الآية ${digits(input.ayah)}`
  label(context, `${input.surah}  •  ${reference}`, 184, 29)
  context.strokeStyle = '#dfcba4'
  context.beginPath()
  context.moveTo(350, 204)
  context.lineTo(674, 204)
  context.stroke()

  const text = fitArtworkText(context, input.text, 850, 625)
  context.font = `${text.font}px "Amiri Quran", serif`
  context.fillStyle = '#123d3c'
  const top = 224 + Math.max(0, (625 - text.height) / 2)
  text.lines.forEach((line, index) => {
    context.fillText(line, SIZE / 2, top + text.ascent + index * text.lineHeight)
  })

  context.strokeStyle = '#dfcba4'
  context.beginPath()
  context.moveTo(250, 881)
  context.lineTo(774, 881)
  context.stroke()
  context.fillStyle = '#194a49'
  label(context, input.reciter, 925, 28)
  context.fillStyle = '#846232'
  label(context, input.riwaya, 966, 23)

  const url = canvas.toDataURL('image/png')
  if (covers.size >= 8) covers.delete(covers.keys().next().value as string)
  covers.set(key, url)
  return url
}
