const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {tool}=require('../../scripts/toolchain.cjs');

const ROOT=path.resolve(__dirname,'../..'),BUFFER_BYTES=8*1024*1024;
const EXT=0x7f0000,EVENT_OFFSET=5152,MAGIC=0x48424556,VERSION=1;
const EVENT={pressed:1,released:2,completed:3,failed:4,network:5,nfc:6,capacity:64};
const fixture=async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hb-event-test-'));
 const shader=path.join(directory,'event-queue.spv');
 execFileSync(tool('GLSLANG','glslangValidator'),['-V','-Os','-g0','--target-env','vulkan1.0','-I'+path.join(ROOT,'sdk/include'),path.join(__dirname,'event-queue.comp'),'-o',shader],{stdio:'pipe'});
 execFileSync(tool('SPIRV_VAL','spirv-val'),['--target-env','vulkan1.0',shader],{stdio:'pipe'});
 let runNumber=0;
 return {
  async run(initial,frames){
   const state=Buffer.isBuffer(initial)?path.join(directory,'state-'+runNumber):initial;
   const input=path.join(directory,'input-'+runNumber),output=path.join(directory,'output-'+runNumber++);
   if(Buffer.isBuffer(initial))await fs.writeFile(state,initial);
   await fs.writeFile(input,Buffer.concat(frames));
   execFileSync(path.join(ROOT,'homebrew-launcher/game-compute-check'),[state,output,shader,input,String(frames.length)],{stdio:'pipe',env:{...process.env,HB_FULL_OUTPUT:'1'}});
   return fs.readFile(output);
  },
  async close(){await fs.rm(directory,{recursive:true,force:true});}
 };
};
const fresh=()=>Buffer.alloc(BUFFER_BYTES);
const frame=(buttons=0,mode=0)=>{const bytes=Buffer.alloc(64);bytes.writeUInt32LE(buttons,8);bytes.writeUInt32LE(mode,12);return bytes;};
const read=(buffer,offset)=>buffer.readUInt32LE(offset);
const queue=(buffer)=>EXT+EVENT_OFFSET;
const result=(buffer)=>({
 type:read(buffer,784),data:read(buffer,788),status:read(buffer,792),sequence:read(buffer,796),
 firstType:read(buffer,992),firstData:read(buffer,996),firstSequence:read(buffer,1004),
 overflowed:read(buffer,848),consumed:read(buffer,812),available:read(buffer,800),dropped:read(buffer,804),errors:read(buffer,808)
});

test('GPU event queue preserves transitions, FIFO order, bounds, and service results',async t=>{
 const f=await fixture();t.after(()=>f.close());

 let output=await f.run(fresh(),[frame(),frame()]);
 assert.deepEqual(result(output),{type:0,data:0,status:0,sequence:0,firstType:0,firstData:0,firstSequence:0,overflowed:0,consumed:0,available:0,dropped:0,errors:0});

 output=await f.run(fresh(),[frame(1),frame(1),frame(0),frame(0)]);
 let event=result(output);
 assert.equal(event.type,EVENT.released);assert.equal(event.data,1);assert.equal(event.status,0);assert.equal(event.sequence,2);
 assert.equal(event.consumed,2);assert.equal(event.available,0);

 output=await f.run(fresh(),[frame(1,1),frame(3,1),frame(3),frame(3)]);
 event=result(output);
 assert.equal(event.firstType,EVENT.pressed);assert.equal(event.firstData,1);assert.equal(event.firstSequence,1);
 assert.equal(event.type,EVENT.pressed);assert.equal(event.data,2);assert.equal(event.sequence,2);
 assert.equal(event.available,0);assert.equal(event.consumed,2);
 output=await f.run(fresh(),[...Array.from({length:10},()=>frame(1,1)),frame(1)]);
 event=result(output);
 assert.equal(event.type,EVENT.pressed);assert.equal(event.data,1);assert.equal(event.sequence,1);
 assert.equal(event.dropped,0);assert.equal(event.available,0);assert.equal(event.consumed,1);

 const overflowFrames=Array.from({length:EVENT.capacity+1},(_,index)=>frame(index%2===0?1:0,1));
 const beforeOverflowPoll=await f.run(fresh(),overflowFrames);
 output=await f.run(beforeOverflowPoll,[frame(1)]);
 event=result(output);
 assert.equal(event.type,EVENT.pressed);assert.equal(event.data,1);assert.equal(event.sequence,1);
 assert.equal(event.dropped,1);assert.equal(event.overflowed,1);assert.equal(event.available,1);

 const malformed=fresh(),base=queue(malformed);
 malformed.writeUInt32LE(MAGIC,base);malformed.writeUInt32LE(VERSION,base+4);
 malformed.writeUInt32LE(1,base+16);malformed.writeUInt32LE(1,base+12);
 malformed.writeUInt32LE(99,base+40);malformed.writeUInt32LE(1,base+52);
 output=await f.run(malformed,[frame()]);
 event=result(output);assert.equal(event.errors,1);assert.equal(event.available,0);assert.equal(event.consumed,0);

 const service=fresh(),mailbox=EXT+2048;
 service.writeUInt32LE(7,mailbox);service.writeUInt32LE(3,mailbox+4);
 service.writeUInt32LE(7,EXT+4096);service.writeUInt32LE(4,EXT+4100);
 output=await f.run(service,[frame(),frame()]);
 event=result(output);assert.equal(event.type,EVENT.failed);assert.equal(event.data,3);
 assert.equal(event.status,4);assert.equal(event.sequence,1);assert.equal(event.consumed,1);

 const completed=fresh();
 completed.writeUInt32LE(0x48425344,EXT);completed.writeUInt32LE(1,EXT+4);
 completed.writeUInt32LE(2,mailbox);completed.writeUInt32LE(1,mailbox+4);
 completed.writeUInt32LE(2,EXT+4096);completed.writeUInt32LE(0,EXT+4100);
 output=await f.run(completed,[frame(0,2),frame()]);
 event=result(output);assert.equal(event.type,EVENT.completed);assert.equal(event.data,1);
 assert.equal(event.status,0);assert.equal(event.sequence,1);assert.equal(event.consumed,1);

 const network=fresh();
 network.writeUInt32LE(8,mailbox);network.writeUInt32LE(3,mailbox+4);
 network.writeUInt32LE(8,EXT+4096);network.writeUInt32LE(0,EXT+4100);network.writeUInt32LE(4,EXT+4104);
 output=await f.run(network,[frame(),frame()]);
 event=result(output);assert.equal(event.type,EVENT.network);assert.equal(event.data,4);
 assert.equal(event.status,0);assert.equal(event.sequence,1);assert.equal(event.available,1);

 const nfc=fresh();
 nfc.writeUInt32LE(9,mailbox);nfc.writeUInt32LE(2,mailbox+4);
 nfc.writeUInt32LE(9,EXT+4096);nfc.writeUInt32LE(0,EXT+4100);nfc.writeUInt32LE(104,EXT+4104);
 nfc.writeUInt32LE(1,EXT+4128);nfc.writeUInt32LE(1,EXT+4132);
 output=await f.run(nfc,[frame(),frame()]);
 event=result(output);assert.equal(event.type,EVENT.nfc);assert.equal(event.data,1);
 assert.equal(event.status,0);assert.equal(event.sequence,1);assert.equal(event.available,1);

 const badResponse=fresh();
 badResponse.writeUInt32LE(10,mailbox);badResponse.writeUInt32LE(3,mailbox+4);
 badResponse.writeUInt32LE(10,EXT+4096);badResponse.writeUInt32LE(0,EXT+4100);badResponse.writeUInt32LE(1025,EXT+4104);
 output=await f.run(badResponse,[frame(),frame()]);
 event=result(output);assert.equal(event.errors,1);assert.equal(event.available,0);

 const badHeader=fresh(),badBase=queue(badHeader);
 badHeader.writeUInt32LE(0xdeadbeef,badBase);badHeader.writeUInt32LE(0, badBase+4);
 badHeader.writeUInt32LE(1,badBase+16);
 output=await f.run(badHeader,[frame()]);
 event=result(output);assert.equal(event.errors,1);assert.equal(event.available,0);
});
