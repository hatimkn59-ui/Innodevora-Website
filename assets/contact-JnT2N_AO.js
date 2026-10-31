import{a as e,i as t,n,o as r,r as i,t as a}from"./setupCrossPageTransitions-CltNm_Hf.js?v=3";import{$ as o,H as s,M as c,N as l,Q as u,St as d,U as ee,V as f,Z as p,_t as m,bt as h,ct as te,d as ne,f as re,i as ie,l as ae,lt as g,mt as oe,n as se,p as _,r as v,st as y,t as b,ut as ce,v as le,wt as ue,yt as de,z as x}from"./three.module-fBMLdKIM.js";var fe=`/home/hero/textures`;function pe({renderer:e}={}){let t=new m,n=`${fe}/${window.matchMedia(`(hover: none) and (pointer: coarse)`).matches?`mobile`:`desktop`}`,r=null,i=null,a=null,o=!1,s=(async()=>{try{let s=await t.loadAsync(`${n}/scene-gradient.webp`);if(o)return s.dispose(),null;s.mapping=303,s.colorSpace=te,r=s,i=new v(s.image.height),i.fromEquirectangularTexture(e,s);let c=new b(e);try{c.compileEquirectangularShader(),a=c.fromEquirectangular(s)}finally{c.dispose()}return o?(i.dispose(),a.dispose(),i=null,a=null,null):{backgroundMap:i.texture,environmentMap:a.texture}}catch(e){throw c(),e}})();function c(){o||(o=!0,r?.dispose(),i?.dispose(),a?.dispose(),r=null,i=null,a=null)}return{ready:s,dispose:c}}var S=`/contact/textures`,me=[`desktop`,`mobile`];function he(e){let t=e===`fr`?`fr`:`en`;return me.flatMap(e=>[{layout:e,name:`headline`,type:`text`,url:`${S}/${t}/heading-${t}-${e}.png`},{layout:e,name:`availability`,type:`text`,url:`${S}/${t}/availability-${t}-${e}.png`},{layout:e,name:`services`,type:`text`,url:`${S}/${t}/services-${t}-${e}.png`},{layout:e,name:`contact`,type:`text`,url:`${S}/contact-${e}.png`},{layout:e,name:`sphere`,type:`sphere`,url:`${S}/sphere-${e}.webp`}])}function ge(e,t){e.colorSpace=te,e.magFilter=c,t===`text`?(e.wrapS=_,e.wrapT=_,e.generateMipmaps=!1,e.minFilter=c):(e.wrapS=y,e.wrapT=_,e.generateMipmaps=!0,e.minFilter=l),e.needsUpdate=!0}function C(e){let t=e.source.data,n=t?.naturalWidth||t?.videoWidth||t?.width||1,r=t?.naturalHeight||t?.videoHeight||t?.height||1;return{width:n,height:r,aspectRatio:n/r}}function _e({language:e=`en`}={}){let t=new m,n=new Set,r=!1,i=(async()=>{try{let i=he(e),a=await Promise.all(i.map(async e=>{let i=await t.loadAsync(e.url);return r?(i.dispose(),null):(ge(i,e.type),n.add(i),{layout:e.layout,name:e.name,texture:i,...C(i)})}));return r||a.some(e=>e===null)?null:a.reduce((e,t)=>(e[t.layout][t.name]={texture:t.texture,width:t.width,height:t.height,aspectRatio:t.aspectRatio},e),{desktop:{},mobile:{}})}catch(e){throw a(),e}})();function a(){r||(r=!0,n.forEach(e=>{e.dispose()}),n.clear())}return{ready:i,dispose:a}}var ve=`precision highp float;

uniform sampler2D uEnvironment;
uniform sampler2D uSphere;
uniform sampler2D uText;
uniform vec2 uContentViewportOffset;
uniform vec2 uContentViewportScale;
uniform vec2 uResolution;
uniform vec4 uFrameBounds;
uniform float uFrameRadius;
uniform float uEnvironmentOpacity;

uniform float uTime;
uniform float uIdleSpeed;
uniform float uSphereIdleStrength;
uniform vec2 uIdleFrequency;

uniform vec2 uMouse;
uniform vec2 uVelocity;
uniform float uStrength;
uniform float uRadius;
uniform float uInteractionStrength;

varying vec2 vUv;

float roundedFrameMask(vec2 point) {
  vec2 halfSize = uFrameBounds.zw * 0.5;
  float radius = min(uFrameRadius, min(halfSize.x, halfSize.y));
  vec2 center = uFrameBounds.xy + halfSize;
  vec2 localPoint = abs(point - center) - (halfSize - vec2(radius));
  float distanceToFrame =
    length(max(localPoint, 0.0)) +
    min(max(localPoint.x, localPoint.y), 0.0) -
    radius;
  float edgeWidth = max(fwidth(distanceToFrame), 0.0001);

  return 1.0 - smoothstep(-edgeWidth, edgeWidth, distanceToFrame);
}

vec2 contentUv(vec2 screenUv) {
  return
    uContentViewportOffset +
    screenUv * uContentViewportScale;
}

float contentBoundsMask(vec2 uv) {
  vec2 edgeWidth = max(fwidth(uv), vec2(0.000001));
  vec2 lowerBoundsMask =
    smoothstep(-edgeWidth, vec2(0.0), uv);
  vec2 upperBoundsMask =
    1.0 -
    smoothstep(
      vec2(1.0),
      vec2(1.0) + edgeWidth,
      uv
    );

  return
    lowerBoundsMask.x *
    lowerBoundsMask.y *
    upperBoundsMask.x *
    upperBoundsMask.y;
}

void main() {
  vec2 uv = vUv;
  float time = uTime * uIdleSpeed;

  vec2 idleFlow = vec2(
    sin(uv.y * uIdleFrequency.x + time) +
      sin(uv.x * 1.7 - time * 0.63) * 0.5,
    cos(uv.x * uIdleFrequency.y - time * 0.7) +
      cos(uv.y * 1.5 + time * 0.47) * 0.5
  ) / 1.5;

  vec2 mouseDelta = uv - uMouse;
  mouseDelta.x *= uResolution.x / uResolution.y;

  float mouseInfluence = smoothstep(uRadius, 0.0, length(mouseDelta));
  vec2 mouseOffset =
    uVelocity * mouseInfluence * uStrength * uInteractionStrength;
  vec2 pointerUv = uv - mouseOffset;
  vec2 sphereScreenUv =
    pointerUv + idleFlow * uSphereIdleStrength;

  vec2 textUv = contentUv(pointerUv);
  vec2 sphereUv = contentUv(sphereScreenUv);
  float textBoundsMask = contentBoundsMask(textUv);
  float sphereBoundsMask = contentBoundsMask(sphereUv);
  vec2 environmentUv = clamp(pointerUv, 0.0, 1.0);
  vec2 textSampleUv = clamp(textUv, 0.0, 1.0);
  vec2 sphereSampleUv = clamp(sphereUv, 0.0, 1.0);

  vec4 environmentColor = texture2D(uEnvironment, environmentUv);
  vec4 sphereColor =
    texture2D(uSphere, sphereSampleUv) * sphereBoundsMask;
  vec4 textColor =
    texture2D(uText, textSampleUv) * textBoundsMask;

  float frameMask = roundedFrameMask(vUv * uResolution);

  environmentColor *= frameMask * uEnvironmentOpacity;

  vec4 sphereComposite =
    sphereColor +
    environmentColor * (1.0 - sphereColor.a);
  vec4 finalColor =
    textColor +
    sphereComposite * (1.0 - textColor.a);

  if (finalColor.a > 0.0) {
    finalColor.rgb /= finalColor.a;
  } else {
    finalColor.rgb = vec3(0.0);
  }

  gl_FragColor = finalColor;

  #include <colorspace_fragment>

  gl_FragColor.rgb *= gl_FragColor.a;
}`,ye=`varying vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,be=700,xe=1.5,Se=.04,Ce=.3,we=.55,Te=`hero`,w=x.degToRad(-10),Ee=120,T=Object.freeze({radius:.3,velocityGain:.25,positionDamping:.1,velocityDamping:.15,strengthRise:.15,strengthDecay:.03,sphereIdleStrength:{desktop:.04,mobile:.005},interactionStrength:1,idleSpeed:.25,idleFrequency:[5,20]});function De(e,t){return 1-(1-e)**(t*60)}var Oe={desktop:{referenceWidth:1440,referenceHeight:1023,exportScale:2,floatAmplitude:25,planes:{headline:{align:`center`,x:720.5,top:260,minScale:.7},availability:{align:`center`,x:720.5,top:584.41,minScale:.7},services:{anchor:`bottom-left`,left:92,bottom:136},contact:{anchor:`bottom-left`,left:93,bottom:81.5}},sphere:{centerX:1177,centerY:926.5,diameter:940}},mobile:{referenceWidth:390,referenceHeight:844,exportScale:1,floatAmplitude:30,planes:{headline:{align:`center`,x:195,top:101},availability:{align:`center`,x:195,top:238},services:{align:`left`,x:77,top:611},contact:{align:`left`,x:78,top:740}},sphere:{centerX:335.5,centerY:520.5,diameter:429}}};function E(e){let t=new f(new o(1,1),new s({transparent:!0,depthTest:!1,depthWrite:!1,toneMapped:!1}));return t.position.z=10,t.renderOrder=10,e.add(t),t}function D({canvas:e,root:t,language:n=`en`,reducedMotion:r=!1}={}){if(!(e instanceof HTMLCanvasElement)||!(t instanceof HTMLElement))return null;let i=t.querySelector(`.contact__frame`),a=t.querySelector(`.contact__email`);if(!(i instanceof HTMLElement))return null;let o;try{o=new ie({canvas:e,alpha:!0,antialias:!0,premultipliedAlpha:!0,powerPreference:`high-performance`})}catch(e){return console.error(`Unable to initialize the Contact WebGL renderer.`,e),null}o.outputColorSpace=te,o.toneMapping=4,o.toneMappingExposure=1,o.setClearColor(0,0),o.autoClear=!1;let l=new g,m=new g,_=new g,v=new g;l.background=null,m.background=null;let y=new p(-.5,.5,.5,-.5,.1,2e3),b=new p(-.5,.5,.5,-.5,.1,2e3),x=new u(35,1,.1,100),fe=new re;y.position.set(0,0,1e3),y.lookAt(0,0,0),b.position.copy(y.position),b.quaternion.copy(y.quaternion),x.position.set(0,0,6),x.lookAt(0,0,0),x.rotation.y=w;let S=new ce({name:`ContactHeroBackgroundMaterial`,uniforms:de.clone(se.backgroundCube.uniforms),vertexShader:se.backgroundCube.vertexShader,fragmentShader:se.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,toneMapped:!1});Object.defineProperty(S,`envMap`,{get(){return this.uniforms.envMap.value}});let me=new ae(1,1,1),he=new f(me,S);he.onBeforeRender=function(e,t,n){this.matrixWorld.copyPosition(n.matrixWorld)},_.add(he);let ge=window.matchMedia(`(hover: none) and (pointer: coarse)`).matches,C=new ue(1,1,{depthBuffer:!1,stencilBuffer:!1,colorSpace:``}),D=new ue(1,1,{depthBuffer:!0,stencilBuffer:!1,samples:ge?0:4,colorSpace:``}),O=new ue(1,1,{depthBuffer:!1,stencilBuffer:!1,samples:0,colorSpace:``});C.texture.generateMipmaps=!1,C.texture.minFilter=c,C.texture.magFilter=c,D.texture.generateMipmaps=!1,D.texture.minFilter=c,D.texture.magFilter=c,O.texture.generateMipmaps=!1,O.texture.minFilter=c,O.texture.magFilter=c;let k=new ne;k.setAttribute(`position`,new le([-1,-1,0,3,-1,0,-1,3,0],3));let A=new ce({vertexShader:ye,fragmentShader:ve,uniforms:{uEnvironment:{value:C.texture},uSphere:{value:D.texture},uText:{value:O.texture},uContentViewportOffset:{value:new h},uContentViewportScale:{value:new h(1,1)},uResolution:{value:new h(1,1)},uFrameBounds:{value:new d},uFrameRadius:{value:0},uEnvironmentOpacity:{value:+(Te===`hero`)},uTime:{value:0},uIdleSpeed:{value:T.idleSpeed},uSphereIdleStrength:{value:0},uIdleFrequency:{value:new h(...T.idleFrequency)},uMouse:{value:new h(.5,.5)},uVelocity:{value:new h},uStrength:{value:0},uRadius:{value:T.radius},uInteractionStrength:{value:r?0:T.interactionStrength}},transparent:!0,depthTest:!1,depthWrite:!1,toneMapped:!1,blending:0}),j=new f(k,A);j.frustumCulled=!1,v.add(j);let ke=E(m),Ae=E(m),je=E(m),M=E(m),N={headline:ke,availability:Ae,services:je,contact:M},Me=new oe(1,64,48),P=new s({depthTest:!0,depthWrite:!0,toneMapped:!1}),Ne=new ee({color:16777215,metalness:1,roughness:.4,envMapIntensity:1.2,toneMapped:!1});Ne.onBeforeCompile=e=>{e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
#include <tonemapping_pars_fragment>`).replace(`#include <tonemapping_fragment>`,`gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);`)};let F=new f(Me,P),Pe=-Math.PI*.25+w;F.rotation.y=Pe,F.renderOrder=0,l.add(F);let Fe=_e({language:n}),Ie=pe({renderer:o}),I={width:1,height:1},L=null,R=null,z=Te,Le=null,Re=0,ze=0,B=0,V=0,H=null,U=!1,W=!1,G=!0,K=!1,q=!1,J=!0,Be=!0,Y=new h(.5,.5),X=new h(.5,.5),Ve=new h(.5,.5),He=new h,Ue=new h,We=window.matchMedia(`(hover: hover) and (pointer: fine)`).matches,Z=0,Ge=!1,Ke=!1,qe=!0;function Je(){return I.width<=be?`mobile`:`desktop`}function Ye(e){let t=Math.min(I.width/e.referenceWidth,I.height/e.referenceHeight);return{scale:t,offsetX:(I.width-e.referenceWidth*t)*.5,offsetY:(I.height-e.referenceHeight*t)*.5}}function Xe(e,t,n=0){return{x:e-I.width*.5,y:I.height*.5-t,z:n}}function Ze(e){e!==`contact`&&e!==`hero`||(z=e,e===`hero`?(F.material=Ne,l.environment=R,l.environmentRotation.y=w,A.uniforms.uEnvironmentOpacity.value=1):(F.material=P,l.environment=null,A.uniforms.uEnvironmentOpacity.value=0),U&&!q&&Q())}function Qe(e,t,n,r,i,a=null){let o=t.width/r.exportScale,s=o/t.aspectRatio,c=Math.max(i.scale,n.minScale??0),l=o*c,u=s*c,d=n.align===`left`?n.x+o*.5:n.x,ee=n.top+s*.5,f=a===null?i.offsetY+ee*i.scale:i.offsetY+a*i.scale+(ee-a)*c,p=Xe(i.offsetX+d*i.scale,f,10);e.scale.set(l,u,1),e.position.set(p.x,p.y,p.z)}function $e(e,t,n,r,i,a){let o=t.width/r.exportScale,s=o/t.aspectRatio,c=Math.max(i.scale,.9),l=o*c,u=s*c,d=Xe(a.left+n.left*i.scale+l*.5,a.bottom-n.bottom*c-u*.5,10);e.scale.set(l,u,1),e.position.set(d.x,d.y,d.z)}function et(){if(!(a instanceof HTMLAnchorElement))return;let e=M.scale.x,t=M.scale.y,n=M.position.x+I.width*.5,r=I.height*.5-M.position.y;a.style.setProperty(`--contact-email-left`,`${n-e*.5}px`),a.style.setProperty(`--contact-email-top`,`${r-t*.5}px`),a.style.setProperty(`--contact-email-width`,`${e}px`),a.style.setProperty(`--contact-email-height`,`${t}px`)}function tt(e){!L||Le===e||(Object.entries(N).forEach(([t,n])=>{n.material.map=L[e][t].texture,n.material.needsUpdate=!0}),P.map=L[e].sphere.texture,P.needsUpdate=!0,Le=e,Be=!0)}function nt(e){let t=Math.max(e.width,1),n=Math.max(e.height,1),r=Number.parseFloat(window.getComputedStyle(i).borderTopLeftRadius)||0,a=I.height-e.bottom;x.aspect=t/n,x.updateProjectionMatrix(),A.uniforms.uResolution.value.set(I.width,I.height),A.uniforms.uFrameBounds.value.set(e.left,a,t,n),A.uniforms.uFrameRadius.value=r,J=!0}function rt(){if(!L)return;let e=Je(),t=Oe[e],n=Ye(t),r=i.getBoundingClientRect(),a=null;if(e===`desktop`){let e=L.desktop.availability,n=e.width/Oe.desktop.exportScale/e.aspectRatio;a=(t.planes.headline.top+t.planes.availability.top+n)*.5}tt(e),nt(r),Object.entries(N).forEach(([i,o])=>{let s=t.planes[i];if(e===`desktop`&&s.anchor===`bottom-left`){$e(o,L[e][i],s,t,n,r);return}let c=e===`desktop`&&(i===`headline`||i===`availability`)?a:null;Qe(o,L[e][i],s,t,n,c)}),et();let o=Xe(n.offsetX+t.sphere.centerX*n.scale,n.offsetY+t.sphere.centerY*n.scale),s=t.sphere.diameter*n.scale*.5;F.scale.setScalar(s),F.position.x=o.x,Re=o.y,ze=t.floatAmplitude*n.scale,F.position.y=Re,Be=!0}function it(){!J||!R||(o.setRenderTarget(C),o.clear(!0,!0,!1),o.render(_,x),o.setRenderTarget(null),J=!1)}function at(){o.setRenderTarget(D),o.clear(!0,!0,!1),o.render(l,b),o.setRenderTarget(null)}function ot(){Be&&=(o.setRenderTarget(O),o.clear(!0,!0,!1),o.render(m,b),o.setRenderTarget(null),!1)}function st(){o.setRenderTarget(null),o.clear(!0,!0,!1),o.render(v,fe)}function Q(){return K||q?!1:(z===`hero`&&it(),ot(),at(),st(),!0)}function $(){if(K)return;I.width=Math.max(t.clientWidth,1),I.height=Math.max(t.clientHeight,1),A.uniforms.uSphereIdleStrength.value=r?0:T.sphereIdleStrength[Je()];let e=I.width+Ee*2,n=I.height+Ee*2;y.left=I.width*-.5,y.right=I.width*.5,y.top=I.height*.5,y.bottom=I.height*-.5,y.updateProjectionMatrix(),b.left=e*-.5,b.right=e*.5,b.top=n*.5,b.bottom=n*-.5,b.updateProjectionMatrix();let i=Math.min(window.devicePixelRatio||1,xe),a=Math.max(1,Math.round(I.width*i)),s=Math.max(1,Math.round(I.height*i)),c=Math.max(1,Math.round(e*i)),l=Math.max(1,Math.round(n*i));o.setPixelRatio(i),o.setSize(I.width,I.height,!1),C.setSize(a,s),D.setSize(c,l),O.setSize(c,l),A.uniforms.uContentViewportOffset.value.set(Ee/e,Ee/n),A.uniforms.uContentViewportScale.value.set(I.width/e,I.height/n),rt(),U&&!q&&Q()}function ct(e){let t=De(T.positionDamping,e);X.lerp(Y,t),He.subVectors(X,Ve).multiplyScalar(T.velocityGain/e),Ve.copy(X);let n=De(T.velocityDamping,e);Ue.lerp(He,n);let r=Ue.length(),i=Ge?Math.min(r*6,1):0,a=De(Z<i?T.strengthRise:T.strengthDecay,e);Z+=(i-Z)*a,A.uniforms.uTime.value=B,A.uniforms.uMouse.value.copy(X),A.uniforms.uVelocity.value.copy(Ue),A.uniforms.uStrength.value=Z}function lt(){Ge=!1,qe=!0,He.set(0,0),Ue.set(0,0),Z=0,A.uniforms.uVelocity.value.set(0,0),A.uniforms.uStrength.value=0}function ut(e){let n=t.getBoundingClientRect();Y.set((e.clientX-n.left)/n.width,1-(e.clientY-n.top)/n.height),qe&&=(X.copy(Y),Ve.copy(Y),A.uniforms.uMouse.value.copy(Y),!1),Ge=!0}function dt(){Ge=!1,qe=!0}function ft(e){let n=!!(e&&We&&!r&&!K&&!q);n!==Ke&&(Ke=n,lt(),n?(t.addEventListener(`pointerenter`,ut,{passive:!0}),t.addEventListener(`pointermove`,ut,{passive:!0}),t.addEventListener(`pointerleave`,dt)):(t.removeEventListener(`pointerenter`,ut),t.removeEventListener(`pointermove`,ut),t.removeEventListener(`pointerleave`,dt)))}function pt(){W=!1,H!==null&&(window.cancelAnimationFrame(H),H=null)}function mt(e){if(H=null,!W||K||q)return;let t=V?Math.min((e-V)/1e3,1/30):0;V=e,B+=t,F.rotation.y=Pe+B*Se,F.position.y=Re+Math.sin(B*we)*ze,ct(t||1/60),z===`hero`&&(l.environmentRotation.y=w+B*Ce);try{Q()}catch(e){console.error(`Unable to render the Contact WebGL scene.`,e),Ct();return}W&&(H=window.requestAnimationFrame(mt))}function ht(){K||q||!U||W||r||document.hidden||(W=!0,V=0,H=window.requestAnimationFrame(mt))}function gt(){if(!K){if(G=!0,r){Q();return}ht()}}function _t(){G=!1,pt()}function vt(){if(document.hidden){pt();return}G?ht():U&&Q()}function yt(e){e.preventDefault(),q=!0,ft(!1),pt(),t.classList.remove(`is-webgl-ready`)}function bt(){if(!(K||!U)){q=!1;try{J=!0,Be=!0,$(),Q(),t.classList.add(`is-webgl-ready`),ft(!0),G&&ht()}catch(e){console.error(`Unable to restore the Contact WebGL scene.`,e),Ct()}}}let xt=new ResizeObserver($);xt.observe(t),window.addEventListener(`resize`,$,{passive:!0}),document.addEventListener(`visibilitychange`,vt),e.addEventListener(`webglcontextlost`,yt),e.addEventListener(`webglcontextrestored`,bt),ft(!0),$();let St=(async()=>{try{let[e,n]=await Promise.all([Fe.ready,Ie.ready]);return!e||!n||K||(L=e,R=n.environmentMap,S.uniforms.envMap.value=n.backgroundMap,Ze(z),Le=null,rt(),await Promise.all([o.compileAsync(_,x),o.compileAsync(l,b),o.compileAsync(m,b),o.compileAsync(v,fe)]),K||q)||!Q()?!1:(U=!0,t.classList.add(`is-webgl-ready`),G&&ht(),!0)}catch(e){return K||(console.error(`Unable to prepare the Contact WebGL scene.`,e),wt()),!1}})();function Ct(){t.classList.remove(`is-webgl-ready`),t.classList.add(`is-webgl-fallback`),wt()}function wt(){K||(K=!0,G=!1,t.classList.remove(`is-webgl-ready`),pt(),xt.disconnect(),window.removeEventListener(`resize`,$),document.removeEventListener(`visibilitychange`,vt),e.removeEventListener(`webglcontextlost`,yt),e.removeEventListener(`webglcontextrestored`,bt),ft(!1),Fe.dispose(),Ie.dispose(),Object.values(N).forEach(e=>{e.geometry.dispose(),e.material.dispose()}),l.environment=null,S.uniforms.envMap.value=null,Me.dispose(),P.dispose(),Ne.dispose(),me.dispose(),S.dispose(),C.dispose(),D.dispose(),O.dispose(),k.dispose(),A.dispose(),l.clear(),m.clear(),_.clear(),v.clear(),o.dispose(),L=null,R=null)}return{ready:St,start:gt,stop:_t,resize:$,destroy:wt,setVisualMode:Ze}}var O=r();O.applyTranslations(),i(O),t();var k=document.querySelector(`.contact`),A=k?.querySelector(`.contact__canvas`),j=D({canvas:A,root:k,language:O.language,reducedMotion:e}),ke=(j?.ready??Promise.resolve(!1)).catch(e=>(console.error(`Unable to resolve the Contact WebGL scene.`,e),!1)).then(e=>e?!0:(k?.classList.remove(`is-webgl-ready`),k?.classList.add(`is-webgl-fallback`),!1)),{pageTransition:Ae,shouldRevealTransition:je}=n();a({pageTransition:Ae});async function M(){je&&(await Promise.all([document.fonts.ready,ke]),await Ae.reveal())}function N(e){if(!e.persisted){j?.destroy();return}j?.stop()}function Me(e){e.persisted&&(j?.resize(),j?.start())}window.addEventListener(`pagehide`,N),window.addEventListener(`pageshow`,Me),M();