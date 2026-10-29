const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {preparePackage,validateOzPackage}=require('../build.cjs');

test('builds, validates, and safely extracts the launcher .oz format',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-package-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'app');await fs.cp(path.resolve(__dirname,'../../app-examples/hello-world'),source,{recursive:true});
 const manifest=JSON.parse(await fs.readFile(path.join(source,'app.json')));
 const archive=await preparePackage(source,{buildDir:path.join(root,'build'),output:path.join(root,'install','hello-world.oz')},manifest);
 const info=await validateOzPackage(archive);
 assert.equal(info.id,'hello-world');assert.ok(info.paths.includes('app.comp.spv'));
 const destination=path.join(root,'extracted');
 execFileSync(process.env.PYTHON||'python3',[path.resolve(__dirname,'../package.py'),'extract',archive,destination]);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(destination,'app.json'),'utf8')).id,'hello-world');
 await assert.rejects(fs.stat(path.join(destination,'../escape')));
 assert.throws(()=>require('node:child_process').execFileSync(process.env.PYTHON||'python3',[path.resolve(__dirname,'../package.py'),'extract',archive,destination]),/already exists/);
});

test('rejects malicious archive paths before extraction',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-package-traversal-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const archive=path.join(root,'bad.oz');
 execFileSync(process.env.PYTHON||'python3',['-c',[
  'import json,sys,zipfile',
  'm={"format":"hblauncher.gpu-app","abi":1,"id":"bad","version":"1","icon":"icon.png","initialState":"state.bin","data":"data.bin","shaders":{"vertex":"v.spv","fragment":"f.spv","compute":"c.spv"}}',
  'z=zipfile.ZipFile(sys.argv[1],"w")',
  'z.writestr("app.json",json.dumps(m))',
  'z.writestr("../escape","bad")',
  'z.close()',
 ].join(';'),archive]);
 await assert.rejects(validateOzPackage(archive),/Rejected package path/);
});
