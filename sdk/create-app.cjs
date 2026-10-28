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
 const language=String((options.language||'gpu')).toLowerCase();
 if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)||typeof name!=='string'||!name.trim()||name.length>64)throw Error('Use a lowercase app-id and a display name of 1..64 characters');
 const root=path.resolve(__dirname,'../apps'),target=path.join(root,id);
 await fs.mkdir(target,{recursive:false});
 if(language==='gpu'||language==='glsl'){ 
   const source=path.join(root,'hello-world');
   for(const item of ['assets','shaders','assets.py','build.cjs','app.json'])await fs.cp(path.join(source,item),path.join(target,item),{recursive:true,errorOnExist:true,force:false});
   const manifest=JSON.parse(await fs.readFile(path.join(target,'app.json')));manifest.id=id;manifest.name=name;manifest.description='Built with HB SDK';manifest.sdk={version:1,capabilities:[]};
   await fs.writeFile(path.join(target,'app.json'),JSON.stringify(manifest,null,2)+'\n');
   await fs.writeFile(path.join(target,'README.md'),`# ${name}\n\nBuild from the project root:\n\n\`\`\`sh\nnode apps/${id}/build.cjs\n\`\`\`\n\nEdit shaders/app.comp for logic, shaders/app.frag for rendering, and assets.py for text and icon artwork. See ../../sdk/README.md for the complete SDK guide.\n`);
   return target;
 }
 const sourceDir=path.join(target); await fs.mkdir(path.join(sourceDir,'src'),{recursive:true});
 await fs.mkdir(path.join(sourceDir,'assets'),{recursive:true});
 await fs.mkdir(path.join(sourceDir,'include','oz'),{recursive:true});
 const manifest={format:'oz.project',version:1,id,name,version:'0.1.0',description:`Built with OZLauncher ${language.toUpperCase()} toolchain`,language,entry:language==='cpp'||language==='c++'?'src/main.cpp':'src/main.c',binary:id,assets:['assets'],capabilities:[]};
 await fs.writeFile(path.join(sourceDir,'ozproject.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(sourceDir,'build.cjs'),`const {buildProject}=require('../../sdk/build.cjs');\nasync function main(){ await buildProject(__dirname); }\nmain().catch(error=>{console.error(error);process.exitCode=1;});\n`);
 await fs.writeFile(path.join(sourceDir,'README.md'),`# ${name}\n\nCreate a ${language.toUpperCase()} OZ app project and build it with:\n\n\`\`\`sh\nnode apps/${id}/build.cjs\n\`\`\`\n\nThe project compiles to a .oz package using the SDK toolchain. Use #include <oz/oz.h> and #include <oz/ui.h> for the supported host-side C/C++ API.\n`);
 if(language==='cpp'||language==='c++'){
  await fs.writeFile(path.join(sourceDir,'src','main.cpp'),`#include <oz/oz.h>\n#include <oz/ui.h>\n#include <iostream>\n\nint main(){\n    oz_init();\n    ozui_context ui = {0U, 0, 0, 0, 0, 0, 0, 0, 0, 0};\n    while (oz_running()) {\n        oz_begin_frame();\n        ozui_begin(&ui);\n        if (ozui_button(&ui, "Hello from ${name}!", 40.0f, 30.0f, 220.0f, 52.0f)) {\n            oz_log("button pressed");\n        }\n        ozui_end(&ui);\n        oz_end_frame();\n    }\n    oz_shutdown();\n    return 0;\n}\n`);
 } else {
  await fs.writeFile(path.join(sourceDir,'src','main.c'),`#include <oz/oz.h>\n#include <oz/ui.h>\n#include <stdio.h>\n\nint main(void){\n    oz_init();\n    ozui_context ui = {0U, 0, 0, 0, 0, 0, 0, 0, 0, 0};\n    while (oz_running()) {\n        oz_begin_frame();\n        ozui_begin(&ui);\n        if (ozui_button(&ui, "Hello from ${name}!", 40.0f, 30.0f, 220.0f, 52.0f)) {\n            oz_log("button pressed");\n        }\n        ozui_end(&ui);\n        oz_end_frame();\n    }\n    oz_shutdown();\n    return 0;\n}\n`);
 }
 await fs.copyFile(path.join(__dirname,'include','oz','oz.h'),path.join(sourceDir,'include','oz.h'));
 await fs.copyFile(path.join(__dirname,'include','oz','oz.hpp'),path.join(sourceDir,'include','oz.hpp'));
 await fs.copyFile(path.join(__dirname,'include','oz','ui.h'),path.join(sourceDir,'include','oz','ui.h'));
 await fs.copyFile(path.join(__dirname,'include','oz','ui.hpp'),path.join(sourceDir,'include','oz','ui.hpp'));
 await fs.copyFile(path.join(__dirname,'include','oz','oz.h'),path.join(sourceDir,'include','oz','oz.h'));
 await fs.copyFile(path.join(__dirname,'include','oz','oz.hpp'),path.join(sourceDir,'include','oz','oz.hpp'));
 return target;
}
module.exports={create,parseArgs};
if(require.main===module){const {id,name,language}=parseArgs(process.argv.slice(2));create(id,name,{language}).then(p=>console.log('Created '+p+'; run its build.cjs to produce a .oz package.')).catch(e=>{console.error(e.message);process.exitCode=1;});}
