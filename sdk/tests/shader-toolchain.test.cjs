const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildProject,validateOzPackage}=require('../build.cjs');

async function project(root,id,language){
 const directory=path.join(root,id);
 await fs.mkdir(path.join(directory,'src'),{recursive:true});
 await fs.mkdir(path.join(directory,'assets'),{recursive:true});
 const config={language,entry:language==='c'?'src/main.cl':'src/main.rs'};
 if(language==='rust')await fs.writeFile(path.join(directory,'Cargo.toml'),'[package]\nname = "'+id+'"\nversion = "0.1.0"\nedition = "2021"\n');
 await fs.writeFile(path.join(directory,'ozproject.json'),JSON.stringify(config));
 await fs.writeFile(path.join(directory,'src',language==='c'?'main.cl':'main.rs'),'shader source');
 await fs.writeFile(path.join(directory,'assets/icon.png'),Buffer.from('png'));
 await fs.writeFile(path.join(directory,'assets/state.bin'),Buffer.alloc(1024));
 await fs.writeFile(path.join(directory,'assets/text.bin'),Buffer.from('atlas'));
 for(const name of ['app.vert.spv','app.frag.spv'])await fs.writeFile(path.join(directory,name),Buffer.from([3,2,35,7]));
 const manifest={format:'hblauncher.gpu-app',abi:1,id,name:id,version:'1.0.0',description:'',icon:'assets/icon.png',initialState:'assets/state.bin',data:'assets/text.bin',shaders:{vertex:'app.vert.spv',fragment:'app.frag.spv',compute:'app.comp.spv'}};
 await fs.writeFile(path.join(directory,'app.json'),JSON.stringify(manifest));
 return directory;
}

test('OpenCL C uses clspv and packages validated shader app assets',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-clspv-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const directory=await project(root,'clspv-demo','c'),calls=[];
 const runner=(command,args)=>{
  calls.push([path.basename(command),args]);
  if(path.basename(command)==='clspv')fsSync.writeFileSync(args[args.indexOf('-o')+1],Buffer.from([3,2,35,7]));
 };
 const {compileShaderProject}=require('../build.cjs');
 const config=JSON.parse(await fs.readFile(path.join(directory,'ozproject.json'))),manifest=JSON.parse(await fs.readFile(path.join(directory,'app.json')));
 compileShaderProject(directory,config,manifest,runner);
 assert.deepEqual(calls.map(call=>call[0]),['clspv','spirv-val']);
 assert.equal(calls[0][1].at(-1),path.join(directory,'src/main.cl'));
 const pkg=await buildProjectWithRunner(directory,runner);
 const info=await validateOzPackage(pkg);
 assert.equal(info.id,'clspv-demo');
 assert.ok(info.paths.includes('app.comp.spv'));
});

test('Rust GPU source uses cargo-gpu and packages the SPIR-V output',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-rust-gpu-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const directory=await project(root,'rust-demo','rust'),calls=[];
 const runner=(command,args)=>{
  calls.push([path.basename(command),args]);
  if(path.basename(command)==='cargo'){
   const output=args[args.indexOf('--output-dir')+1];fsSync.mkdirSync(output,{recursive:true});fsSync.writeFileSync(path.join(output,'rust_demo.spv'),Buffer.from([3,2,35,7]));
  }else if(path.basename(command)==='spirv-val'){
   const destination=args.at(-1);assert.deepEqual([...fsSync.readFileSync(destination)],[3,2,35,7]);
  }
 };
 const pkg=await buildProjectWithRunner(directory,runner);
 const info=await validateOzPackage(pkg);
 assert.equal(info.id,'rust-demo');
 assert.deepEqual(calls.map(call=>call[0]),['cargo','spirv-val']);
 assert.deepEqual(calls[0][1].slice(0,2),['gpu','build']);
 assert.equal(calls[0][1][calls[0][1].indexOf('--target')+1],'spirv-unknown-vulkan1.0');
 assert.ok(info.paths.includes('app.comp.spv'));
});

test('Shader project build directories cannot escape the project root',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-build-path-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const directory=await project(root,'path-demo','c');
 const config=JSON.parse(await fs.readFile(path.join(directory,'ozproject.json')));
 config.buildDir='../outside';
 await fs.writeFile(path.join(directory,'ozproject.json'),JSON.stringify(config));
 await assert.rejects(buildProject(directory),/Project output path must stay inside the project/);
 await assert.rejects(fs.access(path.join(root,'outside')));
});

async function buildProjectWithRunner(directory,runner){
 const fsSync=require('node:fs'),path=require('node:path');
 const build=require('../build.cjs'),config=JSON.parse(await fs.readFile(path.join(directory,'ozproject.json'))),manifest=JSON.parse(await fs.readFile(path.join(directory,'app.json')));
 await fs.mkdir(path.join(directory,'build'),{recursive:true});
 build.compileShaderProject(directory,config,manifest,runner);
 return build.preparePackage(directory,config,manifest);
}
