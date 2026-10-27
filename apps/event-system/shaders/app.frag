#version 450
#extension GL_GOOGLE_include_directive : require
layout(location=0) out vec4 outColor;
#define STATE_ACCESS readonly
#include "abi.glsl"
#define HB_READONLY
#include "hb.glsl"
#include "text.glsl"
#include "draw.glsl"
float numberText(vec2 p,vec2 origin,uint value){
 float coverage=0.0;uint divisor=10000u;
 for(int i=0;i<5;i++){
  uint digit=(value/divisor)%10u;
  coverage=max(coverage,text(p,origin+vec2(float(i)*20.0,0.0),DIGITS[int(digit)]));
  divisor=max(divisor/10u,1u);
 }
 return coverage;
}
void main(){
 vec2 p=gl_FragCoord.xy;
 vec3 color=vec3(.025,.007,.015);
 float glow=max(0.0,1.0-length((p-vec2(400,240))/vec2(900,620)));
 color=mix(color,vec3(.12,.012,.039),glow*.52);
 float panel=fill(box(p,vec2(960,570),vec2(770,390),16.0));
 color=mix(color,vec3(.055,.009,.023),panel);
 color=mix(color,vec3(.55,.025,.085),line(box(p,vec2(960,570),vec2(770,390),16.0),1.0));
 color=mix(color,vec3(.96,.055,.16),fill(box(p,vec2(196,244),vec2(3,68),1.0)));
 color=mix(color,vec3(.98,.94,.96),text(p,vec2(160,105),TEXT_TITLE));
 color=mix(color,vec3(.66,.59,.63),text(p,vec2(164,183),TEXT_SUBTITLE));
 color=mix(color,vec3(.98,.25,.37),text(p,vec2(220,280),TEXT_LAST_EVENT));
 uint eventType=c.game.x;
 if(eventType==HB_EVENT_BUTTON_PRESSED)color=mix(color,vec3(.99,.93,.95),text(p,vec2(220,326),TEXT_PRESSED));
 else if(eventType==HB_EVENT_BUTTON_RELEASED)color=mix(color,vec3(.99,.93,.95),text(p,vec2(220,326),TEXT_RELEASED));
 else if(eventType==HB_EVENT_SERVICE_COMPLETED)color=mix(color,vec3(.99,.93,.95),text(p,vec2(220,326),TEXT_COMPLETED));
 else if(eventType==HB_EVENT_SERVICE_FAILED)color=mix(color,vec3(1.0,.30,.40),text(p,vec2(220,326),TEXT_FAILED));
 else if(eventType==HB_EVENT_NETWORK_MESSAGE_RECEIVED)color=mix(color,vec3(.99,.93,.95),text(p,vec2(220,326),TEXT_NETWORK));
 else if(eventType==HB_EVENT_NFC_TAG_DETECTED)color=mix(color,vec3(.99,.93,.95),text(p,vec2(220,326),TEXT_NFC));
 else color=mix(color,vec3(.73,.65,.69),text(p,vec2(220,326),TEXT_WAITING));
 color=mix(color,vec3(.69,.60,.65),text(p,vec2(220,402),TEXT_EVENT_DATA));
 color=mix(color,vec3(.99,.95,.97),numberText(p,vec2(220,430),c.game.y));
 color=mix(color,vec3(.69,.60,.65),text(p,vec2(450,402),TEXT_STATUS));
 color=mix(color,c.game.z==0u?vec3(.99,.95,.97):vec3(1.0,.28,.39),numberText(p,vec2(450,430),c.game.z));
 color=mix(color,vec3(.69,.60,.65),text(p,vec2(680,402),TEXT_SEQUENCE));
 color=mix(color,vec3(.99,.95,.97),numberText(p,vec2(680,430),c.game.w));
 color=mix(color,vec3(.69,.60,.65),text(p,vec2(220,520),TEXT_QUEUE));
 color=mix(color,c.piece.y!=0?vec3(.99,.25,.37):vec3(.99,.95,.97),
           text(p,vec2(220,550),c.piece.y!=0?TEXT_PENDING:TEXT_EMPTY));
 color=mix(color,vec3(.69,.60,.65),text(p,vec2(220,635),TEXT_DROPPED));
 color=mix(color,c.piece.z>0?vec3(1.0,.28,.39):vec3(.99,.95,.97),numberText(p,vec2(220,665),uint(c.piece.z)));
 color=mix(color,vec3(.69,.60,.65),text(p,vec2(450,635),TEXT_ERRORS));
 color=mix(color,c.piece.w>0?vec3(1.0,.28,.39):vec3(.99,.95,.97),numberText(p,vec2(450,665),uint(c.piece.w)));
 color=mix(color,vec3(.96,.055,.16),fill(box(p,vec2(1550,943),vec2(14,14),4.0)));
 color=mix(color,vec3(.82,.77,.79),text(p,vec2(1580,936),TEXT_RETURN));
 outColor=vec4(color*(1.0-c.transition.x),1);
}
