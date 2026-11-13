import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyItsTransportFailure} from '../lib/its-transport-errors.mjs';

const wrapped=code=>new TypeError('fetch failed: SECRET-KEY https://test:9443',{
 cause:Object.assign(new Error('private-origin'),{code})
});
const cases=[
 ['ENOTFOUND','dns_error'],['EAI_AGAIN','dns_error'],
 ['ECONNREFUSED','connect_error'],['ENETUNREACH','connect_error'],
 ['ETIMEDOUT','timeout'],['UND_ERR_CONNECT_TIMEOUT','timeout'],
 ['CERT_HAS_EXPIRED','tls_error'],['ERR_TLS_CERT_ALTNAME_INVALID','tls_error']
];
for(const [code,expected] of cases)test('ITS transport classifies '+code+' without secret leakage',()=>{
 const out=classifyItsTransportFailure(wrapped(code));
 assert.equal(out.reasonCode,expected);
 assert.equal(out.status,'failed');
 assert.ok(!JSON.stringify(out).includes('SECRET-KEY'));
 assert.ok(!JSON.stringify(out).includes('9443'));
 assert.ok(!JSON.stringify(out).includes('private-origin'));
});
test('AbortSignal.timeout preserves explicit timeout reason',()=>{
 assert.equal(classifyItsTransportFailure(Object.assign(new Error('Aborted'),{name:'TimeoutError'})).reasonCode,'timeout');
});
test('nested AggregateError is classified and cannot emit raw cause',()=>{
 const out=classifyItsTransportFailure(new TypeError('SECRET-KEY',{cause:new AggregateError([
 Object.assign(new Error('private ip'),{code:'EHOSTUNREACH'})])}));
 assert.equal(out.reasonCode,'connect_error');
 assert.ok(!JSON.stringify(out).includes('private'));
});
test('unknown, invalid, cyclic and noisy errors fail closed',()=>{
 for(const v of [null,undefined,new Error('SECRET-KEY'),{cause:'str'}]){
  const out=classifyItsTransportFailure(v);
  assert.deepEqual(Object.keys(out),['status','reasonCode','reason']);
  assert.equal(out.reasonCode,'network_error');
 }
 const loop={};loop.cause=loop;
 assert.equal(classifyItsTransportFailure(loop).reasonCode,'network_error');
});
