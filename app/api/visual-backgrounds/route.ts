import { NextResponse } from 'next/server'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// SAMEE3_VISUAL_BACKGROUNDS_CURRENT_REPOSITORY_V2
const GITHUB_OWNER = 'PSYMOHAMEDABOZAID'
const GITHUB_REPOSITORY = 'samee3'
const BACKGROUND_FOLDER = 'public/visual-backgrounds'

type VideoFile = {
  filename: string
  size: number
}

type GitHubEntry = {
  name?: unknown
  type?: unknown
  size?: unknown
}

function validFilename(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 180 &&
    /\.(mp4|webm)$/i.test(name) &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.startsWith('.')
  )
}

async function localFiles(): Promise<VideoFile[]> {
  try {
    const directory = join(process.cwd(), 'public', 'visual-backgrounds')
    const names = await readdir(directory)
    const entries = await Promise.all(
      names.filter(validFilename).map(async filename => {
        try {
          const information = await stat(join(directory, filename))
          return information.isFile() && information.size >= 1024
            ? { filename, size: information.size }
            : null
        } catch {
          return null
        }
      })
    )
    return entries.filter((entry): entry is VideoFile => entry !== null)
  } catch {
    // On Vercel, the public folder might not be available to a serverless function.
    return []
  }
}

async function githubFiles(): Promise<{
  files: VideoFile[]
  ignored: number
}> {
  const url =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}` +
    `/contents/${BACKGROUND_FOLDER}?ref=main`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'samee3-visual-gallery',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(12000),
  })

  if (!response.ok) {
    throw new Error(`GitHub API: ${response.status}`)
  }

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('فهرس فيديوهات GitHub غير صالح.')
  }

  const files: VideoFile[] = []
  let ignored = 0

  for (const value of payload) {
    const entry = value as GitHubEntry
    if (
      entry &&
      entry.type === 'file' &&
      typeof entry.name === 'string' &&
      validFilename(entry.name) &&
      typeof entry.size === 'number' &&
      Number.isFinite(entry.size) &&
      entry.size >= 1024
    ) {
      files.push({ filename: entry.name, size: entry.size })
    } else {
      ignored++
    }
  }

  return { files, ignored }
}

export async function GET() {
  // Always query BOTH sources; the original code skipped GitHub when local
  // files existed, causing newly uploaded backgrounds to disappear.
  const local = await localFiles()
  let remote: VideoFile[] = []
  let ignored = 0
  let warning = ''

  try {
    const listing = await githubFiles()
    remote = listing.files
    ignored = listing.ignored
  } catch {
    warning = 'تعذر قراءة قائمة المستودع الحالي مؤقتًا. اعرض الخلفيات المحلية، ثم حدّث المكتبة لاحقًا.'
  }

  const unique = new Map<string, VideoFile>()
  for (const file of local) unique.set(file.filename, file)
  for (const file of remote) unique.set(file.filename, file)

  const files = [...unique.values()].sort((a, b) =>
    a.filename.localeCompare(b.filename, 'ar')
  )

  return NextResponse.json(
    {
      files,
      warning,
      // Optional diagnostics; existing page.tsx ignores additional fields.
      counts: {
        repository: remote.length,
        deployed: local.length,
        ignored,
        visible: files.length,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}