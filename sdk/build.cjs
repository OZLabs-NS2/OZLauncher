// Shared shader build entry point. All paths are explicit; no shell interpolation.
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {tool}=require('../scripts/toolchain.cjs');

function findExecutable(...candidates){
 for(const candidate of candidates){
  try{execFileSync(candidate,['--version'],{stdio:'ignore'});return candidate;}
  catch(error){}
 }
 const fallback=candidates[0];
 if(fallback) return fallback;
 throw Error('No compiler found');
}

function detectCompiler(language='c'){
 const id=String(language).toLowerCase();
 if(id==='cpp'||id==='c++') return process.env.CXX||tool('CXX','g++');
 return process.env.CC||tool('CC','gcc');
}

async function headers(directory){
 await fs.mkdir(directory,{recursive:true});
 for(const [source,target]of [['state.glsl','abi.glsl'],['hb.glsl','hb.glsl'],['draw.glsl','draw.glsl'],['ozui.glsl','ozui.glsl']])await fs.copyFile(path.join(__dirname,'include',source),path.join(directory,target));
}

function compile(source,output){
 execFileSync(tool('GLSLANG','glslangValidator'),['-V','-Os','-g0','--target-env','vulkan1.0',source,'-o',output],{stdio:'inherit'});
 execFileSync(tool('SPIRV_VAL','spirv-val'),['--target-env','vulkan1.0',output],{stdio:'inherit'});
}

async function buildApp(directory){
 directory=path.resolve(directory);await headers(path.join(directory,'shaders'));
 for(const stage of ['vert','frag','comp'])compile(path.join(directory,'shaders/app.'+stage),path.join(directory,'app.'+stage+'.spv'));
}

function compileCProject(projectRoot,config){
 const root=path.resolve(projectRoot),compiler=detectCompiler(config.language||'c');
 const buildDir=path.resolve(root, config.buildDir || 'build');
 const runtimeSource=path.join(__dirname,'lib','oz-runtime.c');
 const sources=[runtimeSource,...(config.sources||[config.entry]).filter(Boolean).map(item=>path.resolve(root,item))];
 const includeRoots=[...new Set([root,...(config.includeDirs||[]).map(i=>path.resolve(root,i)),path.join(__dirname,'include')])];
 const extraArgs=[];
 for(const include of includeRoots){extraArgs.push('-I',include);} 
 const outputPath=path.resolve(buildDir, config.binary || path.basename(root));
 const stdFlag=(config.language||'c').toLowerCase()==='cpp'||(config.language||'c').toLowerCase()==='c++' ? '-std=c++17' : '-std=c17';
 const commandArgs=[stdFlag,'-O2','-Wall','-Wextra',...extraArgs,'-o',outputPath,...sources];
 execFileSync(compiler,commandArgs,{cwd:root,stdio:'inherit'});
 return outputPath;
}

async function preparePackage(projectRoot,config){
 const root=path.resolve(projectRoot),buildDir=path.resolve(root, config.buildDir || 'build'),packageDir=path.join(buildDir,'.oz-package');
 await fs.rm(packageDir,{recursive:true,force:true});
 await fs.mkdir(packageDir,{recursive:true});
 if(config.assets){
  const entries=Array.isArray(config.assets)?config.assets:[config.assets];
  for(const item of entries){
   const from=path.resolve(root,item),relative=path.relative(root,from) || path.basename(from);
   const target=path.join(packageDir,relative);
   await fs.mkdir(path.dirname(target),{recursive:true});
   const stat=await fs.stat(from).catch(()=>null);
   if(!stat) continue;
   if(stat.isDirectory()){
    await fs.cp(from,target,{recursive:true,force:true});
   } else {
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(from,target);
   }
  }
 }
 const manifest={
   format:'oz.package',
   version:1,
   magic:'OZPKG1',
   id:config.id||path.basename(root),
   name:config.name||config.id||path.basename(root),
   version:config.version||'0.1.0',
   description:config.description||'',
   language:config.language||'c',
   capabilities:Array.isArray(config.capabilities)?config.capabilities:[],
   binary:config.binary||path.basename(root),
   entry:config.entry||''
 };
 await fs.writeFile(path.join(packageDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const binarySource=path.resolve(buildDir, config.binary || path.basename(root));
 const binaryTarget=path.join(packageDir,'bin',config.binary || path.basename(root));
 await fs.mkdir(path.dirname(binaryTarget),{recursive:true});
 await fs.copyFile(binarySource,binaryTarget);
 const zipTarget=path.join(buildDir,`${manifest.id}.oz`);
 execFileSync('zip',['-qr',zipTarget,'.'],{cwd:packageDir,stdio:'inherit'});
 return zipTarget;
}

async function validateOzPackage(file){
 const resolved=path.resolve(file);
 const entries=execFileSync('unzip',['-Z','-1',resolved],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
 const seen=new Set();
 for(const entry of entries){
  if(!entry||entry.includes('..')||path.isAbsolute(entry)||entry.startsWith('/')||entry.includes('\\')) throw Error('Rejected package path: '+entry);
  if(seen.has(entry)) throw Error('Duplicate package entry: '+entry);
  seen.add(entry);
 }
 if(!entries.includes('manifest.json')) throw Error('Missing manifest.json');
 const manifestText=execFileSync('unzip',['-p',resolved,'manifest.json'],{encoding:'utf8'});
 const manifest=JSON.parse(manifestText);
 if(!manifest||manifest.format!=='oz.package'||manifest.magic!=='OZPKG1') throw Error('Unsupported package format');
 if(!manifest.id||!manifest.version) throw Error('Malformed manifest metadata');
 return {file:resolved,format:manifest.format,version:manifest.version,magic:manifest.magic,id:manifest.id,name:manifest.name||manifest.id,language:manifest.language||'c',description:manifest.description||'',paths:[...entries]};
}

async function buildProject(directory){
 const root=path.resolve(directory);
 const configPath=path.join(root,'ozproject.json');
 let stat; try { stat=await fs.stat(configPath); } catch(error) { stat=null; }
 if(!stat) return buildApp(root);
 const config=JSON.parse(await fs.readFile(configPath,'utf8'));
 const buildDir=path.resolve(root, config.buildDir || 'build');
 await fs.mkdir(buildDir,{recursive:true});
 const binary=compileCProject(root,config);
 if(config.shaders){
  const shaders=Array.isArray(config.shaders)?config.shaders:Object.entries(config.shaders);
  for(const shader of shaders){
   const [source,target]=Array.isArray(shader)?shader:[shader,shader];
   const input=path.resolve(root,source),output=path.resolve(buildDir,path.basename(target,'.glsl')+'.spv');
   const compiler=tool('GLSLANG','glslangValidator');
   execFileSync(compiler,['-V','-Os','-g0','--target-env','vulkan1.0',input,'-o',output],{cwd:root,stdio:'inherit'});
   execFileSync(tool('SPIRV_VAL','spirv-val'),['--target-env','vulkan1.0',output],{stdio:'inherit'});
  }
 }
 const packageOutput=await preparePackage(root,config);
 return packageOutput;
}

module.exports={headers,compile,buildApp,compileCProject,preparePackage,buildProject,validateOzPackage};
if(require.main===module)buildProject(process.argv[2]||'.').then(res=>console.log('Built '+res)).catch(e=>{console.error(e);process.exitCode=1;});
