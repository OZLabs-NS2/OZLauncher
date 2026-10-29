#!/usr/bin/env node
const fs=require('node:fs/promises'),fsSync=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const {readPackage}=require('../homebrew-launcher/app-catalog.cjs');

function parse(argv){
 const [command,file,...rest]=argv;
 if(!['inspect','run'].includes(command)||!file)throw Error('Usage: node sdk/ozstudio.cjs <inspect PACKAGE.oz|run PACKAGE.oz [--frames N|--interactive]>');
 if(command==='inspect'&&rest.length)throw Error('inspect accepts only a package path');
 let mode='frames',frames=1;
 if(rest.length===1&&rest[0]==='--interactive')mode='interactive';
 else if(rest.length===2&&rest[0]==='--frames'){
  frames=Number(rest[1]);
  if(!Number.isSafeInteger(frames)||frames<1||frames>1000000)throw Error('--frames must be an integer from 1 to 1000000');
 }else if(rest.length)throw Error('Invalid run options');
 return {command,file:path.resolve(file),mode,frames};
}

function compatibility(app){
 const unsupported=[];
 if(app.files.memory)unsupported.push('private storage binding 1');
 if(app.manifest.computeSequence)unsupported.push('multi-stage compute sequences');
 if(app.manifest.audio)unsupported.push('host audio output');
 if(app.manifest.sdk?.services?.length)unsupported.push('background services');
 if(app.manifest.sdk?.capabilities?.length)unsupported.push('declared SDK host capabilities');
 if(unsupported.length)throw Error('Unsupported by the current PC simulator: '+unsupported.join(', '));
}

async function main(argv=process.argv.slice(2)){
 const options=parse(argv),app=await readPackage(options.file);
 console.log(JSON.stringify({
  application:{id:app.id,name:app.name,version:app.version},
  package:options.file,
  statuses:['Shader validation passed','Requires Switch 2 hardware verification'],
  simulation:'Vulkan compute only; desktop results are not hardware verification',
  supported:['ABI-1 binding 0 storage buffer (8 MiB)','1024-byte initial state','application data up to 7 MiB','one 1x1x1 compute workgroup'],
  unsupported:['vertex/fragment rendering','physical input devices and graphical UI','private storage binding 1','host services, events, and persistent storage'],
 },null,2));
 if(options.command==='inspect')return;
 compatibility(app);
 if(process.platform!=='linux')throw Error('The current OZ Studio Vulkan runner is supported and tested on Linux only');
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'oz-studio-'));
 try{
  const executable=path.join(temporary,'oz-studio-vulkan');
  execFileSync(process.env.CC||'cc',['-std=c11','-O2','-Wall','-Wextra','-Werror','-D_POSIX_C_SOURCE=200809L',path.join(__dirname,'studio-vulkan.c'),'-lvulkan','-o',executable],{stdio:'inherit'});
  const args=[app.files.compute.file,app.files.state.file,app.files.data.file];
  if(options.mode==='interactive')args.push('--interactive');
  else args.push('--frames',String(options.frames));
  const result=spawnSync(executable,args,{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.signal)throw Error('OZ Studio runtime terminated by '+result.signal);
  if(result.status!==0)process.exitCode=result.status||1;
 }finally{
  await fs.rm(temporary,{recursive:true,force:true});
 }
}

if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={parse,compatibility,main};
