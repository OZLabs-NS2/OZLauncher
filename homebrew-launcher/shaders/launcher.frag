#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "launcher-state.glsl"
#define HB_READONLY
#include "hb.glsl"
#include "launcher-text.glsl"
#include "draw.glsl"
const vec3 CRIMSON=vec3(.96,.055,.16);
const vec3 CRIMSON_LIGHT=vec3(1.0,.22,.34);
const vec3 WINE=vec3(.13,.018,.038);
float catalogText(vec2 p,vec2 origin,uint index,bool description){
 ivec2 q=ivec2(floor(p-origin));uint base=524288u+index*32768u,meta=base+25600u;
 uint width=c.atlas[meta+(description?2u:0u)],height=c.atlas[meta+(description?3u:1u)];
 if(any(lessThan(p-origin,vec2(0)))||q.x>=int(width)||q.y>=int(height))return 0.0;
 uint pixel=uint(q.y+(description?64:0))*512u+uint(q.x),word=c.atlas[base+(pixel>>2u)];
 return float((word>>((pixel&3u)*8u))&255u)/255.0;
}
vec4 catalogIcon(vec2 p,vec2 center,uint index){
 ivec2 q=ivec2(floor((p-center+vec2(36))*96.0/72.0));
 if(any(lessThan(q,ivec2(0)))||any(greaterThanEqual(q,ivec2(96))))return vec4(0);
 return unpackUnorm4x8(c.atlas[524288u+index*32768u+16384u+uint(q.y*96+q.x)]);
}
void main() {
    vec2 p=gl_FragCoord.xy;
    float t=c.motion.x;
    vec3 col=vec3(.025,.007,.015);
    float glow=max(0.0,1.0-length((p-vec2(350,280))/vec2(780,570)));
    col=mix(col,vec3(.105,.012,.034),glow*.55);
    float grid=max(line(mod(p.x-96.0,64.0),.35),line(mod(p.y-48.0,64.0),.35));
    col=mix(col,vec3(.30,.025,.064),grid*.16);
    col=mix(col,vec3(.050,.009,.021),fill(box(p,vec2(960,570),vec2(890,388),8.0))*.78);
    col=mix(col,vec3(.074,.012,.028),fill(box(p,vec2(960,116),vec2(960,116),0.0)));
    col=mix(col,vec3(.30,.035,.075),line(p.y-231.0,.7)*.7);
    col=mix(col,vec3(.30,.035,.075),line(p.y-972.0,.7)*.7);

    col=mix(col,vec3(.30,.045,.085),fill(box(p,vec2(83,590),vec2(1,326),1.0))*.65);
    col=mix(col,CRIMSON,fill(box(p,vec2(83,329),vec2(2,34),1.0)));
    col=mix(col,CRIMSON,line(p.x-0.0,1.5)*.8);

    vec2 mark=p-vec2(99,111);
    col=mix(col,CRIMSON,line(length(mark)-20.0,2.2));
    col=mix(col,CRIMSON_LIGHT,line(mark.x+mark.y,2.0)*step(-8.0,mark.x)*step(mark.x,8.0));
    col=mix(col,vec3(.97,.97,.98),text(p,vec2(145,66),TEXT_TITLE));
    col=mix(col,vec3(.63,.66,.72),text(p,vec2(150,145),TEXT_PLATFORM));

    // Refresh stays at the original hit target used by touch and optical input.
    vec2 refresh=p-vec2(1660,179);
    float hover=fill(length(refresh)-65.0);
    col=mix(col,vec3(.15,.018,.042),hover*.75);
    col=mix(col,CRIMSON,line(length(refresh)-42.0,1.0)*.75);
    float turn=c.refresh.y;
    vec2 arrow=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*refresh;
    float arc=line(length(arrow)-17.0,2.5)*smoothstep(-2.5,-2.42,atan(arrow.y,arrow.x));
    vec2 tip=vec2(-17.0,0.0),local=arrow-tip;
    float head=fill(max(max(local.y-4.0,-local.y*.5+local.x*.866-4.0),-local.y*.5-local.x*.866-4.0));
    col=mix(col,CRIMSON_LIGHT,max(arc,head));
    col=mix(col,vec3(.91,.92,.94),text(p,vec2(1712,172),TEXT_REFRESH));

    col=mix(col,CRIMSON_LIGHT,text(p,vec2(152,286),TEXT_SECTION));
    col=mix(col,vec3(.96,.97,.98),text(p,vec2(152,322),TEXT_LIBRARY));
    col=mix(col,vec3(.62,.65,.71),text(p,vec2(154,374),TEXT_GUIDE));
    uint count=min(c.library.x,32u);
    if(count>0u) {
        col=mix(col,vec3(.57,.60,.66),text(p,vec2(1510,339),TEXT_AVAILABLE));
        for(int digit=0;digit<2;digit++){
            uint divisor=digit==0?10u:1u;
            uint number=(count/divisor)%10u;
            col=mix(col,vec3(.96,.97,.98),text(p,vec2(1683.0+float(digit)*25.0,322),DIGITS[int(number)]));
        }
    }
    uint page=(c.state.x/3u)*3u;
    for(int i=0;i<3;i++) {
        uint index=page+uint(i);if(index>=count) continue;
        bool installed=index<c.reserved.w;
        float y=551.0+float(i)*151.0;
        float selected=c.state.x==index?1.0:0.0;
        float d=box(p,vec2(960,y),vec2(660,62),8.0);
        vec3 surface=mix(vec3(.075,.012,.029),vec3(.19,.018,.048),selected);
        col=mix(col,surface,fill(d));
        col=mix(col,mix(vec3(.28,.035,.074),vec3(.78,.045,.12),selected),line(d,selected>.5?1.2:.7));
        float rail=box(p,vec2(313,y),vec2(2.0,22.0),1.0);
        col=mix(col,CRIMSON,fill(rail)*selected);
        float tile=box(p,vec2(370,y),vec2(43,43),7.0);
        col=mix(col,vec3(.15,.022,.044),fill(tile));
        col=mix(col,vec3(.38,.045,.09),line(tile,.8));
        if(installed){
            vec4 icon=catalogIcon(p,vec2(370,y),index);col=mix(col,icon.rgb,icon.a);
            col=mix(col,vec3(.95,.96,.98),catalogText(p,vec2(450,y-30),index,false));
            col=mix(col,vec3(.62,.65,.71),catalogText(p,vec2(452,y+18),index,true));
            col=mix(col,CRIMSON_LIGHT,fill(length(p-vec2(1485,y-7.0))-3.0));
            col=mix(col,vec3(.62,.65,.71),text(p,vec2(1497,y-14.0),TEXT_READY));
        }else{
            float plus=min(box(p,vec2(370,y),vec2(11,1),1.0),box(p,vec2(370,y),vec2(1,11),1.0));
            col=mix(col,vec3(.60,.62,.67),fill(plus)*.75);
            col=mix(col,vec3(.62,.65,.71),text(p,vec2(450,y-7),TEXT_EMPTY_SLOT));
        }
    }
    if(count==0u) {
        vec2 center=vec2(960,642);
        float emptyPanel=box(p,center,vec2(650,162),8.0);
        col=mix(col,vec3(.075,.012,.029),fill(emptyPanel));
        col=mix(col,vec3(.36,.045,.09),line(emptyPanel,.8));
        col=mix(col,CRIMSON,fill(box(p,center+vec2(-627,-125),vec2(2,24),1.0)));
        col=mix(col,vec3(.95,.96,.98),text(p,vec2(960.0-float(TEXT_NOTITLES.z)*.5,605),TEXT_NOTITLES));
        col=mix(col,vec3(.62,.65,.71),text(p,vec2(960.0-float(TEXT_EMPTYHINT.z)*.5,665),TEXT_EMPTYHINT));
    } else {
        col=mix(col,CRIMSON,fill(box(p,vec2(1470,1017),vec2(14,14),4.0)));
        col=mix(col,vec3(1),text(p,vec2(1465,1011),TEXT_BUTTON_A));
        col=mix(col,vec3(.82,.84,.87),text(p,vec2(1495,1009),TEXT_SELECT));
    }
    col=mix(col,vec3(.15,.018,.042),fill(box(p,vec2(1629,1017),vec2(14,14),4.0)));
    col=mix(col,vec3(.82,.84,.87),text(p,vec2(1624,1011),TEXT_BUTTON_B));
    col=mix(col,vec3(.82,.84,.87),text(p,vec2(1654,1009),TEXT_BACK));

    float modal=c.motion.z;
    if(modal>.001) {
        col=mix(col,vec3(.018,.020,.025),modal*.82);
        float d=box(p,vec2(960,540),vec2(430,190),10.0);
        col=mix(col,vec3(.095,.012,.032),fill(d)*modal);
        col=mix(col,vec3(.42,.045,.10),line(d,.9)*modal);
        col=mix(col,CRIMSON,fill(box(p,vec2(960,353),vec2(428,2),1.0))*modal);
        col=mix(col,CRIMSON,line(length(p-vec2(588,424))-14.0,2.0)*modal);
        col=mix(col,vec3(.95,.96,.98),text(p,vec2(632,411),TEXT_EMPTY)*modal);
        col=mix(col,vec3(.68,.70,.75),text(p,vec2(632,476),TEXT_DETAIL)*modal);
        col=mix(col,CRIMSON_LIGHT,text(p,vec2(632,565),TEXT_CLOSE)*modal);
    }
    if(hbHas(HB_JOY_MOUSE)&&c.game.x!=0u&&c.stats.w!=0u){
        vec2 q=p-c.flow.xy;
        float cursor=min(stroke(q,vec2(0),vec2(0,28)),min(stroke(q,vec2(0),vec2(22,20)),stroke(q,vec2(0,28),vec2(22,20))));
        col=mix(col,vec3(1),fill(cursor-3.8));col=mix(col,WINE,fill(cursor-1.7));
    }
    col=mix(col,vec3(.43,.46,.52),text(p,vec2(96,1024),TEXT_CREDIT));
    outColor=vec4(col*(1.0-c.transition.x),1);
}
