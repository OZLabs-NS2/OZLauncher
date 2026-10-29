// Shared shader build entry point. All paths are explicit; no shell interpolation.
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {tool}=require('../scripts/toolchain.cjs');

async function headers(directory){
 await fs.mkdir(directory,{recursive:true});
 for(const [source,target]of [['state.glsl','abi.glsl'],['hb.glsl','hb.glsl'],['draw.glsl','draw.glsl'],['ozui.glsl','ozui.glsl']])await fs.copyFile(path.join(__dirname,'include',source),path.join(directory,target));
}

function compile(source,output){
 execFileSync(tool('GLSLANG','glslangValidator'),['-V','-Os','-g0','--target-env','vulkan1.0',source,'-o',output],{stdio:'inherit'});
 execFileSync(tool('SPIRV_VAL','spirv-val'),['--target-env','vulkan1.0',output],{stdio:'inherit'});
}

function projectPath(root,candidate){
 const target=path.resolve(root,candidate),relative=path.relative(root,target);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Project output path must stay inside the project');
 let existing=target;
 while(!fsSync.existsSync(existing)){
  const parent=path.dirname(existing);
  if(parent===existing)throw Error('Cannot resolve project output parent: '+target);
  existing=parent;
 }
 const rootReal=fsSync.realpathSync(root),existingReal=fsSync.realpathSync(existing),realRelative=path.relative(rootReal,existingReal);
 if(realRelative==='..'||realRelative.startsWith('..'+path.sep)||path.isAbsolute(realRelative))throw Error('Project output resolves outside the project: '+target);
 if(fsSync.existsSync(target)&&fsSync.lstatSync(target).isSymbolicLink())throw Error('Project output must not be a symbolic link: '+target);
 return target;
}

function projectFile(root,candidate,label){
 const target=projectPath(root,candidate),real=fsSync.realpathSync(target),rootReal=fsSync.realpathSync(root),relative=path.relative(rootReal,real);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error(`${label} resolves outside the project: ${candidate}`);
 if(!fsSync.statSync(real).isFile())throw Error(`${label} is not a file: ${candidate}`);
 return real;
}

async function buildApp(directory,{output}={}){
 directory=fsSync.realpathSync(path.resolve(directory));await headers(path.join(directory,'shaders'));
 for(const stage of ['vert','frag','comp']){
  const source=projectFile(directory,path.join('shaders','app.'+stage),'Shader source');
  const output=projectPath(directory,path.join('shaders','app.'+stage+'.spv'));
  compile(source,output);
 }
 const manifest=JSON.parse(await fs.readFile(path.join(directory,'app.json'),'utf8'));
 const app=await require('../homebrew-launcher/app-catalog.cjs').readApp(directory);
 const packageOutput=output?path.resolve(output):path.join(path.dirname(directory),app.id+'.oz');
 return preparePackage(directory,{buildDir:'build',output:packageOutput},manifest);
}

function compilerTool(name,fallback){return process.env[name.toUpperCase()]||tool(name.toUpperCase(),fallback);}

function compileShaderProject(projectRoot,config,manifest,run=execFileSync){
 const root=fsSync.realpathSync(path.resolve(projectRoot)),requestedLanguage=String(config.language||'').toLowerCase();
 const language=['c','opencl','ocl'].includes(requestedLanguage)?'c':['rust','rust-gpu'].includes(requestedLanguage)?'rust':requestedLanguage;
 if(!['c','rust'].includes(language))throw Error('Shader projects support OpenCL C via clspv or Rust via rust-gpu');
 const output=projectPath(root,manifest.shaders.compute);
 fsSyncMkdir(path.dirname(output));
 if(language==='c'){
  const source=projectFile(root,config.entry||'src/main.cl','OpenCL C source');
  run(compilerTool('CLSPV','clspv'),[...(config.compilerArgs||[]),'-o',output,source],{cwd:root,stdio:'inherit'});
 }else{
  const target=config.target||'spirv-unknown-vulkan1.0';
  if(target!=='spirv-unknown-vulkan1.0')throw Error('OZLauncher ABI 1 requires Rust-GPU target spirv-unknown-vulkan1.0');
  const cargo=process.env.CARGO||'cargo',outputDir=projectPath(root,config.shaderOutputDir||path.join(config.buildDir||'build','rust-gpu'));
  fsSyncMkdir(outputDir);
  run(cargo,['gpu','build','--shader-crate',root,'--output-dir',outputDir,'--target',target,'--spirv-metadata','full',...(config.cargoArgs||[])],{cwd:root,stdio:'inherit'});
  let rustOutput;
  if(config.artifact){
   rustOutput=projectFile(root,config.artifact,'Rust shader artifact');
  }else{
   const candidates=fsSync.readdirSync(outputDir).filter(file=>file.endsWith('.spv')).map(file=>path.join(outputDir,file));
   if(candidates.length!==1)throw Error(`Expected one rust-gpu SPIR-V artifact in ${outputDir}, found ${candidates.length}; set ozproject.json artifact`);
   rustOutput=candidates[0];
  }
  fsSyncCopy(rustOutput,output);
 }
 run(compilerTool('SPIRV_VAL','spirv-val'),['--target-env','vulkan1.0',output],{stdio:'inherit'});
 return output;
}

const fsSyncMkdir=directory=>fsSync.mkdirSync(directory,{recursive:true});
const fsSyncCopy=(source,target)=>fsSync.copyFileSync(source,target);

async function preparePackage(projectRoot,config,manifest){
 const root=path.resolve(projectRoot),buildDir=path.resolve(root,config.buildDir||'build');
 await fs.mkdir(buildDir,{recursive:true});
 const packageDir=await fs.mkdtemp(path.join(buildDir,'.oz-package-'));
 try{
  const resources=[manifest.icon,manifest.initialState,manifest.data,...Object.values(manifest.shaders||{}),manifest.computeSequence?.begin,manifest.computeSequence?.after,manifest.memory?.initial,...Object.values(manifest.audio?.effects||{})].filter(Boolean);
  for(const resource of resources){
   if(typeof resource!=='string'||path.isAbsolute(resource)||resource.split(/[\\/]/).includes('..'))throw Error('Invalid app package path: '+resource);
   const source=path.resolve(root,resource),target=path.resolve(packageDir,resource);
   if(!source.startsWith(root+path.sep)||!target.startsWith(packageDir+path.sep))throw Error('App package path escaped its root: '+resource);
   await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target);
  }
  await fs.copyFile(path.join(root,'app.json'),path.join(packageDir,'app.json'));
  const zipTarget=config.output?path.resolve(root,config.output):path.join(buildDir,`${manifest.id}.oz`);
  if(path.extname(zipTarget)!=='.oz')throw Error('OZ package output must use the .oz extension');
  await fs.mkdir(path.dirname(zipTarget),{recursive:true});
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  execFileSync(python,[path.join(__dirname,'package.py'),'create',packageDir,zipTarget],{stdio:'inherit'});
  return zipTarget;
 }finally{
  await fs.rm(packageDir,{recursive:true,force:true});
 }
}

async function validateOzPackage(file){
 const resolved=path.resolve(file),python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
 const output=execFileSync(python,[path.join(__dirname,'package.py'),'validate',resolved],{encoding:'utf8'});
 const info=JSON.parse(output);
 return {file:resolved,...info};
}

async function buildProject(directory,{output}={}){
 const root=path.resolve(directory);
 const configPath=path.join(root,'ozproject.json');
 let stat; try { stat=await fs.stat(configPath); } catch(error) { stat=null; }
 if(!stat) return buildApp(root,{output});
 const config=JSON.parse(await fs.readFile(configPath,'utf8'));
 if(output)config.output=output;
 const manifest=JSON.parse(await fs.readFile(path.join(root,'app.json'),'utf8'));
 if(manifest.format!=='hblauncher.gpu-app'||manifest.abi!==1)throw Error('Shader project app.json must use hblauncher.gpu-app ABI 1');
 const buildDir=projectPath(root,config.buildDir||'build');await fs.mkdir(buildDir,{recursive:true});
 compileShaderProject(root,config,manifest);
 const app=await require('../homebrew-launcher/app-catalog.cjs').readApp(root);
 if(!config.output)config.output=path.join(path.dirname(root),app.id+'.oz');
 const packageOutput=await preparePackage(root,config,manifest);
 return packageOutput;
}

module.exports={headers,compile,buildApp,compileShaderProject,preparePackage,buildProject,validateOzPackage};
if(require.main===module)buildProject(process.argv[2]||'.').then(res=>console.log('Built '+res)).catch(e=>{console.error(e);process.exitCode=1;});
