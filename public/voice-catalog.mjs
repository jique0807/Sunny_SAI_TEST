// Provider voice IDs, not credentials. Selection must remain available without a list API call.
const studio=[['Kore','또렷한 목소리'],['Aoede','산뜻한 목소리'],['Sulafat','따뜻한 목소리'],['Achernar','부드러운 목소리'],['Puck','밝고 경쾌한 목소리'],['Charon','차분한 설명'],['Zephyr','밝은 목소리'],['Gacrux','성숙한 목소리']];
export function voiceCatalog(provider='gemini') {return studio.map(([name,label])=>({name:provider==='cloud'?'ko-KR-Chirp3-HD-'+name:name,label:name+' · '+label+(provider==='cloud'?' · Chirp 3 HD':'')}));}
export function validVoice(provider,name){return provider==='gemini'?studio.some(v=>v[0]===name):/^ko-KR-(Chirp3-HD|Neural2|Wavenet|Standard)-[A-Za-z]+$/.test(name);}
