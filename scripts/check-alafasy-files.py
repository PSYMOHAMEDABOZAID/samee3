#!/usr/bin/env python3
"""Read-only validation of vital SAMEE3 Alafasy files."""
from pathlib import Path
import json, re, sys
paths=[
'lib/quran/alafasy-collected.ts',
'app/lib/quran/alafasy-collected.ts',
'app/api/alafasy-audio/[surah]/route.ts',
'app/api/audio/alafasy-riwayat/[mushaf]/[file]/route.ts',
'lib/alafasy-riwayat-manifest.json',
'lib/alafasy-five-mushafs.ts',
'scripts/install-alafasy-five.py',
'scripts/sync-alafasy-riwayat.py',
'.github/workflows/add-alafasy-five.yml',
'app/audio/page.tsx'
]
missing=[p for p in paths if not Path(p).is_file()]
for p in paths:print(('MISSING' if p in missing else 'OK     '),p)
if missing:sys.exit('Missing required files')
for p in ['app/api/alafasy-audio/[surah]/route.ts','app/api/audio/alafasy-riwayat/[mushaf]/[file]/route.ts']:
 text=Path(p).read_text('utf-8')
 if not re.search(r'params\s*:\s*Promise<',text):sys.exit('Next.js 16 Promise params required: '+p)
manifest=json.loads(Path('lib/alafasy-riwayat-manifest.json').read_text('utf8'))
assert isinstance(manifest.get('entries'),list),'Manifest entries must be a list'
print('Manifest editions:',len(manifest['entries']))
