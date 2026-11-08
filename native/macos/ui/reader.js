const $ = id => document.getElementById(id)
const names = [['hafs','حفص عن عاصم','QuranHafs'],['warsh','ورش عن نافع','QuranWarsh'],['qalun','قالون عن نافع','QuranQalun'],['douri','الدوري عن أبي عمرو','QuranDouri'],['shubah','شعبة عن عاصم','QuranShubah'],['sousi','السوسي عن أبي عمرو','QuranSousi'],['bazzi','البزي عن ابن كثير','QuranBazzi']]
let prefs = {}, reading = 'hafs', model, page = 1, generation = 0, searchTimer, searchGeneration = 0
try { prefs = JSON.parse(localStorage.getItem('samee3-mac-reader-v1') || '{}') } catch {}
if (names.some(n => n[0] === prefs.reading)) reading = prefs.reading
function save() { prefs.reading = reading; prefs.pages ||= {}; prefs.pages[reading] = page; try { localStorage.setItem('samee3-mac-reader-v1', JSON.stringify(prefs)) } catch {} }
function message(text) { $('reader-message').textContent = text }
function normalize(text) { return text.replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\ufeff\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/\s+/g,' ').trim() }
function arabic(number) { return new Intl.NumberFormat('ar').format(number) }
function render() {
  if (!model) return
  const verses = model.pages[page-1], article = $('quran'); article.replaceChildren()
  document.body.style.setProperty('--qfont', names.find(n => n[0] === reading)[2])
  $('reading-name').textContent = model.name
  const seen = [...new Set(verses.map(v => v.s))]
  $('page-title').textContent = seen.map(s => 'سورة ' + model.surahs[s-1].name).join(' · ')
  for (const verse of verses) {
    if (verse.a === 1) {
      const heading = document.createElement('h2'); heading.className = 'surah-heading'; heading.textContent = 'سورة ' + model.surahs[verse.s-1].name; article.append(heading)
      if (verse.s !== 1 && verse.s !== 9) { const b = document.createElement('span'); b.className='bismillah'; b.textContent=model.bismillah; article.append(b) }
    }
    const span = document.createElement('span'); span.className = 'verse'; span.tabIndex=0; span.dataset.ayah = `${verse.s}:${verse.a}`; span.title = 'اضغط لنسخ الآية'; span.setAttribute('role','button')
    const text = document.createElement('span'); text.className = 'verse-text'; text.textContent = verse.text
    const number = document.createElement('span'); number.className='verse-number'; number.textContent='﴿'+arabic(verse.a)+'﴾'
    span.append(text,number)
    const copy = async () => { try { await window.Samee3Mac.request('copy',verse.text+'\nسورة '+model.surahs[verse.s-1].name+' — '+verse.a+' — '+model.name); article.querySelectorAll('.selected').forEach(e=>e.classList.remove('selected'));span.classList.add('selected');message('نُسخت الآية.') } catch(e){message(e.message)} }
    span.addEventListener('click',copy);span.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void copy()}})
    article.append(span,document.createTextNode(' '))
  }
  $('page-number').value=page; $('surah').value=verses[0].s; $('juz').value=verses[0].juz
  $('page-meta').textContent='الصفحة '+arabic(page)+' / ٦٠٤ · الجزء '+arabic(verses[0].juz)
  $('previous').disabled=page===1; $('next').disabled=page===604
  const marked=prefs.bookmarks?.[reading]===page; $('bookmark').textContent=marked?'الصفحة محفوظة ★':'حفظ علامة ☆';$('bookmark').setAttribute('aria-pressed',String(marked))
  save()
}
function go(value) { const n=Number(value); if(!Number.isInteger(n)||n<1||n>604)return message('اختر صفحة من ١ إلى ٦٠٤.');page=n;render();window.scrollTo({top:0});message('') }
async function load(id) {
  const serial=++generation;searchGeneration++;$('results').replaceChildren();$('search-status').textContent='';reading=id;model=null;message('جارٍ فتح الرواية المحفوظة…')
  try {
    const response=await fetch('../data/content/'+id+'.json');if(!response.ok)throw Error('تعذر فتح ملف الرواية.')
    const data=await response.json();if(serial!==generation)return
    if(data.pages.length!==604||data.surahs.length!==114)throw Error('بيانات الرواية غير مكتملة.')
    model=data;page=Math.max(1,Math.min(604,Number(prefs.pages?.[id])||1))
    $('surah').replaceChildren(...model.surahs.map(s=>new Option(arabic(s.number)+' — '+s.name,String(s.number))))
    $('juz').replaceChildren(...model.juzStarts.map(j=>new Option('الجزء '+arabic(j.number),String(j.number))))
    render();message('الضغط على أي آية ينسخ نصها ومرجعها.')
  }catch(e){if(serial===generation)message(e.message)}
}
async function search() {
  const data=model,id=reading,serial=++searchGeneration,query=normalize($('search').value)
  $('results').replaceChildren(); if(!data||query.length<2){$('search-status').textContent='اكتب حرفين على الأقل.';return}
  const found=[];let count=0
  for(let p=0;p<data.pages.length;p++)for(const verse of data.pages[p])if(normalize(verse.text).includes(query)){count++;if(found.length<100)found.push({verse,page:p+1})}
  if(serial!==searchGeneration||id!==reading)return
  $('search-status').textContent=`${arabic(count)} نتيجة`+(count>100?' — أول ١٠٠ نتيجة':'')
  for(const result of found){const button=document.createElement('button');button.textContent=data.surahs[result.verse.s-1].name+' — '+arabic(result.verse.a)+' · ص '+arabic(result.page)+'\n'+result.verse.text;button.addEventListener('click',()=>{go(result.page);document.querySelector(`[data-ayah="${result.verse.s}:${result.verse.a}"]`)?.classList.add('selected')});$('results').append(button)}
}
$('reading').replaceChildren(...names.map(n=>new Option(n[1],n[0])));$('reading').value=reading
$('reading').addEventListener('change',()=>void load($('reading').value));$('surah').addEventListener('change',()=>{if(model)go(model.surahs.find(s=>s.number===Number($('surah').value)).page)})
$('juz').addEventListener('change',()=>{if(model)go(model.juzStarts.find(j=>j.number===Number($('juz').value)).page)})
$('page-form').addEventListener('submit',e=>{e.preventDefault();go($('page-number').value)})
$('previous').addEventListener('click',()=>go(page-1));$('next').addEventListener('click',()=>go(page+1))
$('bookmark').addEventListener('click',()=>{prefs.bookmarks||={};if(prefs.bookmarks[reading]===page)delete prefs.bookmarks[reading];else prefs.bookmarks[reading]=page;render()})
$('go-bookmark').addEventListener('click',()=>prefs.bookmarks?.[reading]?go(prefs.bookmarks[reading]):message('لم تُحفظ علامة لهذه الرواية بعد.'))
function style(){document.body.classList.toggle('night',!!prefs.night);$('night').setAttribute('aria-pressed',String(!!prefs.night));document.body.style.setProperty('--qsize',Math.max(24,Math.min(60,Number(prefs.fontSize)||32))+'px');save()}
$('night').addEventListener('click',()=>{prefs.night=!prefs.night;style()});$('smaller').addEventListener('click',()=>{prefs.fontSize=Math.max(24,(Number(prefs.fontSize)||32)-2);style()});$('larger').addEventListener('click',()=>{prefs.fontSize=Math.min(60,(Number(prefs.fontSize)||32)+2);style()})
$('search-button').addEventListener('click',()=>void search());$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,300)})
document.addEventListener('keydown',event=>{if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||event.metaKey||event.ctrlKey||event.altKey)return;if(event.key==='ArrowLeft'&&page<604){event.preventDefault();go(page+1)}if(event.key==='ArrowRight'&&page>1){event.preventDefault();go(page-1)}})
document.body.classList.toggle('night',!!prefs.night);document.body.style.setProperty('--qsize',Math.max(24,Math.min(60,Number(prefs.fontSize)||32))+'px');void load(reading)
