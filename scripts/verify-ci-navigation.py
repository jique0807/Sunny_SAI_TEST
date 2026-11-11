#!/usr/bin/env python3
"""Compare the browser's actual CI navigation against every NMSC reference pixel.
Requires numpy, h5py, node. Reference download URL is in the checked-in fixture.
"""
import argparse, hashlib, json, pathlib, subprocess
import h5py
import numpy as np

parser=argparse.ArgumentParser()
parser.add_argument('--reference',required=True)
parser.add_argument('--ci',help='Optional received CI NetCDF for category/quality statistics')
parser.add_argument('--output')
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
fixture=json.loads((root/'test/fixtures/gk2a-ci-navigation-reference.json').read_text())
digest=hashlib.sha256(pathlib.Path(args.reference).read_bytes()).hexdigest()
if digest!=fixture['sourceSha256']:
    raise SystemExit('Reference checksum changed; independently review the new NMSC reference before using it.')
js="""
import {ciPixelToLatLng,CI_NAVIGATION} from './public/gk2a-ci-navigation.mjs';
const buffer=Buffer.alloc(CI_NAVIGATION.width*CI_NAVIGATION.height*16);let offset=0;
for(let row=0;row<CI_NAVIGATION.height;row++)for(let col=0;col<CI_NAVIGATION.width;col++){
 const point=ciPixelToLatLng(col,row);buffer.writeDoubleLE(point?.lat??NaN,offset);
 buffer.writeDoubleLE(point?.lng??NaN,offset+8);offset+=16;
}
process.stdout.write(buffer);
"""
raw=subprocess.check_output(['node','--input-type=module','-e',js],cwd=root)
actual=np.frombuffer(raw,dtype='<f8').reshape(1200,1900,2)
with h5py.File(args.reference) as f:
    lat=f['lat'][:].astype(float);lon=f['lon'][:].astype(float)
errors=np.hypot((actual[:,:,0]-lat)*111195,
                (actual[:,:,1]-lon)*111195*np.cos(np.deg2rad(lat)))
result={'source':fixture['source'],'sourceSha256':digest,'implementation':'public/gk2a-ci-navigation.mjs',
        'count':errors.size,'nonfinite':int((~np.isfinite(errors)).sum()),
        'rmseMeters':float(np.sqrt(np.mean(errors**2))),
        'maxMeters':float(np.max(errors)),'p99Meters':float(np.percentile(errors,99)),
        'acceptance':{'maxMeters':20,'rmseMeters':5},
        'scope':'Coordinate transform relative to the published standard grid, not satellite physical geolocation accuracy'}
result['passed']=result['nonfinite']==0 and result['maxMeters']<20 and result['rmseMeters']<5
if args.ci:
    with h5py.File(args.ci) as f:
        ci=f['CI1_prob'][:];quality=f['DQF_CI1'][:]
        if ci.shape!=(1200,1900) or quality.shape!=ci.shape:raise SystemExit('Unexpected CI shape')
        valid=(ci<=4)&(quality==1)
        result['sample']={'shape':list(ci.shape),'fillPixels':int((ci==255).sum()),
            'usablePixels':int(valid.sum()),'previousObjectMissingPixels':int((quality==0).sum()),
            'usableCategoryCounts':{str(i):int(((ci==i)&valid).sum()) for i in range(5)},
            'sourceSweepAttribute':str(f['gk2a_imager_projection'].attrs['sweep_angle_axis'])}
text=json.dumps(result,ensure_ascii=False,indent=2)
if args.output:pathlib.Path(args.output).write_text(text+'\n')
print(text)
raise SystemExit(0 if result['passed'] else 1)
