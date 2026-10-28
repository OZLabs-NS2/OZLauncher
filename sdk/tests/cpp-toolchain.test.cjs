const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {buildProject,validateOzPackage}=require('../build.cjs');

test('C project builds and validates a .oz package',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-c-project-'));
 const project=path.join(root,'hello-c');
 await fs.mkdir(path.join(project,'src'),{recursive:true});
 await fs.mkdir(path.join(project,'assets'),{recursive:true});
 await fs.writeFile(path.join(project,'ozproject.json'),JSON.stringify({
   format:'oz.project',version:1,id:'hello-c',name:'Hello C',version:'0.1.0',description:'C hello world',language:'c',entry:'src/main.c',binary:'hello-c',assets:['assets']
 },null,2));
 await fs.writeFile(path.join(project,'src','main.c'),`#include <stdio.h>\nint main(void){puts("hello from c");return 0;}`);
 await fs.writeFile(path.join(project,'assets','note.txt'),'hello');
 const pkg=await buildProject(project);
 const info=await validateOzPackage(pkg);
 assert.equal(info.format,'oz.package');
 assert.equal(info.id,'hello-c');
 assert.ok(pkg.endsWith('.oz'));
 const base=path.dirname(pkg);
 const zipList=execFileSync('unzip',['-Z','-1',pkg],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 assert.ok(zipList.includes('manifest.json'));
 assert.ok(zipList.includes('bin/hello-c'));
 await fs.rm(root,{recursive:true,force:true});
});

test('C++ project builds and validates a .oz package',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-cpp-project-'));
 const project=path.join(root,'hello-cpp');
 await fs.mkdir(path.join(project,'src'),{recursive:true});
 await fs.writeFile(path.join(project,'ozproject.json'),JSON.stringify({
   format:'oz.project',version:1,id:'hello-cpp',name:'Hello C++',version:'0.1.0',description:'C++ hello world',language:'cpp',entry:'src/main.cpp',binary:'hello-cpp',assets:[]
 },null,2));
 await fs.writeFile(path.join(project,'src','main.cpp'),`#include <iostream>\nint main(){std::cout << "hello from cpp\\n";return 0;}`);
 const pkg=await buildProject(project);
 const info=await validateOzPackage(pkg);
 assert.equal(info.language,'cpp');
 assert.equal(info.id,'hello-cpp');
 assert.ok(pkg.endsWith('.oz'));
 await fs.rm(root,{recursive:true,force:true});
});

test('C and C++ SDK headers compile in generated app projects',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oz-sdk-headers-'));
 const cProject=path.join(root,'hello-c-ui');
 const cppProject=path.join(root,'hello-cpp-ui');
 await fs.mkdir(path.join(cProject,'src'),{recursive:true});
 await fs.mkdir(path.join(cppProject,'src'),{recursive:true});
 await fs.writeFile(path.join(cProject,'ozproject.json'),JSON.stringify({format:'oz.project',version:1,id:'hello-c-ui',name:'Hello C UI',version:'0.1.0',description:'C SDK UI',language:'c',entry:'src/main.c',binary:'hello-c-ui',assets:[]},null,2));
 await fs.writeFile(path.join(cppProject,'ozproject.json'),JSON.stringify({format:'oz.project',version:1,id:'hello-cpp-ui',name:'Hello C++ UI',version:'0.1.0',description:'C++ SDK UI',language:'cpp',entry:'src/main.cpp',binary:'hello-cpp-ui',assets:[]},null,2));
 await fs.writeFile(path.join(cProject,'src','main.c'),`#include <oz/oz.h>\n#include <oz/ui.h>\nint main(void){ oz_init(); ozui_context ui = {0U, 0, 0, 0, 0, 0, 0, 0, 0, 0}; oz_begin_frame(); ozui_begin(&ui); ozui_button(&ui, "hello", 0.0f, 0.0f, 32.0f, 16.0f); ozui_end(&ui); oz_end_frame(); oz_shutdown(); return 0; }`);
 await fs.writeFile(path.join(cppProject,'src','main.cpp'),`#include <oz/oz.hpp>\n#include <oz/ui.hpp>\nint main(){ oz::init(); oz::ui::context ui = {0U, 0, 0, 0, 0, 0, 0, 0, 0, 0}; oz::begin_frame(); oz::ui::begin(&ui); oz::ui::button(&ui, "hello", 0.0f, 0.0f, 32.0f, 16.0f); oz::ui::end(&ui); oz::end_frame(); oz::shutdown(); return 0; }`);
 const cPkg=await buildProject(cProject);
 const cppPkg=await buildProject(cppProject);
 assert.ok(cPkg.endsWith('.oz'));
 assert.ok(cppPkg.endsWith('.oz'));
 await fs.rm(root,{recursive:true,force:true});
});
