const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {tool}=require('../../scripts/toolchain.cjs');
async function main(){
 const root=path.resolve(__dirname,'../..'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'hello-world-check-'));
 for(const [name,buttons,connected,previous,want,started,focus] of [['idle',0,1,0,0,0,1],['A activates',1,1,0,0,1,1],['down moves focus',32768,1,0,0,0,2],['B',2,1,0,1,0,1],['Minus',2048,1,0,1,0,1],['held B',2,1,2,0,0,1],['disconnected',2,0,0,0,0,1]]){
  const state=Buffer.alloc(1024);state.writeUInt32LE(previous,84);state.writeFloatLE(1,960);
  const input=Buffer.alloc(64);input.writeUInt32LE(buttons,8);input.writeUInt32LE(connected,32);
  await fs.writeFile(path.join(dir,'state'),state);await fs.writeFile(path.join(dir,'input'),input);
  execFileSync(path.join(root,'homebrew-launcher/game-compute-check'),[path.join(dir,'state'),path.join(dir,'output'),path.join(__dirname,'app.comp.spv'),path.join(dir,'input'),'1'],{stdio:'pipe'});
  const out=await fs.readFile(path.join(dir,'output'));assert.equal(out.readUInt32LE(1016),want,name);assert.ok(out.readFloatLE(960)<1);assert.equal(out.readUInt32LE(792),started,name+' start count');assert.equal(out.readUInt32LE(784),focus,name+' focus');assert.equal(out.readUInt32LE(796),0,name+' UI errors');
 }
 const uiShader=path.join(dir,'ozui-check.spv'),uiState=path.join(dir,'ozui-state.bin'),uiInput=path.join(dir,'ozui-input.bin'),uiOutput=path.join(dir,'ozui-output.bin');
 execFileSync(tool('GLSLANG','glslangValidator'),['-V','-Os','-g0','--target-env','vulkan1.0',path.join(root,'sdk/tests/ozui-check.comp'),'-o',uiShader],{stdio:'pipe'});
 execFileSync(tool('SPIRV_VAL','spirv-val'),['--target-env','vulkan1.0',uiShader],{stdio:'pipe'});
 await fs.writeFile(uiState,Buffer.alloc(1024));await fs.writeFile(uiInput,Buffer.alloc(64));
 execFileSync(path.join(root,'homebrew-launcher/game-compute-check'),[uiState,uiOutput,uiShader,uiInput,'1'],{stdio:'pipe'});
 const ui=await fs.readFile(uiOutput);
 assert.equal(ui.readUInt32LE(784),9,'controller navigation');
 assert.equal(ui.readUInt32LE(788),1,'pointer down persistence');
 assert.equal(ui.readUInt32LE(792),1,'only one overlapping pointer button activates');
 assert.equal(ui.readUInt32LE(796),1537,'duplicate ID, invalid ID, and widget limit diagnostics');
 assert.deepEqual([ui.readFloatLE(816),ui.readFloatLE(820),ui.readFloatLE(824),ui.readFloatLE(828)],[15,25,15,62],'column layout');
 const touchState=Buffer.alloc(1024),touchInput=Buffer.alloc(64);
 touchState.writeUInt32LE(1,136);touchState.writeUInt32LE(600,160);touchState.writeUInt32LE(400,164);
 await fs.writeFile(uiState,touchState);await fs.writeFile(uiInput,touchInput);
 execFileSync(path.join(root,'homebrew-launcher/game-compute-check'),[uiState,uiOutput,path.join(__dirname,'app.comp.spv'),uiInput,'1'],{stdio:'pipe'});
 const touchResult=await fs.readFile(uiOutput);
 assert.equal(touchResult.readUInt32LE(792),1,'touch activates the button');
 const navState=Buffer.alloc(1024),navInput=Buffer.alloc(128);
 navInput.writeUInt32LE(32768,8);navInput.writeUInt32LE(1,32);
 navInput.writeUInt32LE(1,64+8);navInput.writeUInt32LE(1,64+32);
 await fs.writeFile(uiState,navState);await fs.writeFile(uiInput,navInput);
 execFileSync(path.join(root,'homebrew-launcher/game-compute-check'),[uiState,uiOutput,path.join(__dirname,'app.comp.spv'),uiInput,'2'],{stdio:'pipe'});
 const navResult=await fs.readFile(uiOutput);
 assert.equal(navResult.readUInt32LE(784),2,'focus moves before activating the next button');
 assert.equal(navResult.readUInt32LE(1016),1,'focused return button requests the existing app exit');
 const state=Buffer.alloc(1024);await fs.writeFile(path.join(dir,'state'),state);
 execFileSync(path.join(root,'homebrew-launcher/game-render'),[path.join(dir,'state'),path.join(__dirname,'assets/text.bin'),__dirname,path.join(dir,'preview.rgba')],{env:{...process.env,HB_SHADER_PREFIX:'app'},stdio:'pipe'});
 execFileSync('python3',['-c','from PIL import Image; import sys; Image.frombytes("RGBA",(1920,1080),open(sys.argv[1],"rb").read()).save(sys.argv[2])',path.join(dir,'preview.rgba'),path.join(dir,'preview.png')]);
 const rendered=await fs.readFile(path.join(dir,'preview.rgba'));
 const pixel=(x,y)=>[...rendered.subarray((y*1920+x)*4,(y*1920+x)*4+3)];
 assert.notDeepEqual(pixel(960,540),pixel(100,100),'panel composites over the background');
 assert.notDeepEqual(pixel(960,630),pixel(960,540),'focused button is rendered');
 let brightGlyphPixels=0;
 for(let y=300;y<440;y++)for(let x=500;x<1420;x++){
  const [r,g,b]=pixel(x,y);
  if(r<100&&g>150&&b>150)brightGlyphPixels++;
 }
 assert.ok(brightGlyphPixels>1000,'font atlas label is rendered');
 console.log('Passed: OZUI panel/button render, controller focus and activation, B/Minus exit, held button and disconnected input.');console.log('Preview: '+path.join(dir,'preview.png'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
