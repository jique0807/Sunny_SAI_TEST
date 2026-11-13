import test from 'node:test';
import assert from 'node:assert/strict';
import {withRouteRetry} from '../lib/route-recovery.mjs';
test('transient route failure recovers once and persistent failure stops',async()=>{
 let calls=0;assert.equal(await withRouteRetry(async()=>{if(++calls===1)throw Object.assign(Error(),{providerStatus:503});return 'route';}),'route');assert.equal(calls,2);
 calls=0;await assert.rejects(withRouteRetry(async()=>{calls++;throw new TypeError('network');}));assert.equal(calls,2);
});
test('credentials, quota and invalid route failures are not retried',async()=>{
 for(const meta of [{providerStatus:401},{providerStatus:403},{providerStatus:429},{status:422}]){let calls=0;await assert.rejects(withRouteRetry(async()=>{calls++;throw Object.assign(Error(),meta);}));assert.equal(calls,1);}
});
