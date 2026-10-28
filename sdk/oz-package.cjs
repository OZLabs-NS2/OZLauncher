#!/usr/bin/env node
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {buildProject,validateOzPackage}=require('./build.cjs');

async function main(){
 const target=process.argv[2]||process.cwd();
 const resolved=path.resolve(target);
 const stat=await fs.stat(resolved).catch(()=>null);
 if(!stat){ throw Error('Package target not found: '+resolved); }
 if(stat.isDirectory()){
   const out=await buildProject(resolved);
   console.log('Built '+out);
   return;
 }
 const info=await validateOzPackage(resolved);
 console.log(JSON.stringify({ok:true,id:info.id,name:info.name,version:info.version,format:info.format},null,2));
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
