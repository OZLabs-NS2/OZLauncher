const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const transpile=require('../oztranspile.cjs');

async function source(root,language='opencl'){
 const directory=path.join(root,'demo');await fs.mkdir(directory,{recursive:true});
 await fs.writeFile(path.join(directory,'ozproject.json'),JSON.stringify({language,entry:language==='opencl'?'src/main.cl':'src/main.rs'}));
 await fs.writeFile(path.join(directory,'app.json'),JSON.stringify({format:'hblauncher.gpu-app',abi:1,shaders:{compute:'app.comp.spv'}}));
 if(language==='opencl'){await fs.mkdir(path.join(directory,'src'),{recursive:true});await fs.writeFile(path.join(directory,'src/main.cl'),'');}
 else await fs.writeFile(path.join(directory,'Cargo.toml'),'');
 return directory;
}

test('OZTranspile command parsing rejects missing inputs and unknown options',()=>{
 assert.deepEqual(transpile.args(['build','./app','--output','./dist/app.oz']),{command:'build',source:path.resolve('./app'),output:'./dist/app.oz'});
 assert.throws(()=>transpile.args(['build']),/Usage/);
 assert.throws(()=>transpile.args(['build','app','--wat']),/Unknown/);
});

test('OpenCL and Rust-GPU project reports name real frontends and disclose boundaries',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-transpile-report-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cl=await source(root,'opencl'),clInfo=await transpile.project(cl),clReport=transpile.report(cl,clInfo);
 assert.equal(clReport.frontend,'clspv');assert.equal(clReport.status,'requires-frontend-validation');
 assert.match(clReport.limitations[0],/not arbitrary desktop C or C\+\+/);
 const rust=await source(root,'rust-gpu'),rustInfo=await transpile.project(rust);
 assert.equal(transpile.report(rust,rustInfo).frontend,'Cargo nightly with the rust-gpu SPIR-V target');
 const cpp=await source(root,'cpp');
 await assert.rejects(transpile.project(cpp),/supports OpenCL C via clspv/);
});

test('OpenCL app template generates a real kernel and ABI-1 shader project',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-opencl-template-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const directory=await require('../create-app.cjs').create('counter-demo','Counter Demo',{language:'opencl',root});
 const [config,manifest,kernel]=await Promise.all([
  fs.readFile(path.join(directory,'ozproject.json'),'utf8').then(JSON.parse),
  fs.readFile(path.join(directory,'app.json'),'utf8').then(JSON.parse),
  fs.readFile(path.join(directory,'src/main.cl'),'utf8'),
 ]);
 assert.equal(config.language,'opencl');assert.equal(manifest.format,'hblauncher.gpu-app');assert.equal(manifest.abi,1);
 assert.match(kernel,/reqd_work_group_size\(1, 1, 1\)/);assert.match(kernel,/controls\[16\]/);
 assert.match(await fs.readFile(path.join(directory,'build.cjs'),'utf8'),/buildProject/);
 assert.match(await fs.readFile(path.join(directory,'build.cjs'),'utf8'),/apps\/counter-demo\.oz/);
 assert.match(await fs.readFile(path.join(directory,'README.md'),'utf8'),/app-examples\/counter-demo/);
 await assert.rejects(require('../create-app.cjs').create('unsupported-cpp','Unsupported',{language:'cpp',root}),/C\+\+ cannot/);
 await assert.rejects(fs.stat(path.join(root,'unsupported-cpp')));
});
