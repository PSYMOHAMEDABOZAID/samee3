const $=id=>document.getElementById(id), api=window.Samee3Windows
const boolean=['quran','adhkar','hadith','prayer','audio','library','fullAdhan','systemTimezone','openAtLogin']
const numbers=['hadithHours','hadithStart','hadithEnd','method','school','volume']
const strings=['quranTime','morningTime','eveningTime','audioTime','libraryTime','city','country','timezone','adhanVoice','fajrVoice']
let loaded=false,busy=false
function status(s){
 if(!loaded){for(const k of boolean)$(k).checked=!!s.settings[k];for(const k of [...numbers,...strings])$(k).value=s.settings[k];loaded=true}
 $('timezone').disabled=$('systemTimezone').checked
 $('calendar-status').textContent=s.calendarLoading?'جارٍ تنزيل مواقيت الصلاة…':s.calendarError||(s.calendarUntil?'المواقيت محفوظة حتى '+s.calendarUntil:'لم يُنزّل جدول الصلاة بعد.')
 if(s.notificationError)$('error').textContent=s.notificationError
 const labels={quran:'ورد القرآن',morning:'أذكار الصباح',evening:'أذكار المساء',hadith:'حديث',audio:'الاستماع',library:'المكتبة',Fajr:'الفجر',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'}
 $('next-times').replaceChildren()
 const next=Object.entries(s.next).filter(([,v])=>Number.isFinite(v)).sort((a,b)=>a[1]-b[1])
 if(!next.length)$('next-times').textContent='لم تُفعّل مواعيد بعد، أو لم يُنزّل جدول الصلاة.'
 for(const[k,at]of next){const p=document.createElement('p');p.textContent=labels[k]+' — '+new Intl.DateTimeFormat('ar',{timeZone:s.settings.timezone,dateStyle:'short',timeStyle:'short'}).format(at);$('next-times').append(p)}
}
function form(){const v={};for(const k of boolean)v[k]=$(k).checked;for(const k of numbers)v[k]=Number($(k).value);for(const k of strings)v[k]=$(k).value;return v}
async function command(action,payload,message){if(busy)return;busy=true;$('error').textContent='';$('notice').textContent='';$('save').disabled=true;try{const s=await api.request(action,payload);status(s);if(message)$('notice').textContent=message}catch(e){$('error').textContent=e.message}finally{busy=false;$('save').disabled=false}}
$('settings-form').addEventListener('submit',event=>{event.preventDefault();void command('saveSettings',form(),'حُفظت التذكيرات على هذا الجهاز. اسمح بإشعارات سميع من إعدادات النظام لتظهر التنبيهات.')})
$('test').addEventListener('click',()=>void command('testNotification',null,'طُلب إشعار حديث من النظام. راجع مركز الإشعارات وإذن سميع في Windows.'))
$('notification-settings').addEventListener('click',()=>void command('notificationSettings'))
$('calendar-refresh').addEventListener('click',()=>void command('refreshCalendar',null,'انتهى طلب تحديث المواقيت للموقع المحفوظ. راجع حالة الجدول أعلاه.'))
$('preview').addEventListener('click',()=>void command('preview',{id:$('adhanVoice').value,volume:Number($('volume').value)},'بدأت معاينة المؤذن.'))
$('preview-fajr').addEventListener('click',()=>void command('preview',{id:$('fajrVoice').value,volume:Number($('volume').value)},'بدأت معاينة الفجر.'))
$('stop').addEventListener('click',()=>void command('stop',null,'أُوقف تشغيل الأذان.'))
$('systemTimezone').addEventListener('change',()=>{$('timezone').disabled=$('systemTimezone').checked;if($('systemTimezone').checked)$('timezone').value=Intl.DateTimeFormat().resolvedOptions().timeZone})
;(async()=>{try{const r=await fetch('../data/adhan-catalog.json');if(!r.ok)throw Error('تعذر فتح الأصوات.');const catalog=await r.json();$('adhanVoice').replaceChildren(...catalog.voices.filter(v=>!v.fajr).map(v=>new Option(v.name,v.id)));$('fajrVoice').replaceChildren(...catalog.voices.map(v=>new Option(v.name+(v.fajr?' — خاص بالفجر':''),v.id)));status(await api.request('status'));api.onState(status)}catch(e){$('error').textContent=e.message}})()
