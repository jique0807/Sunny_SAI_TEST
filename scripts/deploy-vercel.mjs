import { fileURLToPath } from 'node:url';
const APP_KEYS=['APP_ORIGIN','SESSION_SECRET','KAKAO_REST_API_KEY','KAKAO_JAVASCRIPT_KEY','VWORLD_API_KEY'];
export function validate(env){
 const required=['VERCEL_TOKEN','VERCEL_PROJECT_ID','GITHUB_SHA','GITHUB_REPOSITORY_ID',...APP_KEYS];
 const missing=required.filter(k=>!env[k]?.trim());
 if(missing.length)throw Error('Missing GitHub Secrets / workflow settings: '+missing.join(', '));
 const origin=new URL(env.APP_ORIGIN);
 if(origin.protocol!=='https:'||origin.origin!==env.APP_ORIGIN||origin.username||origin.password)throw Error('APP_ORIGIN must be the exact HTTPS production origin, without a trailing slash.');
 if(env.SESSION_SECRET.length<43)throw Error('SESSION_SECRET must contain at least 43 random characters.');
 if(!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA)||!/^\d+$/.test(env.GITHUB_REPOSITORY_ID))throw Error('Invalid workflow commit or repository ID.');
 return true;
}
export async function deploy(env,fetcher=fetch,{wait=ms=>new Promise(r=>setTimeout(r,ms)),report=console.log}={}){
 validate(env);
 const api=async(path,method='GET',payload)=>{
  const url=new URL(path,'https://api.vercel.com');if(env.VERCEL_TEAM_ID)url.searchParams.set('teamId',env.VERCEL_TEAM_ID);
  let r;try{r=await fetcher(url.toString(),{method,headers:{Authorization:'Bearer '+env.VERCEL_TOKEN,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(30000)});}catch{throw Error('Vercel request could not complete. No secret values are logged.');}
  if(!r.ok)throw Error(`Vercel API request failed (HTTP ${r.status}). Check token, project access and Git integration.`);
  try{return await r.json();}catch{throw Error('Invalid Vercel response.');}
 };
 const project=await api('/v9/projects/'+encodeURIComponent(env.VERCEL_PROJECT_ID));
 // Refuse to write secrets to a project bound to a different source repository.
 if(String(project.link?.repoId)!==env.GITHUB_REPOSITORY_ID||project.link?.type!=='github')throw Error('Import this GitHub repository into the selected Vercel project first. Repository binding does not match.');
 for(const key of [...APP_KEYS,...(env.KMA_API_KEY?.trim()?['KMA_API_KEY']:[])]){await api('/v10/projects/'+encodeURIComponent(env.VERCEL_PROJECT_ID)+'/env?upsert=true','POST',{key,value:env[key],type:'encrypted',target:['production']});report('Configured production secret: '+key);}
 const created=await api('/v13/deployments','POST',{name:project.name,project:project.id,target:'production',gitSource:{type:'github',repoId:Number(env.GITHUB_REPOSITORY_ID),ref:env.GITHUB_SHA},projectSettings:{framework:'nextjs',buildCommand:'pnpm build:vercel',installCommand:'pnpm install --frozen-lockfile'}});
 if(!created.id)throw Error('Vercel did not return a deployment ID.');
 report('Deployment started for the selected main commit.');
 for(let i=0;i<90;i++){
  const state=await api('/v13/deployments/'+encodeURIComponent(created.id));
  if(state.readyState==='READY'){report('Production deployment ready: '+env.APP_ORIGIN);return {id:created.id,origin:env.APP_ORIGIN};}
  if(['ERROR','CANCELED'].includes(state.readyState))throw Error('Vercel deployment did not complete. Inspect its build log in Vercel.');
  await wait(10000);
 }
 throw Error('Deployment is still pending. Inspect the existing deployment in Vercel before retrying.');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){deploy(process.env).catch(e=>{console.error(e.message);process.exitCode=1;});}
