#ifndef OZUI_GLSL
#define OZUI_GLSL

const uint OZUI_MAX_WIDGETS=32u;
const uint OZUI_ERROR_DUPLICATE_ID=1u;
const uint OZUI_ERROR_WIDGET_LIMIT=2u;
const uint OZUI_ERROR_INVALID_ID=4u;
const uint OZUI_ALIGN_START=0u;
const uint OZUI_ALIGN_CENTER=1u;
const uint OZUI_ALIGN_END=2u;

struct OzuiTheme {
    vec4 panel;
    vec4 button;
    vec4 focused;
    vec4 pressed;
    vec4 text;
    float cornerRadius;
};

struct OzuiColumn {
    vec2 origin;
    float width;
    float cursorY;
    float padding;
    float spacing;
};

OzuiTheme ozuiDefaultTheme() {
    return OzuiTheme(
        vec4(0.055,0.12,0.19,0.96),
        vec4(0.08,0.25,0.37,1.0),
        vec4(0.02,0.57,0.72,1.0),
        vec4(0.03,0.37,0.48,1.0),
        vec4(0.90,0.95,0.98,1.0),
        12.0
    );
}

void ozuiColumnBegin(out OzuiColumn column,vec2 origin,float width,float padding,float spacing) {
    column.origin=origin;
    column.width=max(0.0,width);
    column.cursorY=0.0;
    column.padding=max(0.0,padding);
    column.spacing=max(0.0,spacing);
}

vec4 ozuiColumnNext(inout OzuiColumn column,float height) {
    float itemHeight=max(0.0,height);
    vec4 result=vec4(
        column.origin+vec2(column.padding,column.cursorY+column.padding),
        max(0.0,column.width-2.0*column.padding),
        itemHeight
    );
    column.cursorY+=itemHeight+column.spacing;
    return result;
}

bool ozuiContains(vec2 point,vec4 rect) {
    return all(greaterThanEqual(point,rect.xy))&&all(lessThan(point,rect.xy+rect.zw));
}

#ifdef OZUI_INPUT
struct OzuiContext {
    uint ids[32];
    uint count;
    uint focusedId;
    uint pressedButtons;
    uint pointerDown;
    uint previousPointerDown;
    uint activationClaimed;
    uint errors;
    vec2 pointer;
};

void ozuiBegin(
    inout OzuiContext ui,
    uint focusedId,
    uint previousPointerDown,
    uint pressedButtons,
    vec2 pointer,
    uint pointerDown
) {
    ui.count=0u;
    ui.focusedId=focusedId;
    ui.pressedButtons=pressedButtons;
    ui.pointerDown=pointerDown;
    ui.previousPointerDown=previousPointerDown;
    ui.activationClaimed=0u;
    ui.errors=0u;
    ui.pointer=pointer;
    for(uint i=0u;i<OZUI_MAX_WIDGETS;i++)ui.ids[i]=0u;
}

bool ozuiButton(inout OzuiContext ui,uint id,vec4 rect) {
    if(id==0u) {
        ui.errors|=OZUI_ERROR_INVALID_ID;
        return false;
    }
    for(uint i=0u;i<ui.count;i++) {
        if(ui.ids[i]==id) {
            ui.errors|=OZUI_ERROR_DUPLICATE_ID;
            return false;
        }
    }
    if(ui.count>=OZUI_MAX_WIDGETS) {
        ui.errors|=OZUI_ERROR_WIDGET_LIMIT;
        return false;
    }
    ui.ids[ui.count++]=id;
    if(ui.focusedId==0u)ui.focusedId=id;
    bool controllerClick=ui.pointerDown==0u&&ui.focusedId==id&&(ui.pressedButtons&HB_A)!=0u;
    bool pointerClick=ui.pointerDown!=0u&&ui.previousPointerDown==0u&&
        ui.activationClaimed==0u&&ozuiContains(ui.pointer,rect);
    bool activated=ui.activationClaimed==0u&&(controllerClick||pointerClick);
    if(activated)ui.activationClaimed=1u;
    return activated;
}

void ozuiEnd(inout OzuiContext ui,out uint focusedId,out uint pointerDown) {
    bool found=false;
    uint focusIndex=0u;
    for(uint i=0u;i<ui.count;i++) {
        if(ui.ids[i]==ui.focusedId) {
            found=true;
            focusIndex=i;
        }
    }
    if(!found&&ui.count>0u) {
        ui.focusedId=ui.ids[0];
        focusIndex=0u;
    }

    uint forward=ui.pressedButtons&(HB_DOWN|HB_RIGHT);
    uint backward=ui.pressedButtons&(HB_UP|HB_LEFT);
    if(ui.count>0u&&forward!=0u&&backward==0u) {
        ui.focusedId=ui.ids[(focusIndex+1u)%ui.count];
    } else if(ui.count>0u&&backward!=0u&&forward==0u) {
        ui.focusedId=ui.ids[(focusIndex+ui.count-1u)%ui.count];
    }

    focusedId=ui.focusedId;
    pointerDown=ui.pointerDown;
}
#endif

#ifdef OZUI_RENDER
float ozuiRoundedRectMask(vec2 point,vec4 rect,float radius) {
    return fill(box(point,rect.xy+rect.zw*0.5,rect.zw*0.5,max(0.0,radius)));
}

vec3 ozuiComposite(vec3 background,vec4 foreground) {
    return mix(background,foreground.rgb,clamp(foreground.a,0.0,1.0));
}

vec4 ozuiPanel(vec2 point,vec4 rect,OzuiTheme theme) {
    return vec4(theme.panel.rgb,theme.panel.a*ozuiRoundedRectMask(point,rect,theme.cornerRadius));
}

vec4 ozuiButtonColor(vec2 point,vec4 rect,OzuiTheme theme,bool focused,bool pressed) {
    vec4 color=pressed?theme.pressed:(focused?theme.focused:theme.button);
    float mask=ozuiRoundedRectMask(point,rect,theme.cornerRadius);
    return vec4(color.rgb,color.a*mask);
}

vec4 ozuiLabelColor(vec2 point,vec2 origin,ivec4 glyph,vec4 color) {
    float mask=text(point,origin,glyph);
    return vec4(color.rgb,color.a*mask);
}

vec2 ozuiMapPixel(vec2 pixel,vec2 outputSize,vec2 logicalSize) {
    return pixel*logicalSize/max(outputSize,vec2(1.0));
}

vec2 ozuiTextOrigin(ivec4 glyph,vec4 bounds,uint horizontal,uint vertical) {
    vec2 origin=bounds.xy;
    if(horizontal==OZUI_ALIGN_CENTER)origin.x+=(bounds.z-float(glyph.z))*0.5;
    else if(horizontal==OZUI_ALIGN_END)origin.x+=bounds.z-float(glyph.z);
    if(vertical==OZUI_ALIGN_CENTER)origin.y+=(bounds.w-float(glyph.w))*0.5;
    else if(vertical==OZUI_ALIGN_END)origin.y+=bounds.w-float(glyph.w);
    return origin;
}
#endif

#endif
