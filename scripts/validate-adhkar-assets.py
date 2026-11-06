#!/usr/bin/env python3
"""Validate shipped files against the developer catalog; no network access."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    project = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets-root', type=Path, default=project / 'public')
    parser.add_argument('--catalog', type=Path, default=project / 'public/data/adhkar-audio/v1/catalog.json')
    parser.add_argument('--decode', action='store_true', help='Also decode every MP3 with ffmpeg')
    args = parser.parse_args()
    root = args.assets_root.resolve()
    catalog = json.loads(args.catalog.read_text())
    entries = [(item['id'], reader, clip) for item in catalog['items'] for reader, clip in item['recordings'].items()]
    entries += [(item['id']+':'+context, reader, clip) for item in catalog['items'] for reader, variants in item.get('variants', {}).items() for context, clip in variants.items()]
    entries += [(clip['id'], clip['readerId'], clip) for clip in catalog.get('sectionRecordings', [])]
    unique = {}
    for entry in entries:
        if entry[2]['url'] in unique and unique[entry[2]['url']][2]['sha256'] != entry[2]['sha256']:
            raise ValueError('Conflicting audio hash')
        unique[entry[2]['url']] = entry
    rows = list(unique.values())
    if 'totalAudioFileCount' in catalog and len(rows) != catalog['totalAudioFileCount']:
        raise ValueError('Catalog file count mismatch')
    source_durations = {clip['source']['sha256']: clip['durationMs'] for clip in catalog.get('sectionRecordings', [])}

    def check(row):
        key, reader, clip = row
        path = (root / clip['url'].lstrip('/')).resolve()
        if root not in path.parents or not path.is_file():
            raise ValueError(f'Missing audio: {key} {reader}: {path}')
        if path.stat().st_size != clip['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != clip['sha256']:
            raise ValueError(f'Audio integrity mismatch: {key} {reader}')
        if clip['timing']['startMs'] != 0 or clip['timing']['endMs'] != clip['durationMs'] or clip['durationMs'] <= 0:
            raise ValueError(f'Invalid timing: {key} {reader}')
        source = clip['source']
        if source['startMs'] < 0 or source['endMs'] <= source['startMs']:
            raise ValueError(f'Invalid original recording timing: {key} {reader}')
        if source['sha256'] in source_durations and source['endMs'] > source_durations[source['sha256']]:
            raise ValueError(f'Clip exceeds its original recording: {key} {reader}')
        if args.decode:
            result = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-f', 'null', '-'], capture_output=True, timeout=120)
            if result.returncode or result.stderr:
                raise ValueError(f'Decode error: {key} {reader}')

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(check, rows))
    print(json.dumps({'status': 'passed', 'audioFiles': len(rows), 'decoded': args.decode}))


if __name__ == '__main__':
    main()
