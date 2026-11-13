// Offline validation of original KMA ZIP bytes, without credentials or deployment.
// Usage: node scripts/verify-kma-road-archive.mjs INPUT.zip ROAD_NUM OUTPUT.json
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {extractZipFiles,geolocatedRisks,ROAD_NAMES,KMA_ROAD_GRADE_DEFINITION} from '../lib/kma-road.mjs';
const [input,roadNum,output]=process.argv.slice(2);
if(!input||!output||!Object.hasOwn(ROAD_NAMES,roadNum))
 throw Error('Usage: node scripts/verify-kma-road-archive.mjs INPUT.zip ROAD_NUM OUTPUT.json');
const bytes=readFileSync(input),files=extractZipFiles(bytes),result=geolocatedRisks(files,roadNum);
const report={schema:'sunny-kma-road-archive-audit-v1',
 checkedAt:new Date().toISOString(),roadNum,archiveBytes:bytes.length,
 archiveSha256:createHash('sha256').update(bytes).digest('hex'),
 gradeDefinition:KMA_ROAD_GRADE_DEFINITION,fileCount:files.length,
 ...result,
 locationOutputLimit:350,
 limitation:'File bytes and code contract checked locally. Provider acquisition provenance and actual route intersection require separate evidence.',
 safeRouteCertified:false};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({fileCount:report.fileCount,recordCount:report.recordCount,
 gradeSummary:report.gradeSummary,returnedLocations:report.locations.length}));
