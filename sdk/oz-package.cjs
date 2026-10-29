#!/usr/bin/env node
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {buildProject,validateOzPackage}=require('./build.cjs');

async function main(){
 const [command,argument,extra]=process.argv.slice(2);
 if(command==='extract'){
   if(!argument||!extra)throw Error('Usage: node sdk/oz-package.cjs extract APP.oz DIRECTORY');
   await require('node:child_process').execFileSync(process.env.PYTHON||(process.platform==='win32'?'python':'python3'),[path.join(__dirname,'package.py'),'extract',path.resolve(argument),path.resolve(extra)],{stdio:'inherit'});
   console.log('Extracted '+path.resolve(argument)+' to '+path.resolve(extra));
   return;
 }
 const target=command==='validate'||command==='inspect'?argument:(command||process.cwd());
 if(!target)throw Error('Usage: node sdk/oz-package.cjs <PROJECT_DIRECTORY|APP.oz|validate APP.oz|extract APP.oz DIRECTORY>');
 const resolved=path.resolve(target);
 const stat=await fs.stat(resolved).catch(()=>null);
 if(!stat){ throw Error('Package target not found: '+resolved); }
 if(stat.isDirectory()){
   const out=await buildProject(resolved);
   console.log('Built '+out);
   return;
 }
 const info=await validateOzPackage(resolved);
 console.log(JSON.stringify({ok:true,...info},null,2));
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
