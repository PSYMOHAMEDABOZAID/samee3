#!/usr/bin/env python3
"""MP3Quran full-mushaf scanner. Does NOT invent or reorder ayah/surah assets."""
from __future__ import annotations
import concurrent.futures
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import requests

MANIFEST=Path('lib/alafasy-riwayat-manifest.json')
API='https://mp3quran.net/api/v3/reciters?language=ar'
ALL=','.join(str(i) for i in range(1,115))
SESSION=requests.Session()
SESSION.headers.update({'User-Agent':'SAMEE3-Verified-Recitation-Scanner/3.0'})
LABELS={
  'حفص عن عاصم': ('حفص',),
  'شعبة عن عاصم': ('شعبه',),
  'ابن ذكوان عن ابن عامر': ('ابن ذكوان',),
  'الدوري عن الكسائي': ('الدوري عن الكسائي',),
  'خلف العاشر': ('خلف العاشر',),
  'الدوري عن أبي عمرو': ('الدوري عن ابي عمرو',),
  'ورش عن نافع': ('ورش',),
  'قالون عن نافع': ('قالون',),
  'السوسي عن أبي عمرو': ('السوسي',),
  'البزي عن ابن كثير': ('البزي',),
  'قنبل عن ابن كثير': ('قنبل',),
  'ابو الحارث عن الكسائي': ('ابو الحارث',),
  'رويس عن يعقوب': ('رويس',),
  'روح عن يعقوب': ('روح عن يعقوب',),
  'هشام عن ابن عامر': ('هشام',),
  'خلف عن حمزة': ('خلف عن حمزه',),
  'اسحاق عن خلف العاشر': ('اسحاق',),
  'ادريس عن خلف العاشر': ('ادريس',),
}

def norm(s:object)->str:
  v=unicodedata.normalize('NFKD',str(s or ''))
  v=''.join(ch for ch in v if not unicodedata.combining(ch))
  return re.sub(r'\s+',' ',v.translate(str.maketrans('إأآةى','اااهي')).lower()).strip()

def narration(moshaf_name:str)->str|None:
  n=norm(moshaf_name)
  # Distinguish the combined Khalaf al-Ashir mushaf from individual transmitters.
  if 'خلف العاشر' in n and 'اسحاق' in n and 'ادريس' in n:
    return 'خلف العاشر'
  if 'اسحاق' in n and 'خلف العاشر' in n:
    return 'اسحاق عن خلف العاشر'
  if 'ادريس' in n and 'خلف العاشر' in n:
    return 'ادريس عن خلف العاشر'
  for value, needles in LABELS.items():
    if any(needle in n for needle in needles):
      if value=='حفص عن عاصم' and not any(k in n for k in ('روايات','العشر','2024','2025','2026')):
        return None # Do not re-label existing ordinary Hafs mushaf as a new edition.
      return value
  return None

def full(m:dict)->bool:
  try:
    nums=[int(v.strip()) for v in m.get('surah_list','').split(',')]
    return int(m.get('surah_total',0))==114 and len(nums)==114 and set(nums)==set(range(1,115))
  except (ValueError,TypeError,AttributeError):
    return False

def trusted(url:str)->bool:
  try:
    p=urlparse(url)
    h=(p.hostname or '').lower()
    return p.scheme=='https' and not p.username and not p.password and (h=='mp3quran.net' or h.endswith('.mp3quran.net'))
  except ValueError:
    return False

def check_track(job:tuple[int,str])->tuple[int,bool]:
  n,base=job
  url=f'{base}{n:03d}.mp3'
  try:
    with SESSION.get(url,headers={'Range':'bytes=0-2047'},timeout=(6,15),stream=True) as resp:
      if resp.status_code not in (200,206) or not trusted(resp.url):return n,False
      ctype=resp.headers.get('content-type','').lower()
      if 'html' in ctype or 'json' in ctype or 'text/plain' in ctype:return n,False
      sample=next(resp.iter_content(256),b'')
      # MP3 ID3 tag or MPEG sync header. A content type alone isn't proof of audio.
      is_mp3=sample.startswith(b'ID3') or (len(sample)>1 and sample[0]==255 and sample[1]&224==224)
      return n,is_mp3
  except (requests.RequestException,ValueError,StopIteration):
    return n,False

def verify(base:str)->bool:
  jobs=[(n,base) for n in range(1,115)]
  with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results=dict(pool.map(check_track,jobs))
  failures=[n for n in range(1,115) if not results.get(n)]
  if failures:
    print('SKIP incomplete/unreachable recording:',base,'invalid tracks:',failures[:12], 'count',len(failures))
  return not failures

def main():
  if not MANIFEST.exists():raise SystemExit('Manifest missing')
  original=json.loads(MANIFEST.read_text('utf-8'))
  entries={e['key']:e for e in original.get('entries',[]) if isinstance(e,dict) and isinstance(e.get('key'),str)}
  try:
    response=SESSION.get(API,timeout=(9,35));response.raise_for_status()
    reciters=response.json().get('reciters',[])
    if not isinstance(reciters,list):raise ValueError('Invalid reciter list')
  except (requests.RequestException,ValueError) as exc:
    # Don't erase the last known catalog on transient API failures.
    print('Source unavailable, preserving previous verified catalog:',exc)
    return
  added=0
  for r in reciters:
    if not isinstance(r,dict) or not ('مشاري' in norm(r.get('name','')) and 'العفاسي' in norm(r.get('name',''))):continue
    for m in r.get('moshaf',[]):
      if not isinstance(m,dict) or not full(m):continue
      name=narration(str(m.get('name','')))
      if not name:continue
      source_id=m.get('id')
      if not isinstance(source_id,int) or source_id<1:continue
      key=f'mp3quran-{source_id}'
      if key in entries and entries[key].get('verified') is True:continue
      url=str(m.get('server','')).rstrip('/')+'/'
      if not trusted(url):continue
      print('Checking 114 audio files:',key,name)
      if not verify(url):continue
      entries[key]={
        'key':key,'id':3000000+source_id,'name':str(m.get('name','')),
        'riwaya':name,'server':url,'surah_total':114,'surah_list':ALL,
        'source_url':'https://www.mp3quran.net/ar',
        'verified':True,'verified_at':datetime.now(timezone.utc).isoformat(),
      }
      print('VERIFIED',key,name)
      added+=1
  if added:
    content={'version':3,'updatedAt':datetime.now(timezone.utc).isoformat(),
             'entries':sorted(entries.values(),key=lambda e:e['key'])}
    MANIFEST.write_text(json.dumps(content,ensure_ascii=False,indent=2)+'\n','utf-8')
  print('Verified new editions:',added,'Catalog count:',len(entries))
if __name__=='__main__':main()
