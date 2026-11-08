const audio=document.getElementById('audio');let generation=0
window.Samee3Windows.onAudio(async request=>{generation=request.generation||0;audio.pause();audio.removeAttribute('src');audio.load();if(request.stop)return;if(!/^[a-z0-9-]+$/.test(request.id))return;audio.src='../data/adhan/'+request.id+'.mp3';audio.volume=request.volume;try{await audio.play()}catch{await window.Samee3Windows.request('audioEnded',{generation})}})
for(const event of ['ended','error'])audio.addEventListener(event,()=>void window.Samee3Windows.request('audioEnded',{generation}))
