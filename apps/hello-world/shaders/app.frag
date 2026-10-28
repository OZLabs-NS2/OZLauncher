#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#include "text.glsl"
#include "draw.glsl"
#define OZUI_RENDER
#include "ozui.glsl"
void main(){
 vec2 p=ozuiMapPixel(gl_FragCoord.xy,vec2(1920.0,1080.0),vec2(1280.0,720.0));
 OzuiTheme theme=ozuiDefaultTheme();
 vec3 color=mix(vec3(.035,.10,.19),vec3(.04,.22,.32),p.y/720.0);
 color=ozuiComposite(color,ozuiPanel(p,vec4(220.0,150.0,840.0,420.0),theme));
 OzuiColumn buttons;
 ozuiColumnBegin(buttons,vec2(300.0,385.0),680.0,0.0,16.0);
 vec4 startButton=ozuiColumnNext(buttons,72.0);
 vec4 backButton=ozuiColumnNext(buttons,72.0);
 bool startFocused=c.game.x==0u||c.game.x==1u;
 bool backFocused=c.game.x==2u;
 bool started=c.game.z>0u;
 color=ozuiComposite(color,ozuiButtonColor(p,startButton,theme,startFocused,false));
 color=ozuiComposite(color,ozuiButtonColor(p,backButton,theme,backFocused,false));
 color=ozuiComposite(color,ozuiLabelColor(p,ozuiTextOrigin(TEXT_HELLO,vec4(220.0,205.0,840.0,100.0),OZUI_ALIGN_CENTER,OZUI_ALIGN_CENTER),TEXT_HELLO,vec4(.25,.85,.90,1)));
 color=ozuiComposite(color,ozuiLabelColor(p,ozuiTextOrigin(TEXT_MESSAGE,vec4(260.0,325.0,760.0,48.0),OZUI_ALIGN_CENTER,OZUI_ALIGN_CENTER),TEXT_MESSAGE,theme.text));
 ivec4 actionText=started?TEXT_STARTED:TEXT_BUTTON;
 color=ozuiComposite(color,ozuiLabelColor(p,ozuiTextOrigin(actionText,startButton,OZUI_ALIGN_CENTER,OZUI_ALIGN_CENTER),actionText,vec4(1.0)));
 color=ozuiComposite(color,ozuiLabelColor(p,ozuiTextOrigin(TEXT_BACK,backButton,OZUI_ALIGN_CENTER,OZUI_ALIGN_CENTER),TEXT_BACK,vec4(1.0)));
 color=ozuiComposite(color,ozuiLabelColor(p,ozuiTextOrigin(TEXT_RETURN,vec4(260.0,570.0,760.0,40.0),OZUI_ALIGN_CENTER,OZUI_ALIGN_CENTER),TEXT_RETURN,vec4(.60,.72,.80,1)));
 outColor=vec4(color*(1.0-c.transition.x),1);
}
