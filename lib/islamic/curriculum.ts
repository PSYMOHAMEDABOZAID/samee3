import { SUNNI_LIBRARY_BOOKS, type SunniLibraryBook, type SunniLibraryCategoryId } from './sunniLibrary'

export type LevelId = 'beginner' | 'intermediate' | 'advanced'
export type LearningCourse = SunniLibraryBook & {
  levelId: LevelId; videoUrl?: string; audioSourceUrl?: string; audioUrl?: string
  videoDownloadUrl?: string; resourceNote?: string; videoAuthor?: string; pdfParts?: { label: string; url: string }[]
}
export const CURRICULUM_VERSION = 1
export const LEARNING_LEVELS = [
  { id: 'beginner' as const, name: 'المستوى المبتدئ', label: 'مبتدئ', number: '01', description: 'بداية واضحة لبناء أصول العلم، كتابًا بعد كتاب.' },
  { id: 'intermediate' as const, name: 'المستوى المتوسط', label: 'متوسط', number: '02', description: 'توسّع في الفهم واربط الأصول بالتطبيق والدراسة.' },
  { id: 'advanced' as const, name: 'المستوى المتقدم', label: 'متقدم', number: '03', description: 'قراءة أعمق في المطوّلات وأمهات كتب العلوم الشرعية.' },
]
export function isLevelId(value: string): value is LevelId { return LEARNING_LEVELS.some((level) => level.id === value) }
const extra = (id: string, title: string, author: string, category: SunniLibraryCategoryId, readingUrl: string): SunniLibraryBook => ({ id, title, author, category, readingUrl, level: 'متقدم', description: `دراسة كتاب ${title} في ${category === 'seerah' ? 'السيرة النبوية' : 'العلوم الشرعية'}، مع الرجوع إلى شروحه ومصادره.` })
const extras: SunniLibraryBook[] = [
  extra('usul-tafsir-hisan', 'القواعد الحسان المتعلقة بتفسير القرآن', 'عبد الرحمن بن ناصر السعدي', 'usul-tafsir', 'https://islamhouse.com/ar/books/205542/'),
  extra('seerah-ibn-hisham', 'السيرة النبوية لابن هشام', 'عبد الملك بن هشام', 'seerah', 'https://www.islamweb.org/ar/library/index.php?page=bookcontents&bk_no=58'),
  extra('seerah-zad-maad', 'زاد المعاد في هدي خير العباد', 'ابن قيم الجوزية', 'seerah', 'https://www.islamweb.org/ar/library/index.php?page=bookcontents&bk_no=127'),
  extra('usul-tafsir-itqan', 'الإتقان في علوم القرآن', 'جلال الدين السيوطي', 'usul-tafsir', 'https://www.islamweb.org/ar/library/index.php?page=bookcontents&bk_no=68'),
  extra('usul-fiqh-rawdah', 'شرح مختصر الروضة', 'نجم الدين الطوفي', 'usul-fiqh', 'https://www.islamweb.org/ar/library/index.php?page=bookcontents&bk_no=98'),
  extra('usul-hadith-tadrib', 'تدريب الراوي في شرح تقريب النواوي', 'جلال الدين السيوطي', 'usul-hadith', 'https://www.islamweb.org/ar/library/index.php?page=bookcontents&bk_no=88'),
]
const YT = (id: string) => `https://www.youtube.com/playlist?list=${id}`
// These are real source pages/playlists, never generated search links.
const resources: Record<string, Partial<LearningCourse>> = {
  'aq-lumat': { downloadUrl: 'https://shamela.org/gen/05e3690ce9c945c6867887ca83f912aa_gen.pdf?download=1', videoUrl: YT('PLabBqCjtdZ0GuYbsA97BTc5o4mhMfMoXM'), videoAuthor: 'صالح آل الشيخ', audioSourceUrl: 'https://islamhouse.com/ar/audios/312573/' },
  'fiqh-mulakhkhas': { downloadUrl: 'https://d1.islamhouse.com/data/ar/ih_books/single_01/ar_Fiqh_Summary.pdf', videoUrl: YT('PL3523jgHxjkY2hy-9-YqgbS3yzGhQkmuq') },
  'seerah-raheeq': { videoUrl: YT('PLQI-l5kqLXsaVs1q5_4pnq7bKB-yYoYeW'), videoAuthor: 'عبد الرحمن العجلان' },
  'usul-tafsir-hisan': { videoUrl: YT('PLpl0y8qVS70S5DK8ag-dEZqjskIITryOG'), audioSourceUrl: 'https://www.al-badr.net/sub/101' },
  'usul-fiqh-waraqat': { downloadUrl: 'https://d1.islamhouse.com/data/ar/ih_books/single_02/ar_alwarakat_fe_osol_elfiqh.pdf', videoUrl: YT('PLiTKQO5a7ZXn5itW6X7-AqsCDWSgDqIkl'), videoAuthor: 'محمد بن صالح العثيمين' },
  'usul-hadith-bayquniyyah': { videoUrl: YT('PLWzzF688g_ng8Wmo421MPpDWrZT-fu1as'), audioSourceUrl: 'https://audio.islamweb.net/AUDIO/index.php?page=lecview&sid=162&lg=714' },
  'hadith-shamail': { downloadUrl: 'https://d1.islamhouse.com/data/ar/ih_books/single8/ar_shmeel_mohamadia.pdf', videoUrl: YT('PLL77AuOlMm6TMefGbtKOd-g7EtIUDkyky'), resourceNote: 'الشرح المرئي لمختصر الشمائل المحمدية للشيخ عبد الرزاق البدر.' },
  'fiqh-bulugh': { videoUrl: YT('PL3523jgHxjkaxWI32jnj8Gx3dGvkSrmli') },
  'aq-tahawiyyah': { videoUrl: YT('PLtmYkyY8ieMYuZJz3ROOYGz2DTR65xuQf') },
  'usul-tafsir-muqaddimah': { videoUrl: YT('PLYLDRp4-7YC3ocT1mE9ctmHZM-LwSJjUT') },
  'usul-fiqh-usul': { videoUrl: YT('PLfwfvsTkskdZesaN6p-0q0_PH3xxz6_D4') },
  'usul-hadith-nukhbah': { videoUrl: YT('PLx3Fh1kiMbregHrlhNLi_7mDFdUW6tSA0') },
  'seerah-zad-maad': { videoUrl: YT('PLgaTRTylCbZDo3NyLb7i_NYIyhIKp-Kcq') },
  'usul-tafsir-itqan': { videoUrl: YT('PLVyeHTRwwhc67n9H4M4y1ZblA28HkGj8B') },
  'usul-hadith-tadrib': { videoUrl: YT('PLqHNppJ4B0Z0G0zfuFQKnnhiPKjn9I7XS') },
  'tafsir-tabari': { videoUrl: YT('PLrbxbilHNR6pSmG4zEYU7MNCcJWUx20XA'), resourceNote: 'قراءة مسموعة لتفسير الطبري في قائمة مرئية؛ راجع قائمة الناشر للأجزاء المتاحة.' },
  'hadith-sahih-bukhari': { videoUrl: YT('PLXS0usquloW8vk6FwSeWfR9ES9pcZ_BNI') },
  'aq-wasitiyyah': { videoUrl: YT('PLXS0usquloW-IXuZTBpY8si9ZLeV7i3AV') },
  'fiqh-zad': { videoUrl: YT('PLXS0usquloW_eC9EGBL66I1Fss3Oravm1') },
  'seerah-ibn-hisham': { videoUrl: YT('PLvgpUtaV9tDubz7_d4tfEOfM9bTjjJbUx') },
  'usul-fiqh-rawdah': { videoUrl: YT('PLZQ52aPDC9GDknYN6iDKrTkXQBGKP-Ou0') },
  'tafsir-ibnkathir-mukhtasar': { videoUrl: YT('PLgaTRTylCbZAaRhXYobg2mVSWhDTLzAOp') },
  'hadith-riyad': { videoUrl: YT('PLXS0usquloW9kO9XISmGQbdKHoap4EQPX'), audioSourceUrl: 'https://audio.islamweb.net/AUDIO/index.php?page=lecview&sid=162&lg=118' },
}
const pdfEditions: Record<string, string> = {
  "aq-lumat": "https://shamela.org/gen/05e3690ce9c945c6867887ca83f912aa_gen.pdf?download=1",
  "fiqh-mulakhkhas": "https://d1.islamhouse.com/data/ar/ih_books/single_01/ar_Fiqh_Summary.pdf",
  "seerah-raheeq": "https://assets.usul.ai/pdfs/iH_Ka_GPe8.pdf",
  "usul-tafsir-hisan": "https://d1.islamhouse.com/data/ar/ih_books/single2/ar_alhasan_rules.pdf",
  "usul-fiqh-waraqat": "https://d1.islamhouse.com/data/ar/ih_books/single_02/ar_alwarakat_fe_osol_elfiqh.pdf",
  "usul-hadith-bayquniyyah": "https://d1.islamhouse.com/data/ar/ih_articles/single2/ar-matn-albyqoniah.pdf",
  "hadith-shamail": "https://d1.islamhouse.com/data/ar/ih_books/single8/ar_shmeel_mohamadia.pdf",
  "aq-wasitiyyah": "https://assets.usul.ai/pdfs/4dQ-Bzk9Zf.pdf",
  "seerah-ibn-hisham": "https://assets.usul.ai/pdfs/sirat-ibn-hisham-SK9HlZZMsb.pdf",
  "usul-tafsir-muqaddimah": "https://assets.usul.ai/pdfs/O4PfDi23DU.pdf",
  "usul-fiqh-usul": "https://assets.usul.ai/pdfs/7yF487oyb_.pdf",
  "usul-hadith-nukhbah": "https://d1.islamhouse.com/data/ar/ih_books/single_010/ar-2829022-nukbat-ppp.pdf",
  "tafsir-ibnkathir-mukhtasar": "https://assets.usul.ai/pdfs/XVngB4IGF2.pdf",
  "hadith-riyad": "https://assets.usul.ai/pdfs/iIOeGbEJmk.pdf",
  "fiqh-zad": "https://assets.usul.ai/pdfs/IUnDjWNfOo.pdf",
  "seerah-zad-maad": "https://assets.usul.ai/pdfs/WSf0JYN_je.pdf",
  "usul-fiqh-rawdah": "https://assets.usul.ai/pdfs/rDknR-_Ry1.pdf",
  "usul-hadith-tadrib": "https://assets.usul.ai/pdfs/_JvaKFVIA0.pdf",
  "tafsir-tabari": "https://assets.usul.ai/pdfs/fKDbyQXfAV.pdf",
  "hadith-sahih-bukhari": "https://assets.usul.ai/pdfs/P7WB-vyEAv.pdf",
  "fiqh-bulugh": "https://d1.islamhouse.com/data/ar/ih_books/single-03/ar-bulugh-almaram.pdf",
  "aq-tahawiyyah": "https://archive.org/download/FP0177/0177.pdf",
  "usul-tafsir-itqan": "https://shamela.org/gen/1e2b70b75719ee5e8b78a6c0e7c11d07_gen.pdf?download=1",
  "tafsir-taysir-qattan": "https://shamela.org/gen/87bdf124a18abe12f093c6c6b1ab6b27_gen.pdf"
}
const videoAuthors: Record<string, string> = {
  "fiqh-mulakhkhas": "صالح بن فوزان الفوزان",
  "usul-tafsir-hisan": "يوسف الشبل",
  "usul-hadith-bayquniyyah": "محمد بن صالح العثيمين",
  "hadith-shamail": "عبد الرزاق البدر",
  "fiqh-bulugh": "صالح بن فوزان الفوزان",
  "aq-tahawiyyah": "عبد الرحمن البراك",
  "usul-tafsir-muqaddimah": "محمد بن صالح العثيمين",
  "usul-fiqh-usul": "سليمان الرحيلي",
  "usul-hadith-nukhbah": "عثمان الخميس",
  "seerah-zad-maad": "حسن بخاري",
  "usul-tafsir-itqan": "مساعد الطيار",
  "usul-hadith-tadrib": "أحمد معبد",
  "tafsir-tabari": "عادل السبعان",
  "hadith-sahih-bukhari": "محمد بن صالح العثيمين",
  "aq-wasitiyyah": "محمد بن صالح العثيمين",
  "fiqh-zad": "محمد بن صالح العثيمين",
  "seerah-ibn-hisham": "محمد نبيه",
  "usul-fiqh-rawdah": "محمد الشامي",
  "tafsir-ibnkathir-mukhtasar": "علي بن نفيع العلياني",
  "hadith-riyad": "محمد بن صالح العثيمين"
}
const selections: Record<LevelId, string[]> = {
  beginner: ['aq-lumat', 'fiqh-mulakhkhas', 'seerah-raheeq', 'usul-tafsir-hisan', 'usul-fiqh-waraqat', 'usul-hadith-bayquniyyah', 'tafsir-taysir-qattan', 'hadith-shamail'],
  intermediate: ['aq-wasitiyyah', 'fiqh-bulugh', 'seerah-ibn-hisham', 'usul-tafsir-muqaddimah', 'usul-fiqh-usul', 'usul-hadith-nukhbah', 'tafsir-ibnkathir-mukhtasar', 'hadith-riyad'],
  advanced: ['aq-tahawiyyah', 'fiqh-zad', 'seerah-zad-maad', 'usul-tafsir-itqan', 'usul-fiqh-rawdah', 'usul-hadith-tadrib', 'tafsir-tabari', 'hadith-sahih-bukhari'],
}
export const LEARNING_COURSES: LearningCourse[] = LEARNING_LEVELS.flatMap((level) => selections[level.id].map((id) => {
  const source = [...SUNNI_LIBRARY_BOOKS, ...extras].find((book) => book.id === id)
  if (!source) throw new Error(`Missing curriculum book: ${id}`)
  return { ...source, ...resources[id], ...(pdfEditions[id] ? { downloadUrl: pdfEditions[id] } : {}), ...(videoAuthors[id] ? { videoAuthor: videoAuthors[id] } : {}), ...(id === 'tafsir-taysir-qattan' ? { resourceNote: 'تتوفر نسخة الكتاب للقراءة. لم يُربط شرح مرئي متحقق لهذا الكتاب بعد.' } : {}), level: level.label as SunniLibraryBook['level'], levelId: level.id }
}))
export function courseById(id: string) { return LEARNING_COURSES.find((book) => book.id === id) }
export function coursesInLevel(level: LevelId) { return LEARNING_COURSES.filter((book) => book.levelId === level) }
export function completedInLevel(level: LevelId, completed: string[]) { return coursesInLevel(level).filter((book) => completed.includes(book.id)).length }
export function normalizeLearningName(value: string) { return value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) }
export function youtubeEmbed(value?: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value), host = url.hostname.replace(/^www\./, '')
    if (!['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return null
    const list = url.searchParams.get('list')
    if (list && /^[A-Za-z0-9_-]{10,80}$/.test(list)) return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&rel=0`
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v')
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null
  } catch { return null }
}