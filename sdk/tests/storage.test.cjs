const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {create,MAX_VALUE_BYTES,MAX_APP_BYTES}=require('../host/storage.cjs');
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-storage-'));return {root,service:create({root}),async close(){await fs.rm(root,{recursive:true,force:true});}};}
const key=value=>Buffer.from(value,'ascii');
test('save, load, overwrite, existence, delete and missing keys',async t=>{
 const f=await fixture();t.after(()=>f.close());const value=Buffer.from([0,1,127,255]);
 await f.service.save('counter-app',key('count'),value);assert.deepEqual(await f.service.load('counter-app',key('count')),value);assert.equal(await f.service.exists('counter-app',key('count')),true);
 await f.service.save('counter-app',key('count'),Buffer.from([3]));assert.deepEqual(await f.service.load('counter-app',key('count')),Buffer.from([3]));
 assert.equal(await f.service.delete('counter-app',key('count')),true);assert.equal(await f.service.delete('counter-app',key('count')),false);assert.equal(await f.service.load('counter-app',key('count')),null);assert.equal(await f.service.exists('counter-app',key('count')),false);
});
test('data survives a new service instance and remains isolated by app id',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.service.save('first-app',key('shared'),Buffer.from('first'));
 const restarted=create({root:f.root});assert.deepEqual(await restarted.load('first-app',key('shared')),Buffer.from('first'));assert.equal(await restarted.load('other-app',key('shared')),null);
 await restarted.save('other-app',key('shared'),Buffer.from('other'));assert.deepEqual(await restarted.load('first-app',key('shared')),Buffer.from('first'));
});
test('rejects malformed app ids, traversal keys, invalid bytes and oversized values',async t=>{
 const f=await fixture();t.after(()=>f.close());
 for(const id of ['../other','Hello','a'.repeat(49)])await assert.rejects(f.service.load(id,key('x')),/Invalid app id/);
 for(const name of ['../other','..','/absolute','a/b','a\\b','', 'bad\nkey','x'.repeat(65)])await assert.rejects(f.service.load('valid-app',key(name)),/Invalid storage key/);
 await assert.rejects(f.service.save('valid-app',key('large'),Buffer.alloc(MAX_VALUE_BYTES+1)),/Invalid storage value/);
});
test('enforces per-app quota without damaging existing values',async t=>{
 const f=await fixture();t.after(()=>f.close());const value=Buffer.alloc(MAX_VALUE_BYTES,7);let rejected=false;
 for(let index=0;index<100;index++)try{await f.service.save('quota-app',key('key-'+index),value);}catch(error){assert.match(error.message,/quota/i);rejected=true;break;}
 assert.equal(rejected,true);assert.deepEqual(await f.service.load('quota-app',key('key-0')),value);
 const file=(await fs.readdir(f.root))[0];assert.ok((await fs.stat(path.join(f.root,file))).size<=MAX_APP_BYTES);
});
test('reports failed writes instead of acknowledging them',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-storage-fail-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const service=create({root}),rename=fs.rename;fs.rename=async()=>{const error=Error('simulated disk failure');error.code='EIO';throw error;};
 try{await assert.rejects(service.save('write-fail',key('key'),Buffer.from('value')),error=>error.code==='STORAGE'&&/write failed/i.test(error.message));}
 finally{fs.rename=rename;}
});