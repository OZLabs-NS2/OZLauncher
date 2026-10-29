const fs=require('node:fs/promises'),path=require('node:path');

function parseArgs(argv){
 const config={id:argv[0],name:argv[1]||argv[0],language:'gpu'};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg.startsWith('--lang=')){config.language=arg.slice('--lang='.length);continue;}
  if(arg.startsWith('--language=')){config.language=arg.slice('--language='.length);continue;}
  if(arg==='--lang'||arg==='-l'||arg==='--language'||arg==='--type'||arg==='-t'){config.language=argv[i+1]||config.language;i++;continue;}
 }
 return config;
}

async function create(id,name=id,options={}){
 const requestedLanguage=String((options.language||'gpu')).toLowerCase();
 const language=['c','cl','opencl','clspv'].includes(requestedLanguage)?'opencl':requestedLanguage;
 if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)||typeof name!=='string'||!name.trim()||name.length>64)throw Error('Use a lowercase app-id and a display name of 1..64 characters');
 if(['cpp','c++'].includes(language))throw Error('C++ cannot be transpiled to the launcher shader ABI; use GLSL or a supported OpenCL C kernel');
 if(['rust','rust-gpu'].includes(language))throw Error('Rust-GPU projects require a separately configured rust-gpu Cargo target; see docs/oztranspile.md');
 if(!['gpu','glsl','opencl'].includes(language))throw Error('Supported app templates are gpu and opencl');
 const templateRoot=path.resolve(__dirname,'../app-examples'),root=path.resolve(options.root||templateRoot),target=path.join(root,id);
 await fs.mkdir(target,{recursive:false});
 if(language==='gpu'||language==='glsl'){ 
   const source=path.join(templateRoot,'hello-world');
   for(const item of ['assets','shaders','assets.py','build.cjs','app.json'])await fs.cp(path.join(source,item),path.join(target,item),{recursive:true,errorOnExist:true,force:false});
   const manifest=JSON.parse(await fs.readFile(path.join(target,'app.json')));manifest.id=id;manifest.name=name;manifest.description='Built with HB SDK';manifest.sdk={version:1,capabilities:[]};
   await fs.writeFile(path.join(target,'app.json'),JSON.stringify(manifest,null,2)+'\n');
   await fs.writeFile(path.join(target,'build.cjs'),`const path=require('node:path');\nconst {buildApp}=require('../../sdk/build.cjs');\nbuildApp(__dirname,{output:path.resolve(__dirname,'../../apps/${id}.oz')}).then(file=>console.log('Built '+file)).catch(error=>{console.error(error);process.exitCode=1;});\n`);
   await fs.writeFile(path.join(target,'README.md'),`# ${name}\n\nBuild from the repository root:\n\n\`\`\`sh\nnode app-examples/${id}/build.cjs\n\`\`\`\n\nThis writes \`apps/${id}.oz\`, the installable package. Edit shaders/app.comp for logic, shaders/app.frag for rendering, and assets.py for text and icon artwork. See [the SDK guide](../../sdk/README.md) for the complete SDK documentation.\n`);
   return target;
 }
 if(language==='opencl'){
  const source=path.join(templateRoot,'hello-world');
  for(const item of ['assets','shaders','assets.py','build.cjs','app.json'])await fs.cp(path.join(source,item),path.join(target,item),{recursive:true,errorOnExist:true,force:false});
  const manifest=JSON.parse(await fs.readFile(path.join(target,'app.json')));manifest.id=id;manifest.name=name;manifest.description='Built with OZTranspile';manifest.sdk={version:1,capabilities:[]};
  await fs.writeFile(path.join(target,'app.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.mkdir(path.join(target,'src'),{recursive:true});
  await fs.writeFile(path.join(target,'src','main.cl'),'__kernel __attribute__((reqd_work_group_size(1, 1, 1)))\nvoid main(__global float *controls) {\n    controls[16] += 1.0f / 60.0f;\n}\n');
  await fs.writeFile(path.join(target,'ozproject.json'),JSON.stringify({language:'opencl',entry:'src/main.cl'},null,2)+'\n');
  await fs.writeFile(path.join(target,'build.cjs'),`const path=require('node:path');\nconst {buildProject}=require('../../sdk/build.cjs');\nbuildProject(__dirname,{output:path.resolve(__dirname,'../../apps/${id}.oz')}).then(file=>console.log('Built '+file)).catch(error=>{console.error(error);process.exitCode=1;});\n`);
  await fs.writeFile(path.join(target,'README.md'),`# ${name}\n\nThis app starts from the OZ ABI-1 GPU template and adds a single-invocation OpenCL C compute kernel. Install clspv and SPIRV-Tools, then run from the repository root:\n\n\`\`\`sh\nnode sdk/oztranspile.cjs check app-examples/${id}\nnode sdk/oztranspile.cjs build app-examples/${id} --output apps/${id}.oz\n\`\`\`\n\nThe generated \`.oz\` package is the installable app. The kernel is not an ordinary CPU C program. See [OZTranspile](../../docs/oztranspile.md) for supported inputs and limits.\n`);
  return target;
 }
 throw Error('Unsupported app template language: '+language);
}
module.exports={create,parseArgs};
if(require.main===module){const {id,name,language}=parseArgs(process.argv.slice(2));create(id,name,{language}).then(p=>console.log(`Created ${p}; ${['c','cl','opencl','clspv'].includes(language)?'run oztranspile to build the .oz package.':'run its build.cjs to produce the .oz package.'}`)).catch(e=>{console.error(e.message);process.exitCode=1;});}
