import {validVoice} from '../public/voice-catalog.mjs';
export function voiceError(status){
 if(status===400)return 'Google 요청 거절(400): 선택한 API 종류와 키 제한을 확인해주세요.';
 if(status===401||status===403)return 'Google 인증 거절('+status+'): 키 발급 서비스(Gemini/Cloud TTS), API 활성화 및 키의 호출 제한을 확인해주세요.';
 if(status===429)return 'Google 사용 한도 초과(429): 해당 키 프로젝트의 결제·할당량을 확인하고 잠시 뒤 다시 시도해주세요.';
 if(status===404)return 'Google 음성 모델을 사용할 수 없습니다(404). 해당 프로젝트의 모델 접근 권한을 확인해주세요.';
 return 'Google 음성 응답을 받지 못했습니다'+(status?'('+status+')':'')+'. 잠시 뒤 다시 시도해주세요.';
}
export function pcmWav(base64,rate=24000){
 const pcm=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));if(!pcm.length||pcm.length%2)throw Error('Invalid PCM');
 const out=new Uint8Array(44+pcm.length),v=new DataView(out.buffer),write=(offset,s)=>{for(let i=0;i<s.length;i++)out[offset+i]=s.charCodeAt(i);};
 write(0,'RIFF');v.setUint32(4,36+pcm.length,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,pcm.length,true);out.set(pcm,44);
 let binary='';for(let i=0;i<out.length;i+=8192)binary+=String.fromCharCode(...out.subarray(i,i+8192));return btoa(binary);
}
export async function synthesize({key,provider='cloud',voiceName,text,rate=1},fetcher=fetch){
 const name=voiceName||(provider==='gemini'?'Kore':'ko-KR-Chirp3-HD-Kore');
 if(!['gemini','cloud'].includes(provider)||!validVoice(provider,name))throw Object.assign(Error('지원하는 목소리를 선택해주세요.'),{status:400});
 const speed=Number.isFinite(rate)?Math.max(.7,Math.min(1.3,rate)):1;
 const url=provider==='gemini'?'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent':'https://texttospeech.googleapis.com/v1/text:synthesize';
 const body=provider==='gemini'?{contents:[{parts:[{text:'다음 문장만 한국어로 자연스럽고 따뜻하게 읽어주세요. 안내방송처럼 과장하지 말고 사람과 대화하듯 읽어주세요. '+(speed<1?'조금 천천히. ':speed>1?'조금 빠르게. ':'')+'\n\n'+text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:name}}}}}:{input:{text},voice:{languageCode:'ko-KR',name},audioConfig:{audioEncoding:'MP3',speakingRate:speed}};
 let response;try{response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});}catch{throw Error(voiceError());}
 if(!response.ok){await response.body?.cancel();throw Error(voiceError(response.status));}
 let data;try{data=await response.json();}catch{throw Error('Google 음성 응답 형식이 올바르지 않습니다.');}
 if(provider==='cloud'){if(typeof data.audioContent!=='string'||!data.audioContent.length||data.audioContent.length>8000000)throw Error('Google 음성 데이터가 비어 있습니다.');return {audioContent:data.audioContent,mimeType:'audio/mpeg',provider,voiceName:name};}
 const part=data.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data)?.inlineData;
 if(!part||typeof part.data!=='string'||part.data.length>8000000)throw Error('Gemini가 오디오를 반환하지 않았습니다. 문장을 짧게 줄여 다시 시도해주세요.');
 if(part.mimeType==='audio/wav')return {audioContent:part.data,mimeType:'audio/wav',provider,voiceName:name};
 if(!/^audio\/(L16|pcm)(;|$)/i.test(part.mimeType||''))throw Error('지원하지 않는 Gemini 오디오 형식입니다.');
 const sampleRate=Number(part.mimeType.match(/rate=(\d+)/)?.[1]||24000);if(![16000,24000,48000].includes(sampleRate))throw Error('지원하지 않는 오디오 주파수입니다.');
 return {audioContent:pcmWav(part.data,sampleRate),mimeType:'audio/wav',provider,voiceName:name};
}
