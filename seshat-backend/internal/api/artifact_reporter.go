package api

import "regexp"

// artifactPageReporter runs first in a previewed page and tells the app's panel what goes wrong in it: script errors, rejected promises,
// console.error, files that fail to load and what the preview's CSP blocks. It only ever posts to the parent frame, which checks that the
// message comes from the page it shows and keeps it as text; the page gains no way to reach the app or the agent by itself, and a person
// decides whether these problems are sent to the agent. At most 50 messages, each cut to 2 000 characters.
const artifactPageReporter = `<script>(function(){var n=0;function send(kind,message,where){if(n>=50)return;n++;` +
	`try{parent.postMessage({type:'seshat:page-problem',kind:kind,message:String(message).slice(0,2000),where:where?String(where).slice(0,500):''},'*')}catch(_){}}` +
	`window.addEventListener('error',function(e){var t=e.target;if(t&&t!==window&&t.tagName){send('load','Could not load '+(t.src||t.href||('a '+t.tagName.toLowerCase())),'');return}` +
	`send('error',e.message||'Error',(e.filename||'')+(e.lineno?':'+e.lineno+':'+e.colno:''))},true);` +
	`window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('error','Unhandled promise rejection: '+((r&&r.message)||r),'')});` +
	`document.addEventListener('securitypolicyviolation',function(e){send('blocked','Blocked by the preview: '+(e.blockedURI||'inline code')+' ('+e.effectiveDirective+')','')});` +
	`var ce=console.error;console.error=function(){try{send('console',Array.prototype.map.call(arguments,function(a){try{return a instanceof Error?a.message:typeof a==='object'?JSON.stringify(a):String(a)}catch(_){return String(a)}}).join(' '),'')}catch(_){}return ce.apply(console,arguments)}` +
	`})();</script>`

// artifactPageStyle gives the page's scrollbars the look of the app's: thin, on nothing, in a grey that reads on any background. Chromium draws
// wide, white ones otherwise. It comes first, so that a page styling its own scrollbars still wins.
const artifactPageStyle = `<style>::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}` +
	`::-webkit-scrollbar-thumb{background:rgba(128,128,128,.35);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.6)}</style>`

var (
	htmlHeadOpen    = regexp.MustCompile(`(?i)<head(?:\s[^>]*)?>`)
	htmlOpen        = regexp.MustCompile(`(?i)<html(?:\s[^>]*)?>`)
	htmlDoctypeOpen = regexp.MustCompile(`(?i)^\s*<!doctype[^>]*>`)
)

// withPageReporter puts artifactPageStyle and artifactPageReporter before anything of the page can run: right after <head>, else after <html>,
// else after the doctype, else at the very start. Nothing it adds holds a line break, so an error's line number is the file's.
func withPageReporter(html string) string {
	for _, re := range []*regexp.Regexp{htmlHeadOpen, htmlOpen, htmlDoctypeOpen} {
		if loc := re.FindStringIndex(html); loc != nil {
			return html[:loc[1]] + artifactPageStyle + artifactPageReporter + html[loc[1]:]
		}
	}
	return artifactPageStyle + artifactPageReporter + html
}
