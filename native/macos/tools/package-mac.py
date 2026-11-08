#!/usr/bin/env python3
"""Build real macOS app bundles from pinned official Electron runtimes on Linux or macOS.

Distribution here uses an ad-hoc signature. Apple Developer ID/notarization is a
separate owner-supplied publishing step. No build tools are needed by the recipient.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import plistlib
import shutil
import re
import stat
import subprocess
import tempfile
import zipfile
import importlib.util

spec = importlib.util.spec_from_file_location('macho_verify', Path(__file__).with_name('verify-macho.py'))
verify_module = importlib.util.module_from_spec(spec); spec.loader.exec_module(verify_module)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, required=True, help='Verified official Electron macOS runtime ZIP')
    parser.add_argument('--arch', choices=['arm64', 'x64'], required=True)
    parser.add_argument('--rcodesign', type=Path, required=True, help='Apple Codesign rcodesign for ad-hoc bundle signing')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--work', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    release_version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', release_version):
        raise SystemExit('Invalid application version in package.json')
    args.output.mkdir(parents=True, exist_ok=True); args.work.mkdir(parents=True, exist_ok=True)
    target = args.work / 'unsigned/Samee3.app'
    if target.exists() or (args.work / 'Samee3.app').exists(): raise SystemExit('Use a new work directory; refusing to overwrite an existing app bundle.')
    with zipfile.ZipFile(args.runtime) as runtime:
        assert runtime.testzip() is None
        for entry in runtime.infolist():
            if not entry.filename.startswith('Electron.app/'): continue
            relative = Path(entry.filename).relative_to('Electron.app')
            assert not relative.is_absolute() and '..' not in relative.parts
            output = target / relative; mode = entry.external_attr >> 16
            if entry.is_dir(): output.mkdir(parents=True, exist_ok=True); continue
            output.parent.mkdir(parents=True, exist_ok=True)
            if stat.S_ISLNK(mode):
                destination = runtime.read(entry).decode()
                assert not Path(destination).is_absolute()
                assert (output.parent / destination).resolve().is_relative_to(target.resolve())
                output.symlink_to(destination)
            else:
                output.write_bytes(runtime.read(entry)); output.chmod(mode & 0o777 or 0o644)
    contents = target / 'Contents'; resources = contents / 'Resources'
    for name in ['default_app.asar', 'default_app.asar.unpacked']:
        p = resources / name
        if p.is_dir(): shutil.rmtree(p)
        elif p.exists(): p.unlink()
    application = resources / 'app'; application.mkdir()
    for name in ['main.cjs', 'preload.cjs', 'core.cjs', 'widgets-window.cjs', 'package.json']:
        shutil.copyfile(root / name, application / name)
    for name in ['ui', 'data']: shutil.copytree(root / name, application / name)
    shutil.copyfile(root / 'ui/app.icns', resources / 'app.icns')
    notices = resources / 'ThirdPartyNotices'; notices.mkdir(exist_ok=True)
    with zipfile.ZipFile(args.runtime) as runtime:
        for name in ['LICENSE', 'LICENSES.chromium.html']:
            (notices / name).write_bytes(runtime.read(name))
    metadata = plistlib.loads((contents / 'Info.plist').read_bytes())
    minimum = metadata['LSMinimumSystemVersion']
    metadata.update({
        'CFBundleName': 'Samee3', 'CFBundleDisplayName': 'مصحف سميع',
        'CFBundleIdentifier': 'app.samee3.mac', 'CFBundleShortVersionString': release_version,
        'CFBundleVersion': str(int(release_version.split('.')[0]) * 10000 + int(release_version.split('.')[1]) * 100 + int(release_version.split('.')[2])), 'CFBundleIconFile': 'app.icns', 'LSApplicationCategoryType': 'public.app-category.reference',
        'NSHumanReadableCopyright': 'مصحف سميع',
        'NSMicrophoneUsageDescription': 'يسمح سميع باستخدام الميكروفون عند طلب ميزة تحتاجه من داخل التطبيق.',
        'NSCameraUsageDescription': 'يسمح سميع باستخدام الكاميرا عند طلبك ذلك من داخل التطبيق.',
        'NSLocationUsageDescription': 'يُستخدم الموقع عند اختيارك تحديد مواقيت الصلاة والقبلة.',
        'NSLocationWhenInUseUsageDescription': 'يُستخدم الموقع عند اختيارك تحديد مواقيت الصلاة والقبلة.',
    })
    for key in ['ElectronAsarIntegrity', 'CFBundleDocumentTypes', 'CFBundleURLTypes']: metadata.pop(key, None)
    (contents / 'Info.plist').write_bytes(plistlib.dumps(metadata))
    for info in (contents / 'Frameworks').rglob('*.app/Contents/Info.plist'):
        value = plistlib.loads(info.read_bytes())
        binaries = [p for p in (info.parent / 'MacOS').iterdir() if p.is_file()]
        assert len(binaries) == 1
        value['CFBundleExecutable'] = binaries[0].name
        value['CFBundleIdentifier'] = value.get('CFBundleIdentifier', 'com.github.Electron.helper').replace('com.github.Electron', 'app.samee3.mac', 1)
        value['CFBundleDisplayName'] = value.get('CFBundleName', 'Electron Helper').replace('Electron', 'Samee3')
        info.write_bytes(plistlib.dumps(value))
    entitlements = args.work / 'entitlements.plist'
    entitlements.write_bytes(plistlib.dumps({'com.apple.security.cs.allow-jit': True, 'com.apple.security.cs.disable-library-validation': True}))
    log = args.work / 'codesign.log'
    with log.open('w') as stream:
        subprocess.run([str(args.rcodesign), 'sign', '--timestamp-url', 'none', '--entitlements-xml-file', 'main:' + str(entitlements), str(target), str(args.work / 'Samee3.app')], check=True, stdout=stream, stderr=subprocess.STDOUT)
    target = args.work / 'Samee3.app'
    contents = target / 'Contents'; application = contents / 'Resources/app'
    executable = contents / 'MacOS' / metadata['CFBundleExecutable']
    root_slices = verify_module.verify_macho(executable)
    assert any(s['cpuType'] == (0x0100000C if args.arch == 'arm64' else 0x01000007) for s in root_slices)
    all_macho = []
    for p in contents.rglob('*'):
        if not p.is_file() or p.is_symlink(): continue
        with p.open('rb') as stream: magic = stream.read(4)
        if magic in [b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca']:
            verify_module.verify_macho(p)
            all_macho.append(p.relative_to(target).as_posix())
    # Compare application payload after signing; every Quran text/font/audio byte must be preserved.
    for folder in ['ui', 'data']:
        for p in (root / folder).rglob('*'):
            if p.is_file(): assert p.read_bytes() == (application / p.relative_to(root)).read_bytes(), p
    edition = 'Apple-Silicon' if args.arch == 'arm64' else 'Intel'
    filename = f'Samee3-Mac-{release_version}-{edition}.zip'
    archive = args.output / filename
    descriptor, temporary = tempfile.mkstemp(prefix=filename, suffix='.tmp', dir=args.output); os.close(descriptor)
    temporary = Path(temporary)
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(target.rglob('*')):
            name = p.relative_to(args.work).as_posix()
            if p.is_symlink():
                info = zipfile.ZipInfo(name); info.create_system = 3; info.external_attr = (stat.S_IFLNK | 0o777) << 16; z.writestr(info, os.readlink(p).encode())
            elif p.is_file(): z.write(p, name)
        readme = root / 'README-AR.txt'
        if readme.exists(): z.write(readme, 'اقرأني-التثبيت.txt')
    with zipfile.ZipFile(temporary) as z:
        assert z.testzip() is None
        required = 'Samee3.app/Contents/Resources/app/main.cjs'
        assert z.read(required) == (root / 'main.cjs').read_bytes()
        assert stat.S_ISLNK(z.getinfo('Samee3.app/Contents/Frameworks/Electron Framework.framework/Versions/Current').external_attr >> 16)
    temporary.replace(archive)
    result = {'file': str(archive.resolve()), 'arch': args.arch, 'version': release_version, 'minimumMacOS': minimum,
              'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
              'signature': 'ad-hoc', 'developerIdSigned': False, 'appleNotarized': False,
              'verifiedMachOBinaries': all_macho, 'realMacExecutionTested': False}
    (args.work / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
