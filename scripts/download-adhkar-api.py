#!/usr/bin/env python3
"""Download SAMEE3 individual clips, variants and complete source recordings."""
import argparse,concurrent.futures,hashlib,json,re,time
from pathlib import Path
from urllib.parse import urljoin,urlparse
from urllib.request import Request,urlopen

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--base-url',default='https://samee3.vercel.app');p.add_argument('--reciter',default='hamad-al-drehem');p.add_argument('--all',action='store_true');p.add_argument('--include-variants',action='store_true');p.add_argument('--include-sections',action='store_true');p.add_argument('--output',default='samee3-adhkar-download');args=p.parse_args()
 base=args.base_url.rstrip('/')+'/';parsed=urlparse(base)
 if parsed.scheme not in {'https','http'} or parsed.username or parsed.password or parsed.query or parsed.fragment:raise ValueError('Use an HTTP(S) site URL without credentials or query')
 with urlopen(Request(urljoin(base,'data/adhkar-audio/v1/catalog.json'),headers={'User-Agent':'SAMEE3-Developer-Downloader/2.0'}),timeout=45) as response:data=json.load(response)
 allowed={r['id'] for r in data['reciters']}
 if not args.all and args.reciter not in allowed:raise ValueError('Unknown reciter')
 readers=allowed if args.all else {args.reciter};items=[];clips={}
 for row in data['items']:
  recordings={r:c for r,c in row['recordings'].items() if r in readers}
  variants={r:contexts for r,contexts in row.get('variants',{}).items() if r in readers} if args.all or args.include_variants else {}
  if not recordings and not variants:continue
  items.append({**row,'recordings':recordings,'variants':variants})
  for clip in recordings.values():clips[clip['url']]=clip
  for contexts in variants.values():
   for clip in contexts.values():clips[clip['url']]=clip
 sections=[s for s in data.get('sectionRecordings',[]) if s['readerId'] in readers] if args.all or args.include_sections else []
 for clip in sections:clips[clip['url']]=clip
 root=Path(args.output).resolve();root.mkdir(parents=True,exist_ok=True)
 (root/'catalog.json').write_text(json.dumps({'datasetVersion':data['datasetVersion'],'rights':data['rights'],'selectedReaders':sorted(readers),'audioFileCount':len(clips),'items':items,'sectionRecordings':sections},ensure_ascii=False,indent=2)+'\n')
 def download(clip):
  path=clip['url']
  if not re.fullmatch(r'/audio/adhkar/[a-z0-9-]+/(?:\d{3}/\d{3}(?:-\d{3}(?:-(?:morning|evening))?)?|sections/\d{3})\.mp3',path):raise ValueError('Invalid media path')
  target=root/path.removeprefix('/audio/adhkar/');target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists() and target.stat().st_size==clip['bytes'] and hashlib.sha256(target.read_bytes()).hexdigest()==clip['sha256']:return
  url=urljoin(base,path)
  if urlparse(url).netloc!=parsed.netloc:raise ValueError('Unexpected media host')
  temporary=target.with_suffix('.part')
  for attempt in range(3):
   try:
    size=0;digest=hashlib.sha256()
    with urlopen(Request(url,headers={'User-Agent':'SAMEE3-Developer-Downloader/2.0'}),timeout=45) as response,temporary.open('wb') as out:
     while chunk:=response.read(131072):
      size+=len(chunk)
      if size>clip['bytes']:raise ValueError('Unexpected audio size')
      digest.update(chunk);out.write(chunk)
    if size!=clip['bytes'] or digest.hexdigest()!=clip['sha256']:raise ValueError('Incomplete or changed audio: '+path)
    temporary.replace(target);return
   except Exception:
    temporary.unlink(missing_ok=True)
    if attempt==2:raise
    time.sleep(attempt+1)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for done,_ in enumerate(pool.map(download,clips.values()),1):print(f'{done}/{len(clips)}',flush=True)
 print(f'Downloaded {len(clips)} audio files to {root}')
if __name__=='__main__':main()
