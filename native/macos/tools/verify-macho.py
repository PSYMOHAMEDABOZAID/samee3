"""Independently verify ad-hoc Mach-O code pages and sealed bundle resources.

This checks hashes, architecture and ad-hoc metadata. It is not an Apple
Gatekeeper/notarization assessment and does not claim to execute macOS code.
"""
from pathlib import Path
import hashlib
import math
import plistlib
import struct

def _digest(kind, value):
    return {1: hashlib.sha1, 2: hashlib.sha256}[kind](value).digest()

def verify_macho(filename):
    filename = Path(filename)
    raw = filename.read_bytes()
    if raw[:4] == b'\xca\xfe\xba\xbe':
        count = struct.unpack_from('>I', raw, 4)[0]
        slices = [(struct.unpack_from('>I', raw, 8 + i * 20 + 8)[0], struct.unpack_from('>I', raw, 8 + i * 20 + 12)[0]) for i in range(count)]
    else:
        slices = [(0, len(raw))]
    result = []
    for start, size in slices:
        data = raw[start:start + size]
        assert data[:4] == b'\xcf\xfa\xed\xfe', (filename, 'Expected 64-bit little-endian Mach-O')
        cpu = struct.unpack_from('<I', data, 4)[0]
        commands = struct.unpack_from('<I', data, 16)[0]
        at = 32; signature = None
        for _ in range(commands):
            cmd, length = struct.unpack_from('<II', data, at)
            if cmd == 0x1D: signature = struct.unpack_from('<II', data, at + 8)
            assert length >= 8
            at += length
        assert signature, (filename, 'No code signature')
        offset, length = signature
        assert offset + length <= len(data)
        magic, total, count = struct.unpack_from('>III', data, offset)
        assert magic == 0xFADE0CC0 and total <= length
        blobs = {}
        for i in range(count):
            slot, relative = struct.unpack_from('>II', data, offset + 12 + i * 8)
            blob_at = offset + relative
            blob_length = struct.unpack_from('>I', data, blob_at + 4)[0]
            assert relative + blob_length <= total
            blobs[slot] = data[blob_at:blob_at + blob_length]
        directories = [blob for slot, blob in blobs.items() if slot == 0 or 0x1000 <= slot <= 0x1005]
        assert directories
        for directory in directories:
            magic, total_cd, version, flags, hash_at, ident_at, special, pages, limit = struct.unpack_from('>9I', directory)
            assert magic == 0xFADE0C02 and total_cd == len(directory)
            hash_size, kind, _, page_shift = struct.unpack_from('4B', directory, 36)
            assert flags & 2, (filename, 'Expected ad-hoc signature')
            assert kind in [1, 2] and hash_size == (20 if kind == 1 else 32)
            if limit == 0xFFFFFFFF and version >= 0x20300: limit = struct.unpack_from('>Q', directory, 56)[0]
            page_size = 1 << page_shift
            assert limit <= offset and pages == math.ceil(limit / page_size)
            for index in range(pages):
                expected = directory[hash_at + index * hash_size:hash_at + (index + 1) * hash_size]
                assert expected == _digest(kind, data[index * page_size:min(limit, (index + 1) * page_size)]), (filename, 'Code page mismatch', index)
            for slot in [2, 5, 7]:
                if slot in blobs:
                    assert special >= slot
                    assert directory[hash_at - slot * hash_size:hash_at - (slot - 1) * hash_size] == _digest(kind, blobs[slot]), (filename, 'Special blob mismatch', slot)
            bundle = None
            for info in [filename.parent / 'Resources/Info.plist', filename.parent.parent / 'Info.plist']:
                if info.is_file():
                    value = plistlib.loads(info.read_bytes())
                    if value.get('CFBundleExecutable') == filename.name:
                        bundle = info.parent.parent if info.parent.name == 'Resources' else info.parent
                        assert special >= 1
                        assert directory[hash_at - hash_size:hash_at] == _digest(kind, info.read_bytes()), (filename, 'Info.plist mismatch')
                        envelope = bundle / '_CodeSignature/CodeResources'
                        if not envelope.is_file(): envelope = bundle / 'Resources/_CodeSignature/CodeResources'
                        assert envelope.is_file(), (filename, 'Missing resources seal')
                        assert special >= 3
                        assert directory[hash_at - 3 * hash_size:hash_at - 2 * hash_size] == _digest(kind, envelope.read_bytes()), (filename, 'Resources slot mismatch')
                        resources = plistlib.loads(envelope.read_bytes())
                        for rel, entry in resources.get('files2', {}).items():
                            target = bundle / rel
                            if isinstance(entry, dict) and 'hash2' in entry:
                                assert hashlib.sha256(target.read_bytes()).digest() == entry['hash2'], (filename, 'Resource hash mismatch', rel)
                            if isinstance(entry, dict) and 'symlink' in entry:
                                assert target.is_symlink() and str(target.readlink()) == entry['symlink'], (filename, 'Symlink mismatch', rel)
                        break
        result.append({'cpuType': cpu, 'signature': 'ad-hoc', 'codeDirectories': len(directories), 'bundleSealChecked': bool(bundle)})
    return result

if __name__ == '__main__':
    import json, sys
    print(json.dumps(verify_macho(Path(sys.argv[1])), indent=2))
