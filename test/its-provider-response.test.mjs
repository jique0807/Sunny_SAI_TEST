import {test} from 'node:test';
import assert from 'node:assert/strict';
import {itsResultCode,itsProviderRejected,itsProviderRecords} from '../lib/its-provider-response.mjs';

test('official ITS nested lowercase JSON records are parsed',()=>{
 const response={response:{header:{resultcode:0,resultmsg:'SUCCESS'},body:{totalcount:1,
  items:{item:{coordx:127.01,coordy:37.5,eventType:'acc'}}}}};
 assert.equal(itsResultCode(response),'0');
 assert.equal(itsProviderRejected(response),false);
 assert.equal(itsProviderRecords(response).length,1);
 assert.equal(itsProviderRecords(response)[0].eventType,'acc');
});
test('official ITS nested traffic item is read',()=>{
 const result={response:{header:{resultcode:0},body:{totalcount:2,items:{item:[{linkid:'1',speed:20},{linkid:'2',speed:40}]}}}};
 assert.equal(itsProviderRecords(result).length,2);
});
test('explicit zero is empty, not an unknown schema',()=>{
 assert.deepEqual(itsProviderRecords({response:{body:{totalcount:0,items:{}}}}),[]);
 assert.equal(itsProviderRecords({response:{body:{unexpected:'shape'}}}),null);
 assert.equal(itsProviderRecords(null),null);
});
test('error code does not become a success or empty feed',()=>{
 const rejected={response:{header:{resultcode:'4005'},body:{totalcount:0,items:{}}}};
 assert.equal(itsProviderRejected(rejected),true);
 assert.equal(itsResultCode(rejected),'4005');
});
test('alternate legacy and direct data shapes still work',()=>{
 assert.equal(itsProviderRecords([{speed:5}]).length,1);
 assert.equal(itsProviderRecords({data:[{linkId:1,speed:0}]}).length,1);
 assert.equal(itsProviderRecords({response:{items:{item:[{speed:3}]}}}).length,1);
});
