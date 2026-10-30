const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();
function el(id){if(!nodes.has(id)){const classes=new Set();nodes.set(id,{id,hidden:false,inert:false,scrollHeight:2000,scrollTop:0,clientHeight:500,isConnected:true,style:{setProperty(k,v){this[k]=v}},attrs:{},classList:{add(c){classes.add(c)},remove(c){classes.delete(c)},contains(c){return classes.has(c)}},before(){},after(){},append(...v){this.children=v},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},focus(){doc.activeElement=this},click(){this.clicked=true},scrollIntoView(){this.scrolled=true},scrollTo(v){this.scrollTop=v.top},getBoundingClientRect(){return{height:120}},addEventListener(k,v){this[k]=v},querySelectorAll(){return[]}});}return nodes.get(id)}
const doc={querySelector:el,activeElement:el('trigger'),createComment:el,addEventListener(){},documentElement:el('html')};
const media={matches:true,addEventListener(){}};
const context={document:doc,window:{visualViewport:{height:420,offsetTop:0,addEventListener(){}}},matchMedia:q=>q.includes('850')?media:{matches:false},ResizeObserver:class{observe(){}},console};
vm.createContext(context);vm.runInContext(fs.readFileSync('static/mobile.js','utf8'),context);
assert(el('#workspace-navigation').inert);assert(el('#workspace-navigation').children.includes(el('.work-panel')));
context.openMobileNavigation();assert(!el('#workspace-navigation').inert);assert(el('.main').inert);assert.equal(el('#navigation-toggle').attrs['aria-expanded'],'true');
context.closeMobileNavigation();assert(el('#workspace-navigation').inert);assert(!el('.main').inert);
context.updateChatViewport();assert(!el('#jump-latest').hidden);assert.equal(el('html').style['--chat-height'],'420px');
el('#jump-latest').onclick();context.updateChatViewport();assert(el('#jump-latest').hidden);
el('#shared-work-button').onclick();assert(el('[data-tab="work"]').clicked);assert(el('.work-panel').scrolled);
media.matches=false;context.syncMobileLayout();assert(!el('#workspace-navigation').inert);assert(!el('.main').inert);
console.log('Mobile navigation, focus/inert state, shared-work shortcut, keyboard viewport and jump-to-latest passed.');
