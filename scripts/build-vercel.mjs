import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'build','--webpack'],{stdio:'inherit',env:{...process.env,SUNNY_VERCEL_BUILD:'1'}});
if(result.error){console.error('Next.js build could not start. Install the locked dependencies first.');process.exit(1);}
process.exit(result.status??1);
