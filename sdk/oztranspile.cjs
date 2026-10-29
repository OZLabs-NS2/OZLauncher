#!/usr/bin/env node
const fs=require('node:fs/promises'),path=require('node:path');
const {buildProject,compileShaderProject}=require('./build.cjs');

function usage(){
 return 'Usage: node sdk/oztranspile.cjs <inspect|check|report|build> SOURCE [--output FILE]';
}

function args(argv){
 const [command,source,...rest]=argv;
 if(!['inspect','check','report','build'].includes(command)||!source)throw Error(usage());
 let output;
 for(let i=0;i<rest.length;i++){
  if(rest[i]==='--output'&&rest[i+1]){output=rest[++i];continue;}
  throw Error('Unknown or incomplete option: '+rest[i]+'\n'+usage());
 }
 return {command,source:path.resolve(source),output};
}

async function project(source){
 const configPath=path.join(source,'ozproject.json'),manifestPath=path.join(source,'app.json');
 const [config,manifest]=await Promise.all([
  fs.readFile(configPath,'utf8').then(JSON.parse),
  fs.readFile(manifestPath,'utf8').then(JSON.parse),
 ]);
 if(manifest.format!=='hblauncher.gpu-app'||manifest.abi!==1)throw Error('OZTranspile requires a launcher-compatible hblauncher.gpu-app ABI 1 manifest');
 const requestedLanguage=String(config.language||'').toLowerCase();
 const language=['c','opencl','ocl'].includes(requestedLanguage)?'c':['rust','rust-gpu'].includes(requestedLanguage)?'rust':requestedLanguage;
 const entry=language==='c'?config.entry||'src/main.cl':'Cargo.toml';
 if(!['c','rust'].includes(language))throw Error('Shader transpilation supports OpenCL C via clspv ("opencl") and Rust via rust-gpu ("rust"); ordinary C++, host C, and native binaries are not shader inputs');
 if(!Array.isArray(config.compilerArgs||[])||!Array.isArray(config.cargoArgs||[]))throw Error('compilerArgs and cargoArgs must be arrays');
 if(typeof manifest.shaders?.compute!=='string'||!manifest.shaders.compute||path.isAbsolute(manifest.shaders.compute)||manifest.shaders.compute.split(/[\\/]/).includes('..'))throw Error('app.json must provide a relative compute shader output path');
 const entryPath=path.resolve(source,entry),outputPath=path.resolve(source,manifest.shaders.compute);
 if(!entryPath.startsWith(source+path.sep)||!outputPath.startsWith(source+path.sep))throw Error('Source and shader output paths must stay inside the project');
 const entryStat=await fs.stat(entryPath).catch(()=>null);
 if(!entryStat?.isFile())throw Error('Shader project entry file not found: '+entry);
 return {config,manifest,language,entry};
}

function report(source,info){
 const input=path.resolve(source,info.entry);
 return {
  tool:'OZTranspile',
  status:'requires-frontend-validation',
  source:source,
  language:info.language==='c'?'OpenCL C':'Rust (rust-gpu)',
  frontend:info.language==='c'?'clspv':'Cargo nightly with the rust-gpu SPIR-V target',
  entry:input,
  outputShader:path.resolve(source,info.manifest.shaders.compute),
  packageFormat:'hblauncher.gpu-app ABI 1 (.oz)',
  compatibleRuntime:'OZLauncher shader app loader',
  limitations:[
   'The C frontend accepts OpenCL C kernels, not arbitrary desktop C or C++ programs.',
   'The generated compute shader must match the application binding-zero ABI; the existing vertex and fragment shaders remain required.',
   'Rust syntax is only supported when the configured rust-gpu toolchain can compile the project for its SPIR-V target.',
   'Successful SPIR-V validation does not establish Nintendo Switch 2 hardware compatibility.',
   'The package remains a shader application; this pipeline does not compile or execute a host-native binary.',
  ],
 };
}

async function main(argv=process.argv.slice(2)){
 const options=args(argv),info=await project(options.source);
 if(options.command==='inspect'){
  console.log(JSON.stringify({source:options.source,...report(options.source,info),manifest:info.manifest},null,2));
  return;
 }
 if(options.command==='report'){
  const value=report(options.source,info);
  if(options.output)await fs.writeFile(path.resolve(options.output),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify(value,null,2));
  return;
 }
 if(options.command==='check'){
  const shader=compileShaderProject(options.source,info.config,info.manifest);
  await require('../homebrew-launcher/app-catalog.cjs').readApp(options.source);
  console.log(JSON.stringify({ok:true,status:'shader-validation-passed',shader,hardware:'requires Switch 2 verification'},null,2));
  return;
 }
 const file=await buildProject(options.source,{output:options.output});
 console.log(JSON.stringify({ok:true,status:'package-built',package:file,hardware:'requires Switch 2 verification'},null,2));
}

if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={args,project,report,main};
