'use strict';
// One scroll container keeps the composer visible, including with mobile keyboards.
const mobileLayout = matchMedia('(max-width: 850px)');
const navigation = document.querySelector('#workspace-navigation');
const headerActions = document.querySelector('.header-actions');
const workPanel = document.querySelector('.work-panel');
const actionsHome = document.createComment('header actions');
const panelHome = document.createComment('shared work panel');
headerActions.before(actionsHome); workPanel.before(panelHome);
let navigationFocus;
function closeMobileNavigation() {
  navigation.classList.remove('navigation-open');
  document.querySelector('#navigation-backdrop').hidden = true;
  document.querySelector('#navigation-toggle').setAttribute('aria-expanded','false');
  document.querySelector('.main').inert = false;
  navigation.removeAttribute('role'); navigation.removeAttribute('aria-modal');
  if (mobileLayout.matches) navigation.inert = true;
  if (navigationFocus?.isConnected) navigationFocus.focus();
  navigationFocus = null;
}
function openMobileNavigation(showWork=false) {
  if (!mobileLayout.matches) { workPanel.scrollIntoView({block:'start'}); return; }
  navigationFocus = document.activeElement;
  navigation.inert = false;
  navigation.classList.add('navigation-open');
  navigation.setAttribute('role','dialog'); navigation.setAttribute('aria-modal','true');
  document.querySelector('#navigation-backdrop').hidden = false;
  document.querySelector('#navigation-toggle').setAttribute('aria-expanded','true');
  document.querySelector('.main').inert = true;
  document.querySelector('#close-navigation').focus();
  if (showWork) workPanel.scrollIntoView({block:'start'});
}
function syncMobileLayout() {
  closeMobileNavigation();
  if (mobileLayout.matches) { navigation.append(headerActions,workPanel); }
  else { actionsHome.after(headerActions); panelHome.after(workPanel); navigation.inert=false; }
  updateChatViewport();
}
function updateChatViewport() {
  const messages=document.querySelector('#messages');
  document.querySelector('#jump-latest').hidden = messages.scrollHeight-messages.scrollTop-messages.clientHeight < 100;
  // VisualViewport follows the keyboard on browsers that don't resize 100dvh.
  document.documentElement.style.setProperty('--composer-height',document.querySelector('.composer').getBoundingClientRect().height+'px');
  const viewport=window.visualViewport;
  if (viewport && mobileLayout.matches) {
    document.documentElement.style.setProperty('--chat-height',viewport.height+'px');
    document.documentElement.style.setProperty('--chat-top',viewport.offsetTop+'px');
  }
}
document.querySelector('#navigation-toggle').onclick=()=>openMobileNavigation();
document.querySelector('#close-navigation').onclick=closeMobileNavigation;
document.querySelector('#navigation-backdrop').onclick=closeMobileNavigation;
document.querySelector('#shared-work-button').onclick=()=>{ document.querySelector('[data-tab="work"]').click(); openMobileNavigation(true); };
document.querySelector('#jump-latest').onclick=()=>{
  const messages=document.querySelector('#messages');
  messages.scrollTo({top:messages.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
};
document.querySelector('#messages').addEventListener('scroll',updateChatViewport,{passive:true});
document.querySelector('#messages').addEventListener('load',updateChatViewport,true);
document.addEventListener('keydown',event=>{
  if (!navigation.classList.contains('navigation-open')) return;
  if (event.key==='Escape') { closeMobileNavigation(); return; }
  if (event.key==='Tab') {
    const links=[...navigation.querySelectorAll('button:not([disabled]),a[href],input,select,textarea')].filter(el=>el.getClientRects().length && !el.closest('[hidden]'));
    const first=links[0],last=links.at(-1);
    if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
    else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
  }
});
mobileLayout.addEventListener('change',syncMobileLayout);
window.visualViewport?.addEventListener('resize',updateChatViewport);
window.visualViewport?.addEventListener('scroll',updateChatViewport);
new ResizeObserver(updateChatViewport).observe(document.querySelector('.composer'));
syncMobileLayout();
