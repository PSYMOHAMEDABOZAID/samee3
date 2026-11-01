#!/usr/bin/env python3
"""Safely patch the existing audio UI without replacing its other features."""
from pathlib import Path
import re

PAGE=Path('app/audio/page.tsx')
MARK='SAMEE3_ALAFASY_RIWAYAT_V3'
IMPORT="import { alafasyFullMushafsForRiwaya, extendRiwayatWithAlafasy } from '@/lib/alafasy-five-mushafs'"

def one_replace(text:str,pattern:str,replacement:str,desc:str)->str:
  matches=list(re.finditer(pattern,text,re.MULTILINE))
  if len(matches)!=1:raise RuntimeError(f'{desc}: expected one insertion point, got {len(matches)}. No files modified.')
  m=matches[0]
  return text[:m.start()]+replacement+text[m.end():]

def main():
  if not PAGE.exists():raise SystemExit('app/audio/page.tsx not found; nothing modified')
  original=PAGE.read_text('utf-8')
  code=original
  if IMPORT not in code:
    anchor=r"^import \{ KHUTBAH_SCHOLARS, libraryAudioSource \} from ['\"]@/lib/audio-catalog['\"]\s*$"
    match=re.search(anchor,code,re.MULTILINE)
    if not match:raise RuntimeError('Audio catalog import changed: no changes made')
    code=code[:match.end()]+f'\n// {MARK}\n{IMPORT}'+code[match.end():]
  # Extend the existing selector catalog (never replace the MP3Quran catalog).
  if 'extendRiwayatWithAlafasy(' not in code:
    pat=r'const nextRiwayat\s*=\s*Array\.isArray\(riwayatData\.riwayat\)\s*\?\s*riwayatData\.riwayat\s*:\s*\[\]'
    m=re.search(pat,code,re.MULTILINE)
    if not m:raise RuntimeError('Riwaya selector shape changed: no changes made')
    code=code[:m.start()]+f'const nextRiwayat = extendRiwayatWithAlafasy(\n        Array.isArray(riwayatData.riwayat) ? riwayatData.riwayat : []\n      )'+code[m.end():]
  # Include separately labeled editions; avoid reciter ID duplicates.
  if 'alafasyFullMushafsForRiwaya(activeRiwaya)' not in code:
    anchor=r'(?m)^([ \t]*)nextReciters\.sort\(\(a, b\) => \{'
    m=re.search(anchor,code)
    if not m:raise RuntimeError('Reciter ordering changed: no changes made')
    indent=m.group(1)
    addition=(f'{indent}// {MARK}: verified recordings only.\n'
      f'{indent}for (const edition of alafasyFullMushafsForRiwaya(activeRiwaya)) {{\n'
      f'{indent}  if (!nextReciters.some(existing => existing.id === edition.id)) nextReciters.push(edition)\n'
      f'{indent}}}\n')
    code=code[:m.start()]+addition+code[m.start():]
  # Add the existing collected Hafs edition only if it has not been integrated earlier.
  # Do not affect the separate Mushaf page or its ayah timing.
  if ('collectedAlafasyLibraryReciter' not in code and
      'ALAFASY_COLLECTED_RECITER_ID' not in code and
      'SAMEE3 COLLECTED ALAFASY' not in code):
    anchor=r'(?m)^([ \t]*)nextReciters\.sort\(\(a, b\) => \{'
    m=re.search(anchor,code)
    if not m:raise RuntimeError('Reciter ordering changed: no changes made')
    indent=m.group(1)
    addition=(f'{indent}// SAMEE3_COLLECTED_AUDIO_LIBRARY_V3\n'
      f'{indent}if (normalizeArabic(activeRiwaya.name).includes(normalizeArabic(\'حفص\'))) {{\n'
      f'{indent}  const collected = collectedAlafasyLibraryReciter(activeRiwaya.id)\n'
      f'{indent}  if (!nextReciters.some(existing => existing.id === collected.id)) nextReciters.push(collected)\n'
      f'{indent}}}\n')
    # Keep imports and usage together so this patch remains idempotent.
    code=code[:m.start()]+addition+code[m.start():]
    top=re.search(r"^import \{ KHUTBAH_SCHOLARS, libraryAudioSource \} from ['\"]@/lib/audio-catalog['\"]",code,re.MULTILINE)
    if not top:raise RuntimeError('Audio catalog import changed: no changes made')
    code=code[:top.end()]+"\nimport { collectedAlafasyLibraryReciter } from '@/lib/quran/alafasy-collected'"+code[top.end():]
  # Network failures must preserve the local verified recordings.
  if 'SAMEE3_ALAFASY_RIWAYAT_FALLBACK_V3' not in code and 'const fallback = alafasyFullMushafsForRiwaya(activeRiwaya)' not in code:
    pat=r"(?m)^([ \t]*)setReciters\(\[\]\)\s*\n\s*setError\('تعذر تحميل قراء الرواية المحددة\.'\)"
    m=re.search(pat,code)
    if not m:raise RuntimeError('Reciter error handler changed: no changes made')
    indent=m.group(1)
    addition=(f'{indent}// SAMEE3_ALAFASY_RIWAYAT_FALLBACK_V3\n'
      f'{indent}const fallback = alafasyFullMushafsForRiwaya(activeRiwaya)\n'
      f'{indent}setReciters(fallback)\n'
      f'{indent}if (fallback.length === 0) setError(\'تعذر تحميل قراء الرواية المحددة.\')')
    code=code[:m.start()]+addition+code[m.end():]
  if code!=original:
    PAGE.write_text(code,'utf-8')
    print('Updated audio library. Other features and pages kept unchanged.')
  else:print('Audio integration already current.')
if __name__=='__main__':main()
