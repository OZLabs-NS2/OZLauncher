#!/usr/bin/env node
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const ROOT=path.resolve(__dirname,'..');
const SOURCE_ROOT=path.join(ROOT,'app-examples');
const SOURCE_APPS=['hello-world','event-system'];
const PRELOADED_APPS=['doom','event-system','hello-world','minesweeper','pong','snake'];

async function main(){
 for(const id of SOURCE_APPS){
  const script=path.join(SOURCE_ROOT,id,'build.cjs');
  execFileSync(process.execPath,[script],{stdio:'inherit',cwd:ROOT});
 }
 const {scan}=require('../homebrew-launcher/app-catalog.cjs');
 const catalog=await scan(path.join(ROOT,'apps'));
 if(catalog.rejected.length)throw Error('Rejected preloaded app packages: '+JSON.stringify(catalog.rejected));
 const found=catalog.apps.map(app=>app.id).sort();
 if(JSON.stringify(found)!==JSON.stringify(PRELOADED_APPS))throw Error(`Expected preloaded packages ${PRELOADED_APPS.join(', ')}, found ${found.join(', ')}`);
 console.log(`Built source examples and validated ${PRELOADED_APPS.length} installable .oz packages in apps/`);
}

main().catch(error=>{console.error(error);process.exitCode=1;});
