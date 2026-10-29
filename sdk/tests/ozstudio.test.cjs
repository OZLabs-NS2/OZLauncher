const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const studio=require('../ozstudio.cjs');

test('OZ Studio exposes bounded package and runtime controls',()=>{
 assert.deepEqual(studio.parse(['run','app.oz','--frames','12']).frames,12);
 assert.equal(studio.parse(['run','app.oz','--interactive']).mode,'interactive');
 assert.throws(()=>studio.parse(['run','app.oz','--frames','0']),/1 to 1000000/);
 assert.throws(()=>studio.parse(['run','app.oz','--interactive','--frames','1']),/Invalid/);
 assert.throws(()=>studio.compatibility({files:{memory:{}},manifest:{}}),/private storage/);
 assert.throws(()=>studio.compatibility({files:{},manifest:{sdk:{capabilities:['storage']}}}),/host capabilities/);
});

test('OZ Studio executes an installed shader package on a local Vulkan compute device',async t=>{
 if(process.platform!=='linux'||!await fs.access('/usr/share/vulkan/icd.d/lvp_icd.json').then(()=>true,()=>false)){
  t.skip('Lavapipe is not installed on this host');return;
 }
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-studio-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'hello-world');await fs.cp(path.resolve(__dirname,'../../app-examples/hello-world'),source,{recursive:true});
 const archive=await require('../build.cjs').buildApp(source);
 const install=path.join(root,'installed');await fs.mkdir(install);await fs.copyFile(archive,path.join(install,'hello-world.oz'));
 const catalog=await require('../../homebrew-launcher/app-catalog.cjs').scan(install);
 assert.equal(catalog.apps.length,1);assert.equal(catalog.apps[0].id,'hello-world');
 const result=spawnSync(process.execPath,[path.join(__dirname,'../ozstudio.cjs'),'run',path.join(install,'hello-world.oz'),'--frames','2'],{
  encoding:'utf8',env:{...process.env,VK_ICD_FILENAMES:'/usr/share/vulkan/icd.d/lvp_icd.json'},maxBuffer:1024*1024,
 });
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Requires Switch 2 hardware verification/);
 assert.match(result.stdout,/device=llvmpipe/);
 assert.match(result.stdout,/frames=2/);
});

test('Interactive PC runtime dispatches, pauses, restarts, accepts simulated buttons, and stops',async t=>{
 if(process.platform!=='linux'||!await fs.access('/usr/share/vulkan/icd.d/lvp_icd.json').then(()=>true,()=>false)){
  t.skip('Lavapipe is not installed on this host');return;
 }
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-studio-controls-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'hello-world');await fs.cp(path.resolve(__dirname,'../../app-examples/hello-world'),source,{recursive:true});
 const archive=await require('../build.cjs').buildApp(source);
 const result=spawnSync(process.execPath,[path.join(__dirname,'../ozstudio.cjs'),'run',archive,'--interactive'],{
  encoding:'utf8',input:'step\npress B\nstep\npause\nrestart\nstats\nstop\n',
  env:{...process.env,VK_ICD_FILENAMES:'/usr/share/vulkan/icd.d/lvp_icd.json'},maxBuffer:1024*1024,
 });
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Pressed B/);assert.match(result.stdout,/Runtime paused/);
 assert.match(result.stdout,/Runtime restarted and paused/);assert.match(result.stdout,/frames=0/);
});
