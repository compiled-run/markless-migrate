function ca(e,r,t){const n=e.indexOf(r)+r.length,o=e.indexOf(t);return e.substring(n,o).trim()}const Cr=0,y=1,A=2,j=3,P=4,pe=5,br=6,q=7,V=8,C=9,x=10,M=11,S=12,I=13,We=14,K=15,U=16,Q=17,de=18,Z=19,se=20,N=21,z=22,G=23,te=24,H=25,ua=0;function F(e){return e>=48&&e<=57}function ve(e){return F(e)||e>=65&&e<=70||e>=97&&e<=102}function lt(e){return e>=65&&e<=90}function pa(e){return e>=97&&e<=122}function da(e){return lt(e)||pa(e)}function ha(e){return e>=128}function cr(e){return da(e)||ha(e)||e===95}function Ln(e){return cr(e)||F(e)||e===45}function ma(e){return e>=0&&e<=8||e===11||e>=14&&e<=31||e===127}function ur(e){return e===10||e===13||e===12}function we(e){return ur(e)||e===32||e===9}function ue(e,r){return!(e!==92||ur(r)||r===ua)}function or(e,r,t){return e===45?cr(r)||r===45||ue(r,t):cr(e)?!0:e===92?ue(e,r):!1}function Ar(e,r,t){return e===43||e===45?F(r)?2:r===46&&F(t)?3:0:e===46?F(r)?2:0:F(e)?1:0}function Pn(e){return e===65279||e===65534?1:0}const Kr=new Array(128),fa=128,ar=130,Mn=131,ct=132,In=133;for(let e=0;e<Kr.length;e++)Kr[e]=we(e)&&ar||F(e)&&Mn||cr(e)&&ct||ma(e)&&In||e||fa;function Tr(e){return e<128?Kr[e]:ct}function _e(e,r){return r<e.length?e.charCodeAt(r):0}function Qr(e,r,t){return t===13&&_e(e,r+1)===10?2:1}function Ee(e,r,t){let n=e.charCodeAt(r);return lt(n)&&(n=n|32),n===t}function Ue(e,r,t,n){if(t-r!==n.length||r<0||t>e.length)return!1;for(let o=r;o<t;o++){const a=n.charCodeAt(o-r);let s=e.charCodeAt(o);if(lt(s)&&(s=s|32),s!==a)return!1}return!0}function ga(e,r){for(;r>=0&&we(e.charCodeAt(r));r--);return r+1}function Qe(e,r){for(;r<e.length&&we(e.charCodeAt(r));r++);return r}function Or(e,r){for(;r<e.length&&F(e.charCodeAt(r));r++);return r}function $e(e,r){if(r+=2,ve(_e(e,r-1))){for(const n=Math.min(e.length,r+5);r<n&&ve(_e(e,r));r++);const t=_e(e,r);we(t)&&(r+=Qr(e,r,t))}return r}function Ye(e,r){for(;r<e.length;r++){const t=e.charCodeAt(r);if(!Ln(t)){if(ue(t,_e(e,r+1))){r=$e(e,r)-1;continue}break}}return r}function vr(e,r){let t=e.charCodeAt(r);if((t===43||t===45)&&(t=e.charCodeAt(r+=1)),F(t)&&(r=Or(e,r+1),t=e.charCodeAt(r)),t===46&&F(e.charCodeAt(r+1))&&(r+=2,r=Or(e,r)),Ee(e,r,101)){let n=0;t=e.charCodeAt(r+1),(t===45||t===43)&&(n=1,t=e.charCodeAt(r+2)),F(t)&&(r=Or(e,r+1+n+1))}return r}function _r(e,r){for(;r<e.length;r++){const t=e.charCodeAt(r);if(t===41){r++;break}ue(t,_e(e,r+1))&&(r=$e(e,r))}return r}function jn(e){if(e.length===1&&!ve(e.charCodeAt(0)))return e[0];let r=parseInt(e,16);return(r===0||r>=55296&&r<=57343||r>1114111)&&(r=65533),String.fromCodePoint(r)}const Dn=["EOF-token","ident-token","function-token","at-keyword-token","hash-token","string-token","bad-string-token","url-token","bad-url-token","delim-token","number-token","percentage-token","dimension-token","whitespace-token","CDO-token","CDC-token","colon-token","semicolon-token","comma-token","[-token","]-token","(-token",")-token","{-token","}-token"],ya=16*1024;function pr(e=null,r){return e===null||e.length<r?new Uint32Array(Math.max(r+1024,ya)):e}const Ct=10,ba=12,At=13;function Tt(e){const r=e.source,t=r.length,n=r.length>0?Pn(r.charCodeAt(0)):0,o=pr(e.lines,t),a=pr(e.columns,t);let s=e.startLine,c=e.startColumn;for(let u=n;u<t;u++){const i=r.charCodeAt(u);o[u]=s,a[u]=c++,(i===Ct||i===At||i===ba)&&(i===At&&u+1<t&&r.charCodeAt(u+1)===Ct&&(u++,o[u]=s,a[u]=c),s++,c=1)}o[t]=s,a[t]=c,e.lines=o,e.columns=a,e.computed=!0}class va{constructor(){this.lines=null,this.columns=null,this.computed=!1}setSource(r,t=0,n=1,o=1){this.source=r,this.startOffset=t,this.startLine=n,this.startColumn=o,this.computed=!1}getLocation(r,t){return this.computed||Tt(this),{source:t,offset:this.startOffset+r,line:this.lines[r],column:this.columns[r]}}getLocationRange(r,t,n){return this.computed||Tt(this),{source:n,start:{offset:this.startOffset+r,line:this.lines[r],column:this.columns[r]},end:{offset:this.startOffset+t,line:this.lines[t],column:this.columns[t]}}}}const ee=16777215,fe=24,xa=new Map([[A,z],[N,z],[Z,se],[G,te]]);class ka{constructor(r,t){this.setSource(r,t)}reset(){this.eof=!1,this.tokenIndex=-1,this.tokenType=0,this.tokenStart=this.firstCharOffset,this.tokenEnd=this.firstCharOffset}setSource(r="",t=()=>{}){r=String(r||"");const n=r.length,o=pr(this.offsetAndType,r.length+1),a=pr(this.balance,r.length+1);let s=0,c=0,u=0,i=-1;for(this.offsetAndType=null,this.balance=null,t(r,(l,p,f)=>{switch(l){default:a[s]=n;break;case c:{let m=u&ee;for(u=a[m],c=u>>fe,a[s]=m,a[m++]=s;m<s;m++)a[m]===n&&(a[m]=s);break}case N:case A:case Z:case G:a[s]=u,c=xa.get(l),u=c<<fe|s;break}o[s++]=l<<fe|f,i===-1&&(i=p)}),o[s]=Cr<<fe|n,a[s]=n,a[n]=n;u!==0;){const l=u&ee;u=a[l],a[l]=n}this.source=r,this.firstCharOffset=i===-1?0:i,this.tokenCount=s,this.offsetAndType=o,this.balance=a,this.reset(),this.next()}lookupType(r){return r+=this.tokenIndex,r<this.tokenCount?this.offsetAndType[r]>>fe:Cr}lookupOffset(r){return r+=this.tokenIndex,r<this.tokenCount?this.offsetAndType[r-1]&ee:this.source.length}lookupValue(r,t){return r+=this.tokenIndex,r<this.tokenCount?Ue(this.source,this.offsetAndType[r-1]&ee,this.offsetAndType[r]&ee,t):!1}getTokenStart(r){return r===this.tokenIndex?this.tokenStart:r>0?r<this.tokenCount?this.offsetAndType[r-1]&ee:this.offsetAndType[this.tokenCount]&ee:this.firstCharOffset}substrToCursor(r){return this.source.substring(r,this.tokenStart)}isBalanceEdge(r){return this.balance[this.tokenIndex]<r}isDelim(r,t){return t?this.lookupType(t)===C&&this.source.charCodeAt(this.lookupOffset(t))===r:this.tokenType===C&&this.source.charCodeAt(this.tokenStart)===r}skip(r){let t=this.tokenIndex+r;t<this.tokenCount?(this.tokenIndex=t,this.tokenStart=this.offsetAndType[t-1]&ee,t=this.offsetAndType[t],this.tokenType=t>>fe,this.tokenEnd=t&ee):(this.tokenIndex=this.tokenCount,this.next())}next(){let r=this.tokenIndex+1;r<this.tokenCount?(this.tokenIndex=r,this.tokenStart=this.tokenEnd,r=this.offsetAndType[r],this.tokenType=r>>fe,this.tokenEnd=r&ee):(this.eof=!0,this.tokenIndex=this.tokenCount,this.tokenType=Cr,this.tokenStart=this.tokenEnd=this.source.length)}skipSC(){for(;this.tokenType===I||this.tokenType===H;)this.next()}skipUntilBalanced(r,t){let n=r,o,a;e:for(;n<this.tokenCount;n++){if(o=this.balance[n],o<r)break e;switch(a=n>0?this.offsetAndType[n-1]&ee:this.firstCharOffset,t(this.source.charCodeAt(a))){case 1:break e;case 2:n++;break e;default:this.balance[o]===n&&(n=o)}}this.skip(n-this.tokenIndex)}forEachToken(r){for(let t=0,n=this.firstCharOffset;t<this.tokenCount;t++){const o=n,a=this.offsetAndType[t],s=a&ee,c=a>>fe;n=s,r(c,o,s,t)}}dump(){const r=new Array(this.tokenCount);return this.forEachToken((t,n,o,a)=>{r[a]={idx:a,type:Dn[t],chunk:this.source.substring(n,o),balance:this.balance[a]}}),r}}function xr(e,r){function t(p){return p<c?e.charCodeAt(p):0}function n(){if(i=vr(e,i),or(t(i),t(i+1),t(i+2))){l=S,i=Ye(e,i);return}if(t(i)===37){l=M,i++;return}l=x}function o(){const p=i;if(i=Ye(e,i),Ue(e,p,i,"url")&&t(i)===40){if(i=Qe(e,i+1),t(i)===34||t(i)===39){l=A,i=p+4;return}s();return}if(t(i)===40){l=A,i++;return}l=y}function a(p){for(p||(p=t(i++)),l=pe;i<e.length;i++){const f=e.charCodeAt(i);switch(Tr(f)){case p:i++;return;case ar:if(ur(f)){i+=Qr(e,i,f),l=br;return}break;case 92:if(i===e.length-1)break;const m=t(i+1);ur(m)?i+=Qr(e,i+1,m):ue(f,m)&&(i=$e(e,i)-1);break}}}function s(){for(l=q,i=Qe(e,i);i<e.length;i++){const p=e.charCodeAt(i);switch(Tr(p)){case 41:i++;return;case ar:if(i=Qe(e,i),t(i)===41||i>=e.length){i<e.length&&i++;return}i=_r(e,i),l=V;return;case 34:case 39:case 40:case In:i=_r(e,i),l=V;return;case 92:if(ue(p,t(i+1))){i=$e(e,i)-1;break}i=_r(e,i),l=V;return}}}e=String(e||"");const c=e.length;let u=Pn(t(0)),i=u,l;for(;i<c;){const p=e.charCodeAt(i);switch(Tr(p)){case ar:l=I,i=Qe(e,i+1);break;case 34:a();break;case 35:Ln(t(i+1))||ue(t(i+1),t(i+2))?(l=P,i=Ye(e,i+1)):(l=C,i++);break;case 39:a();break;case 40:l=N,i++;break;case 41:l=z,i++;break;case 43:Ar(p,t(i+1),t(i+2))?n():(l=C,i++);break;case 44:l=de,i++;break;case 45:Ar(p,t(i+1),t(i+2))?n():t(i+1)===45&&t(i+2)===62?(l=K,i=i+3):or(p,t(i+1),t(i+2))?o():(l=C,i++);break;case 46:Ar(p,t(i+1),t(i+2))?n():(l=C,i++);break;case 47:t(i+1)===42?(l=H,i=e.indexOf("*/",i+2),i=i===-1?e.length:i+2):(l=C,i++);break;case 58:l=U,i++;break;case 59:l=Q,i++;break;case 60:t(i+1)===33&&t(i+2)===45&&t(i+3)===45?(l=We,i=i+4):(l=C,i++);break;case 64:or(t(i+1),t(i+2),t(i+3))?(l=j,i=Ye(e,i+1)):(l=C,i++);break;case 91:l=Z,i++;break;case 92:ue(p,t(i+1))?o():(l=C,i++);break;case 93:l=se,i++;break;case 123:l=G,i++;break;case 125:l=te,i++;break;case Mn:n();break;case ct:o();break;default:l=C,i++}r(l,u,u=i)}}let Se=null;class R{static createItem(r){return{prev:null,next:null,data:r}}constructor(){this.head=null,this.tail=null,this.cursor=null}createItem(r){return R.createItem(r)}allocateCursor(r,t){let n;return Se!==null?(n=Se,Se=Se.cursor,n.prev=r,n.next=t,n.cursor=this.cursor):n={prev:r,next:t,cursor:this.cursor},this.cursor=n,n}releaseCursor(){const{cursor:r}=this;this.cursor=r.cursor,r.prev=null,r.next=null,r.cursor=Se,Se=r}updateCursors(r,t,n,o){let{cursor:a}=this;for(;a!==null;)a.prev===r&&(a.prev=t),a.next===n&&(a.next=o),a=a.cursor}*[Symbol.iterator](){for(let r=this.head;r!==null;r=r.next)yield r.data}get size(){let r=0;for(let t=this.head;t!==null;t=t.next)r++;return r}get isEmpty(){return this.head===null}get first(){return this.head&&this.head.data}get last(){return this.tail&&this.tail.data}fromArray(r){let t=null;this.head=null;for(let n of r){const o=R.createItem(n);t!==null?t.next=o:this.head=o,o.prev=t,t=o}return this.tail=t,this}toArray(){return[...this]}toJSON(){return[...this]}forEach(r,t=this){const n=this.allocateCursor(null,this.head);for(;n.next!==null;){const o=n.next;n.next=o.next,r.call(t,o.data,o,this)}this.releaseCursor()}forEachRight(r,t=this){const n=this.allocateCursor(this.tail,null);for(;n.prev!==null;){const o=n.prev;n.prev=o.prev,r.call(t,o.data,o,this)}this.releaseCursor()}reduce(r,t,n=this){let o=this.allocateCursor(null,this.head),a=t,s;for(;o.next!==null;)s=o.next,o.next=s.next,a=r.call(n,a,s.data,s,this);return this.releaseCursor(),a}reduceRight(r,t,n=this){let o=this.allocateCursor(this.tail,null),a=t,s;for(;o.prev!==null;)s=o.prev,o.prev=s.prev,a=r.call(n,a,s.data,s,this);return this.releaseCursor(),a}some(r,t=this){for(let n=this.head;n!==null;n=n.next)if(r.call(t,n.data,n,this))return!0;return!1}map(r,t=this){const n=new R;for(let o=this.head;o!==null;o=o.next)n.appendData(r.call(t,o.data,o,this));return n}filter(r,t=this){const n=new R;for(let o=this.head;o!==null;o=o.next)r.call(t,o.data,o,this)&&n.appendData(o.data);return n}nextUntil(r,t,n=this){if(r===null)return;const o=this.allocateCursor(null,r);for(;o.next!==null;){const a=o.next;if(o.next=a.next,t.call(n,a.data,a,this))break}this.releaseCursor()}prevUntil(r,t,n=this){if(r===null)return;const o=this.allocateCursor(r,null);for(;o.prev!==null;){const a=o.prev;if(o.prev=a.prev,t.call(n,a.data,a,this))break}this.releaseCursor()}clear(){this.head=null,this.tail=null}copy(){const r=new R;for(let t of this)r.appendData(t);return r}prepend(r){return this.updateCursors(null,r,this.head,r),this.head!==null?(this.head.prev=r,r.next=this.head):this.tail=r,this.head=r,this}prependData(r){return this.prepend(R.createItem(r))}append(r){return this.insert(r)}appendData(r){return this.insert(R.createItem(r))}insert(r,t=null){if(t!==null)if(this.updateCursors(t.prev,r,t,r),t.prev===null){if(this.head!==t)throw new Error("before doesn't belong to list");this.head=r,t.prev=r,r.next=t,this.updateCursors(null,r)}else t.prev.next=r,r.prev=t.prev,t.prev=r,r.next=t;else this.updateCursors(this.tail,r,null,r),this.tail!==null?(this.tail.next=r,r.prev=this.tail):this.head=r,this.tail=r;return this}insertData(r,t){return this.insert(R.createItem(r),t)}remove(r){if(this.updateCursors(r,r.prev,r,r.next),r.prev!==null)r.prev.next=r.next;else{if(this.head!==r)throw new Error("item doesn't belong to list");this.head=r.next}if(r.next!==null)r.next.prev=r.prev;else{if(this.tail!==r)throw new Error("item doesn't belong to list");this.tail=r.prev}return r.prev=null,r.next=null,r}push(r){this.insert(R.createItem(r))}pop(){return this.tail!==null?this.remove(this.tail):null}unshift(r){this.prepend(R.createItem(r))}shift(){return this.head!==null?this.remove(this.head):null}prependList(r){return this.insertList(r,this.head)}appendList(r){return this.insertList(r)}insertList(r,t){return r.head===null?this:(t!=null?(this.updateCursors(t.prev,r.tail,t,r.head),t.prev!==null?(t.prev.next=r.head,r.head.prev=t.prev):this.head=r.head,t.prev=r.tail,r.tail.next=t):(this.updateCursors(this.tail,r.tail,null,r.head),this.tail!==null?(this.tail.next=r.head,r.head.prev=this.tail):this.head=r.head,this.tail=r.tail),r.head=null,r.tail=null,this)}replace(r,t){"head"in t?this.insertList(t,r):this.insert(t,r),this.remove(r)}}function kr(e,r){const t=Object.create(SyntaxError.prototype),n=new Error;return Object.assign(t,{name:e,message:r,get stack(){return(n.stack||"").replace(/^(.+\n){1,3}/,`${e}: ${r}
`)}})}const Er=100,Ot=60,_t="    ";function Et({source:e,line:r,column:t},n){function o(l,p){return a.slice(l,p).map((f,m)=>String(l+m+1).padStart(u)+" |"+f).join(`
`)}const a=e.split(/\r\n?|\n|\f/),s=Math.max(1,r-n)-1,c=Math.min(r+n,a.length+1),u=Math.max(4,String(c).length)+1;let i=0;t+=(_t.length-1)*(a[r-1].substr(0,t-1).match(/\t/g)||[]).length,t>Er&&(i=t-Ot+3,t=Ot-2);for(let l=s;l<=c;l++)l>=0&&l<a.length&&(a[l]=a[l].replace(/\t/g,_t),a[l]=(i>0&&a[l].length>i?"…":"")+a[l].substr(i,Er-2)+(a[l].length>i+Er-1?"…":""));return[o(s,r),new Array(t+u+2).join("-")+"^",o(r,c)].filter(Boolean).join(`
`)}function zt(e,r,t,n,o){return Object.assign(kr("SyntaxError",e),{source:r,offset:t,line:n,column:o,sourceFragment(s){return Et({source:r,line:n,column:o},isNaN(s)?0:s)},get formattedMessage(){return`Parse error: ${e}
`+Et({source:r,line:n,column:o},2)}})}function wa(e){const r=this.createList();let t=!1;const n={recognizer:e};for(;!this.eof;){switch(this.tokenType){case H:this.next();continue;case I:t=!0,this.next();continue}let o=e.getNode.call(this,n);if(o===void 0)break;t&&(e.onWhiteSpace&&e.onWhiteSpace.call(this,o,r,n),t=!1),r.push(o)}return t&&e.onWhiteSpace&&e.onWhiteSpace.call(this,null,r,n),r}const $t=()=>{},Sa=33,Ca=35,zr=59,Lt=123,Pt=0;function Aa(e){return function(){return this[e]()}}function $r(e){const r=Object.create(null);for(const t in e){const n=e[t],o=n.parse||n;o&&(r[t]=o)}return r}function Ta(e){const r={context:Object.create(null),scope:Object.assign(Object.create(null),e.scope),atrule:$r(e.atrule),pseudo:$r(e.pseudo),node:$r(e.node)};for(const t in e.parseContext)switch(typeof e.parseContext[t]){case"function":r.context[t]=e.parseContext[t];break;case"string":r.context[t]=Aa(e.parseContext[t]);break}return{config:r,...r,...r.node}}function Oa(e){let r="",t="<unknown>",n=!1,o=$t,a=!1;const s=new va,c=Object.assign(new ka,Ta(e||{}),{parseAtrulePrelude:!0,parseRulePrelude:!0,parseValue:!0,parseCustomProperty:!1,readSequence:wa,consumeUntilBalanceEnd:()=>0,consumeUntilLeftCurlyBracket(i){return i===Lt?1:0},consumeUntilLeftCurlyBracketOrSemicolon(i){return i===Lt||i===zr?1:0},consumeUntilExclamationMarkOrSemicolon(i){return i===Sa||i===zr?1:0},consumeUntilSemicolonIncluded(i){return i===zr?2:0},createList(){return new R},createSingleNodeList(i){return new R().appendData(i)},getFirstListNode(i){return i&&i.first},getLastListNode(i){return i&&i.last},parseWithFallback(i,l){const p=this.tokenIndex;try{return i.call(this)}catch(f){if(a)throw f;const m=l.call(this,p);return a=!0,o(f,m),a=!1,m}},lookupNonWSType(i){let l;do if(l=this.lookupType(i++),l!==I)return l;while(l!==Pt);return Pt},charCodeAt(i){return i>=0&&i<r.length?r.charCodeAt(i):0},substring(i,l){return r.substring(i,l)},substrToCursor(i){return this.source.substring(i,this.tokenStart)},cmpChar(i,l){return Ee(r,i,l)},cmpStr(i,l,p){return Ue(r,i,l,p)},consume(i){const l=this.tokenStart;return this.eat(i),this.substrToCursor(l)},consumeFunctionName(){const i=r.substring(this.tokenStart,this.tokenEnd-1);return this.eat(A),i},consumeNumber(i){const l=r.substring(this.tokenStart,vr(r,this.tokenStart));return this.eat(i),l},eat(i){if(this.tokenType!==i){const l=Dn[i].slice(0,-6).replace(/-/g," ").replace(/^./,m=>m.toUpperCase());let p=`${/[[\](){}]/.test(l)?`"${l}"`:l} is expected`,f=this.tokenStart;switch(i){case y:this.tokenType===A||this.tokenType===q?(f=this.tokenEnd-1,p="Identifier is expected but function found"):p="Identifier is expected";break;case P:this.isDelim(Ca)&&(this.next(),f++,p="Name is expected");break;case M:this.tokenType===x&&(f=this.tokenEnd,p="Percent sign is expected");break}this.error(p,f)}this.next()},eatIdent(i){(this.tokenType!==y||this.lookupValue(0,i)===!1)&&this.error(`Identifier "${i}" is expected`),this.next()},eatDelim(i){this.isDelim(i)||this.error(`Delim "${String.fromCharCode(i)}" is expected`),this.next()},getLocation(i,l){return n?s.getLocationRange(i,l,t):null},getLocationFromList(i){if(n){const l=this.getFirstListNode(i),p=this.getLastListNode(i);return s.getLocationRange(l!==null?l.loc.start.offset-s.startOffset:this.tokenStart,p!==null?p.loc.end.offset-s.startOffset:this.tokenStart,t)}return null},error(i,l){const p=typeof l<"u"&&l<r.length?s.getLocation(l):this.eof?s.getLocation(ga(r,r.length-1)):s.getLocation(this.tokenStart);throw new zt(i||"Unexpected input",r,p.offset,p.line,p.column)}});return Object.assign(function(i,l){r=i,l=l||{},c.setSource(r,xr),s.setSource(r,l.offset,l.line,l.column),t=l.filename||"<unknown>",n=!!l.positions,o=typeof l.onParseError=="function"?l.onParseError:$t,a=!1,c.parseAtrulePrelude="parseAtrulePrelude"in l?!!l.parseAtrulePrelude:!0,c.parseRulePrelude="parseRulePrelude"in l?!!l.parseRulePrelude:!0,c.parseValue="parseValue"in l?!!l.parseValue:!0,c.parseCustomProperty="parseCustomProperty"in l?!!l.parseCustomProperty:!1;const{context:p="default",onComment:f}=l;if(!(p in c.context))throw new Error("Unknown context `"+p+"`");typeof f=="function"&&c.forEachToken((v,_,$)=>{if(v===H){const k=c.getLocation(_,$),T=Ue(r,$-2,$,"*/")?r.slice(_+2,$-2):r.slice(_+2,$);f(T,k)}});const m=c.context[p].call(c,l);return c.eof||c.error(),m},{SyntaxError:zt,config:c.config})}var Lr={},Xe={},Ze={},Mt;function _a(){if(Mt)return Ze;Mt=1;var e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");return Ze.encode=function(r){if(0<=r&&r<e.length)return e[r];throw new TypeError("Must be between 0 and 63: "+r)},Ze.decode=function(r){var t=65,n=90,o=97,a=122,s=48,c=57,u=43,i=47,l=26,p=52;return t<=r&&r<=n?r-t:o<=r&&r<=a?r-o+l:s<=r&&r<=c?r-s+p:r==u?62:r==i?63:-1},Ze}var It;function Ea(){if(It)return Xe;It=1;var e=_a(),r=5,t=1<<r,n=t-1,o=t;function a(c){return c<0?(-c<<1)+1:(c<<1)+0}function s(c){var u=(c&1)===1,i=c>>1;return u?-i:i}return Xe.encode=function(u){var i="",l,p=a(u);do l=p&n,p>>>=r,p>0&&(l|=o),i+=e.encode(l);while(p>0);return i},Xe.decode=function(u,i,l){var p=u.length,f=0,m=0,v,_;do{if(i>=p)throw new Error("Expected more digits in base 64 VLQ value.");if(_=e.decode(u.charCodeAt(i++)),_===-1)throw new Error("Invalid base64 digit: "+u.charAt(i-1));v=!!(_&o),_&=n,f=f+(_<<m),m+=r}while(v);l.value=s(f),l.rest=i},Xe}var Pr={},jt;function ut(){return jt||(jt=1,(function(e){function r(d,h,b){if(h in d)return d[h];if(arguments.length===3)return b;throw new Error('"'+h+'" is a required argument.')}e.getArg=r;var t=/^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.-]*)(?::(\d+))?(.*)$/,n=/^data:.+\,.+$/;function o(d){var h=d.match(t);return h?{scheme:h[1],auth:h[2],host:h[3],port:h[4],path:h[5]}:null}e.urlParse=o;function a(d){var h="";return d.scheme&&(h+=d.scheme+":"),h+="//",d.auth&&(h+=d.auth+"@"),d.host&&(h+=d.host),d.port&&(h+=":"+d.port),d.path&&(h+=d.path),h}e.urlGenerate=a;var s=32;function c(d){var h=[];return function(b){for(var g=0;g<h.length;g++)if(h[g].input===b){var he=h[0];return h[0]=h[g],h[g]=he,h[0].result}var oe=d(b);return h.unshift({input:b,result:oe}),h.length>s&&h.pop(),oe}}var u=c(function(h){var b=h,g=o(h);if(g){if(!g.path)return h;b=g.path}for(var he=e.isAbsolute(b),oe=[],Ve=0,W=0;;)if(Ve=W,W=b.indexOf("/",Ve),W===-1){oe.push(b.slice(Ve));break}else for(oe.push(b.slice(Ve,W));W<b.length&&b[W]==="/";)W++;for(var Ke,Me=0,W=oe.length-1;W>=0;W--)Ke=oe[W],Ke==="."?oe.splice(W,1):Ke===".."?Me++:Me>0&&(Ke===""?(oe.splice(W+1,Me),Me=0):(oe.splice(W,2),Me--));return b=oe.join("/"),b===""&&(b=he?"/":"."),g?(g.path=b,a(g)):b});e.normalize=u;function i(d,h){d===""&&(d="."),h===""&&(h=".");var b=o(h),g=o(d);if(g&&(d=g.path||"/"),b&&!b.scheme)return g&&(b.scheme=g.scheme),a(b);if(b||h.match(n))return h;if(g&&!g.host&&!g.path)return g.host=h,a(g);var he=h.charAt(0)==="/"?h:u(d.replace(/\/+$/,"")+"/"+h);return g?(g.path=he,a(g)):he}e.join=i,e.isAbsolute=function(d){return d.charAt(0)==="/"||t.test(d)};function l(d,h){d===""&&(d="."),d=d.replace(/\/$/,"");for(var b=0;h.indexOf(d+"/")!==0;){var g=d.lastIndexOf("/");if(g<0||(d=d.slice(0,g),d.match(/^([^\/]+:\/)?\/*$/)))return h;++b}return Array(b+1).join("../")+h.substr(d.length+1)}e.relative=l;var p=(function(){var d=Object.create(null);return!("__proto__"in d)})();function f(d){return d}function m(d){return _(d)?"$"+d:d}e.toSetString=p?f:m;function v(d){return _(d)?d.slice(1):d}e.fromSetString=p?f:v;function _(d){if(!d)return!1;var h=d.length;if(h<9||d.charCodeAt(h-1)!==95||d.charCodeAt(h-2)!==95||d.charCodeAt(h-3)!==111||d.charCodeAt(h-4)!==116||d.charCodeAt(h-5)!==111||d.charCodeAt(h-6)!==114||d.charCodeAt(h-7)!==112||d.charCodeAt(h-8)!==95||d.charCodeAt(h-9)!==95)return!1;for(var b=h-10;b>=0;b--)if(d.charCodeAt(b)!==36)return!1;return!0}function $(d,h,b){var g=w(d.source,h.source);return g!==0||(g=d.originalLine-h.originalLine,g!==0)||(g=d.originalColumn-h.originalColumn,g!==0||b)||(g=d.generatedColumn-h.generatedColumn,g!==0)||(g=d.generatedLine-h.generatedLine,g!==0)?g:w(d.name,h.name)}e.compareByOriginalPositions=$;function k(d,h,b){var g;return g=d.originalLine-h.originalLine,g!==0||(g=d.originalColumn-h.originalColumn,g!==0||b)||(g=d.generatedColumn-h.generatedColumn,g!==0)||(g=d.generatedLine-h.generatedLine,g!==0)?g:w(d.name,h.name)}e.compareByOriginalPositionsNoSource=k;function T(d,h,b){var g=d.generatedLine-h.generatedLine;return g!==0||(g=d.generatedColumn-h.generatedColumn,g!==0||b)||(g=w(d.source,h.source),g!==0)||(g=d.originalLine-h.originalLine,g!==0)||(g=d.originalColumn-h.originalColumn,g!==0)?g:w(d.name,h.name)}e.compareByGeneratedPositionsDeflated=T;function J(d,h,b){var g=d.generatedColumn-h.generatedColumn;return g!==0||b||(g=w(d.source,h.source),g!==0)||(g=d.originalLine-h.originalLine,g!==0)||(g=d.originalColumn-h.originalColumn,g!==0)?g:w(d.name,h.name)}e.compareByGeneratedPositionsDeflatedNoLine=J;function w(d,h){return d===h?0:d===null?1:h===null?-1:d>h?1:-1}function Y(d,h){var b=d.generatedLine-h.generatedLine;return b!==0||(b=d.generatedColumn-h.generatedColumn,b!==0)||(b=w(d.source,h.source),b!==0)||(b=d.originalLine-h.originalLine,b!==0)||(b=d.originalColumn-h.originalColumn,b!==0)?b:w(d.name,h.name)}e.compareByGeneratedPositionsInflated=Y;function ne(d){return JSON.parse(d.replace(/^\)]}'[^\n]*\n/,""))}e.parseSourceMapInput=ne;function D(d,h,b){if(h=h||"",d&&(d[d.length-1]!=="/"&&h[0]!=="/"&&(d+="/"),h=d+h),b){var g=o(b);if(!g)throw new Error("sourceMapURL could not be parsed");if(g.path){var he=g.path.lastIndexOf("/");he>=0&&(g.path=g.path.substring(0,he+1))}h=i(a(g),h)}return u(h)}e.computeSourceURL=D})(Pr)),Pr}var Mr={},Dt;function za(){if(Dt)return Mr;Dt=1;var e=ut(),r=Object.prototype.hasOwnProperty,t=typeof Map<"u";function n(){this._array=[],this._set=t?new Map:Object.create(null)}return n.fromArray=function(a,s){for(var c=new n,u=0,i=a.length;u<i;u++)c.add(a[u],s);return c},n.prototype.size=function(){return t?this._set.size:Object.getOwnPropertyNames(this._set).length},n.prototype.add=function(a,s){var c=t?a:e.toSetString(a),u=t?this.has(a):r.call(this._set,c),i=this._array.length;(!u||s)&&this._array.push(a),u||(t?this._set.set(a,i):this._set[c]=i)},n.prototype.has=function(a){if(t)return this._set.has(a);var s=e.toSetString(a);return r.call(this._set,s)},n.prototype.indexOf=function(a){if(t){var s=this._set.get(a);if(s>=0)return s}else{var c=e.toSetString(a);if(r.call(this._set,c))return this._set[c]}throw new Error('"'+a+'" is not in the set.')},n.prototype.at=function(a){if(a>=0&&a<this._array.length)return this._array[a];throw new Error("No element indexed by "+a)},n.prototype.toArray=function(){return this._array.slice()},Mr.ArraySet=n,Mr}var Ir={},Nt;function $a(){if(Nt)return Ir;Nt=1;var e=ut();function r(n,o){var a=n.generatedLine,s=o.generatedLine,c=n.generatedColumn,u=o.generatedColumn;return s>a||s==a&&u>=c||e.compareByGeneratedPositionsInflated(n,o)<=0}function t(){this._array=[],this._sorted=!0,this._last={generatedLine:-1,generatedColumn:0}}return t.prototype.unsortedForEach=function(o,a){this._array.forEach(o,a)},t.prototype.add=function(o){r(this._last,o)?(this._last=o,this._array.push(o)):(this._sorted=!1,this._array.push(o))},t.prototype.toArray=function(){return this._sorted||(this._array.sort(e.compareByGeneratedPositionsInflated),this._sorted=!0),this._array},Ir.MappingList=t,Ir}var Rt;function La(){if(Rt)return Lr;Rt=1;var e=Ea(),r=ut(),t=za().ArraySet,n=$a().MappingList;function o(a){a||(a={}),this._file=r.getArg(a,"file",null),this._sourceRoot=r.getArg(a,"sourceRoot",null),this._skipValidation=r.getArg(a,"skipValidation",!1),this._ignoreInvalidMapping=r.getArg(a,"ignoreInvalidMapping",!1),this._sources=new t,this._names=new t,this._mappings=new n,this._sourcesContents=null}return o.prototype._version=3,o.fromSourceMap=function(s,c){var u=s.sourceRoot,i=new o(Object.assign(c||{},{file:s.file,sourceRoot:u}));return s.eachMapping(function(l){var p={generated:{line:l.generatedLine,column:l.generatedColumn}};l.source!=null&&(p.source=l.source,u!=null&&(p.source=r.relative(u,p.source)),p.original={line:l.originalLine,column:l.originalColumn},l.name!=null&&(p.name=l.name)),i.addMapping(p)}),s.sources.forEach(function(l){var p=l;u!==null&&(p=r.relative(u,l)),i._sources.has(p)||i._sources.add(p);var f=s.sourceContentFor(l);f!=null&&i.setSourceContent(l,f)}),i},o.prototype.addMapping=function(s){var c=r.getArg(s,"generated"),u=r.getArg(s,"original",null),i=r.getArg(s,"source",null),l=r.getArg(s,"name",null);!this._skipValidation&&this._validateMapping(c,u,i,l)===!1||(i!=null&&(i=String(i),this._sources.has(i)||this._sources.add(i)),l!=null&&(l=String(l),this._names.has(l)||this._names.add(l)),this._mappings.add({generatedLine:c.line,generatedColumn:c.column,originalLine:u!=null&&u.line,originalColumn:u!=null&&u.column,source:i,name:l}))},o.prototype.setSourceContent=function(s,c){var u=s;this._sourceRoot!=null&&(u=r.relative(this._sourceRoot,u)),c!=null?(this._sourcesContents||(this._sourcesContents=Object.create(null)),this._sourcesContents[r.toSetString(u)]=c):this._sourcesContents&&(delete this._sourcesContents[r.toSetString(u)],Object.keys(this._sourcesContents).length===0&&(this._sourcesContents=null))},o.prototype.applySourceMap=function(s,c,u){var i=c;if(c==null){if(s.file==null)throw new Error(`SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, or the source map's "file" property. Both were omitted.`);i=s.file}var l=this._sourceRoot;l!=null&&(i=r.relative(l,i));var p=new t,f=new t;this._mappings.unsortedForEach(function(m){if(m.source===i&&m.originalLine!=null){var v=s.originalPositionFor({line:m.originalLine,column:m.originalColumn});v.source!=null&&(m.source=v.source,u!=null&&(m.source=r.join(u,m.source)),l!=null&&(m.source=r.relative(l,m.source)),m.originalLine=v.line,m.originalColumn=v.column,v.name!=null&&(m.name=v.name))}var _=m.source;_!=null&&!p.has(_)&&p.add(_);var $=m.name;$!=null&&!f.has($)&&f.add($)},this),this._sources=p,this._names=f,s.sources.forEach(function(m){var v=s.sourceContentFor(m);v!=null&&(u!=null&&(m=r.join(u,m)),l!=null&&(m=r.relative(l,m)),this.setSourceContent(m,v))},this)},o.prototype._validateMapping=function(s,c,u,i){if(c&&typeof c.line!="number"&&typeof c.column!="number"){var l="original.line and original.column are not numbers -- you probably meant to omit the original mapping entirely and only map the generated position. If so, pass null for the original mapping instead of an object with empty or null values.";if(this._ignoreInvalidMapping)return typeof console<"u"&&console.warn&&console.warn(l),!1;throw new Error(l)}if(!(s&&"line"in s&&"column"in s&&s.line>0&&s.column>=0&&!c&&!u&&!i)){if(s&&"line"in s&&"column"in s&&c&&"line"in c&&"column"in c&&s.line>0&&s.column>=0&&c.line>0&&c.column>=0&&u)return;var l="Invalid mapping: "+JSON.stringify({generated:s,source:u,original:c,name:i});if(this._ignoreInvalidMapping)return typeof console<"u"&&console.warn&&console.warn(l),!1;throw new Error(l)}},o.prototype._serializeMappings=function(){for(var s=0,c=1,u=0,i=0,l=0,p=0,f="",m,v,_,$,k=this._mappings.toArray(),T=0,J=k.length;T<J;T++){if(v=k[T],m="",v.generatedLine!==c)for(s=0;v.generatedLine!==c;)m+=";",c++;else if(T>0){if(!r.compareByGeneratedPositionsInflated(v,k[T-1]))continue;m+=","}m+=e.encode(v.generatedColumn-s),s=v.generatedColumn,v.source!=null&&($=this._sources.indexOf(v.source),m+=e.encode($-p),p=$,m+=e.encode(v.originalLine-1-i),i=v.originalLine-1,m+=e.encode(v.originalColumn-u),u=v.originalColumn,v.name!=null&&(_=this._names.indexOf(v.name),m+=e.encode(_-l),l=_)),f+=m}return f},o.prototype._generateSourcesContent=function(s,c){return s.map(function(u){if(!this._sourcesContents)return null;c!=null&&(u=r.relative(c,u));var i=r.toSetString(u);return Object.prototype.hasOwnProperty.call(this._sourcesContents,i)?this._sourcesContents[i]:null},this)},o.prototype.toJSON=function(){var s={version:this._version,sources:this._sources.toArray(),names:this._names.toArray(),mappings:this._serializeMappings()};return this._file!=null&&(s.file=this._file),this._sourceRoot!=null&&(s.sourceRoot=this._sourceRoot),this._sourcesContents&&(s.sourcesContent=this._generateSourcesContent(s.sources,s.sourceRoot)),s},o.prototype.toString=function(){return JSON.stringify(this.toJSON())},Lr.SourceMapGenerator=o,Lr}var Pa=La();const Ft=new Set(["Atrule","Selector","Declaration"]);function Ma(e){const r=new Pa.SourceMapGenerator,t={line:1,column:0},n={line:0,column:0},o={line:1,column:0},a={generated:o};let s=1,c=0,u=!1;const i=e.node;e.node=function(f){if(f.loc&&f.loc.start&&Ft.has(f.type)){const m=f.loc.start.line,v=f.loc.start.column-1;(n.line!==m||n.column!==v)&&(n.line=m,n.column=v,t.line=s,t.column=c,u&&(u=!1,(t.line!==o.line||t.column!==o.column)&&r.addMapping(a)),u=!0,r.addMapping({source:f.loc.source,original:n,generated:t}))}i.call(this,f),u&&Ft.has(f.type)&&(o.line=s,o.column=c)};const l=e.emit;e.emit=function(f,m,v){for(let _=0;_<f.length;_++)f.charCodeAt(_)===10?(s++,c=0):c++;l(f,m,v)};const p=e.result;return e.result=function(){return u&&r.addMapping(a),{css:p(),map:r}},e}const Ia=43,ja=45,jr=(e,r)=>{if(e===C&&(e=r),typeof e=="string"){const t=e.charCodeAt(0);return t>127?32768:t<<8}return e},Nn=[[y,y],[y,A],[y,q],[y,V],[y,"-"],[y,x],[y,M],[y,S],[y,K],[y,N],[j,y],[j,A],[j,q],[j,V],[j,"-"],[j,x],[j,M],[j,S],[j,K],[P,y],[P,A],[P,q],[P,V],[P,"-"],[P,x],[P,M],[P,S],[P,K],[S,y],[S,A],[S,q],[S,V],[S,"-"],[S,x],[S,M],[S,S],[S,K],["#",y],["#",A],["#",q],["#",V],["#","-"],["#",x],["#",M],["#",S],["#",K],["-",y],["-",A],["-",q],["-",V],["-","-"],["-",x],["-",M],["-",S],["-",K],[x,y],[x,A],[x,q],[x,V],[x,x],[x,M],[x,S],[x,"%"],[x,K],["@",y],["@",A],["@",q],["@",V],["@","-"],["@",K],[".",x],[".",M],[".",S],["+",x],["+",M],["+",S],["/","*"]],Da=Nn.concat([[y,P],[S,P],[P,P],[j,N],[j,pe],[j,U],[M,M],[M,S],[M,A],[M,"-"],[z,y],[z,A],[z,M],[z,S],[z,P],[z,"-"]]);function Rn(e){const r=new Set(e.map(([t,n])=>jr(t)<<16|jr(n)));return function(t,n,o){const a=jr(n,o),s=o.charCodeAt(0);return(s===ja&&n!==y&&n!==A&&n!==K||s===Ia?r.has(t<<16|s<<8):r.has(t<<16|a))&&this.emit(" ",I,!0),a}}const Na=Rn(Nn),Fn=Rn(Da),Bt=Object.freeze(Object.defineProperty({__proto__:null,safe:Fn,spec:Na},Symbol.toStringTag,{value:"Module"})),Ra=92;function Fa(e,r){if(typeof r=="function"){let t=null;e.children.forEach(n=>{t!==null&&r.call(this,t),this.node(n),t=n});return}e.children.forEach(this.node,this)}function Ba(e){xr(e,(r,t,n)=>{this.token(r,e.slice(t,n))})}function qa(e){const r=new Map;for(let t in e.node){const n=e.node[t];typeof(n.generate||n)=="function"&&r.set(t,n.generate||n)}return function(t,n){let o="",a=0,s={node(u){if(r.has(u.type))r.get(u.type).call(c,u);else throw new Error("Unknown node type: "+u.type)},tokenBefore:Fn,token(u,i){a=this.tokenBefore(a,u,i),this.emit(i,u,!1),u===C&&i.charCodeAt(0)===Ra&&this.emit(`
`,I,!0)},emit(u){o+=u},result(){return o}};n&&(typeof n.decorator=="function"&&(s=n.decorator(s)),n.sourceMap&&(s=Ma(s)),n.mode in Bt&&(s.tokenBefore=Bt[n.mode]));const c={node:u=>s.node(u),children:Fa,token:(u,i)=>s.token(u,i),tokenize:Ba};return s.node(t),s.result()}}function Ua(e){return{fromPlainObject(r){return e(r,{enter(t){t.children&&!(t.children instanceof R)&&(t.children=new R().fromArray(t.children))}}),r},toPlainObject(r){return e(r,{leave(t){t.children&&t.children instanceof R&&(t.children=t.children.toArray())}}),r}}}const{hasOwnProperty:pt}=Object.prototype,je=function(){};function qt(e){return typeof e=="function"?e:je}function Ut(e,r){return function(t,n,o){t.type===r&&e.call(this,t,n,o)}}function Ga(e,r){const t=r.structure,n=[];for(const o in t){if(pt.call(t,o)===!1)continue;let a=t[o];const s={name:o,type:!1,nullable:!1};Array.isArray(a)||(a=[a]);for(const c of a)c===null?s.nullable=!0:typeof c=="string"?s.type="node":Array.isArray(c)&&(s.type="list");s.type&&n.push(s)}return n.length?{context:r.walkContext,fields:n}:null}function Ha(e){const r={};for(const t in e.node)if(pt.call(e.node,t)){const n=e.node[t];if(!n.structure)throw new Error("Missed `structure` field in `"+t+"` node type definition");r[t]=Ga(t,n)}return r}function Gt(e,r){const t=e.fields.slice(),n=e.context,o=typeof n=="string";return r&&t.reverse(),function(a,s,c,u){let i;o&&(i=s[n],s[n]=a);for(const l of t){const p=a[l.name];if(!l.nullable||p){if(l.type==="list"){if(r?p.reduceRight(u,!1):p.reduce(u,!1))return!0}else if(c(p))return!0}}o&&(s[n]=i)}}function Ht({StyleSheet:e,Atrule:r,Rule:t,Block:n,DeclarationList:o}){return{Atrule:{StyleSheet:e,Atrule:r,Rule:t,Block:n},Rule:{StyleSheet:e,Atrule:r,Rule:t,Block:n},Declaration:{StyleSheet:e,Atrule:r,Rule:t,Block:n,DeclarationList:o}}}function Wa(e){const r=Ha(e),t={},n={},o=Symbol("break-walk"),a=Symbol("skip-node");for(const i in r)pt.call(r,i)&&r[i]!==null&&(t[i]=Gt(r[i],!1),n[i]=Gt(r[i],!0));const s=Ht(t),c=Ht(n),u=function(i,l){function p(k,T,J){const w=f.call($,k,T,J);return w===o?!0:w===a?!1:!!(v.hasOwnProperty(k.type)&&v[k.type](k,$,p,_)||m.call($,k,T,J)===o)}let f=je,m=je,v=t,_=(k,T,J,w)=>k||p(T,J,w);const $={break:o,skip:a,root:i,stylesheet:null,atrule:null,atrulePrelude:null,rule:null,selector:null,block:null,declaration:null,function:null};if(typeof l=="function")f=l;else if(l&&(f=qt(l.enter),m=qt(l.leave),l.reverse&&(v=n),l.visit)){if(s.hasOwnProperty(l.visit))v=l.reverse?c[l.visit]:s[l.visit];else if(!r.hasOwnProperty(l.visit))throw new Error("Bad value `"+l.visit+"` for `visit` option (should be: "+Object.keys(r).sort().join(", ")+")");f=Ut(f,l.visit),m=Ut(m,l.visit)}if(f===je&&m===je)throw new Error("Neither `enter` nor `leave` walker handler is set or both aren't a function");p(i)};return u.break=o,u.skip=a,u.find=function(i,l){let p=null;return u(i,function(f,m,v){if(l.call(this,f,m,v))return p=f,o}),p},u.findLast=function(i,l){let p=null;return u(i,{reverse:!0,enter(f,m,v){if(l.call(this,f,m,v))return p=f,o}}),p},u.findAll=function(i,l){const p=[];return u(i,function(f,m,v){l.call(this,f,m,v)&&p.push(f)}),p},u}function Va(e){return e}function Ka(e){const{min:r,max:t,comma:n}=e;return r===0&&t===0?n?"#?":"*":r===0&&t===1?"?":r===1&&t===0?n?"#":"+":r===1&&t===1?"":(n?"#":"")+(r===t?"{"+r+"}":"{"+r+","+(t!==0?t:"")+"}")}function Qa(e){switch(e.type){case"Range":return" ["+(e.min===null?"-∞":e.min)+","+(e.max===null?"∞":e.max)+"]";default:throw new Error("Unknown node type `"+e.type+"`")}}function Ya(e,r,t,n){const o=e.combinator===" "||n?e.combinator:" "+e.combinator+" ",a=e.terms.map(s=>dt(s,r,t,n)).join(o);return e.explicit||t?(n||a[0]===","?"[":"[ ")+a+(n?"]":" ]"):a}function dt(e,r,t,n){let o;switch(e.type){case"Group":o=Ya(e,r,t,n)+(e.disallowEmpty?"!":"");break;case"Multiplier":return dt(e.term,r,t,n)+r(Ka(e),e);case"Type":o="<"+e.name+(e.opts?r(Qa(e.opts),e.opts):"")+">";break;case"Property":o="<'"+e.name+"'>";break;case"Keyword":o=e.name;break;case"AtKeyword":o="@"+e.name;break;case"Function":o=e.name+"(";break;case"String":case"Token":o=e.value;break;case"Comma":o=",";break;default:throw new Error("Unknown node type `"+e.type+"`")}return r(o,e)}function ht(e,r){let t=Va,n=!1,o=!1;return typeof r=="function"?t=r:r&&(n=!!r.forceBraces,o=!!r.compact,typeof r.decorate=="function"&&(t=r.decorate)),dt(e,t,n,o)}const Wt={offset:0,line:1,column:1};function Xa(e,r){const t=e.tokens,n=e.longestMatch,o=n<t.length&&t[n].node||null,a=o!==r?o:null;let s=0,c=0,u=0,i="",l,p;for(let f=0;f<t.length;f++){const m=t[f].value;f===n&&(c=m.length,s=i.length),a!==null&&t[f].node===a&&(f<=n?u++:u=0),i+=m}return n===t.length||u>1?(l=Je(a||r,"end")||De(Wt,i),p=De(l)):(l=Je(a,"start")||De(Je(r,"start")||Wt,i.slice(0,s)),p=Je(a,"end")||De(l,i.substr(s,c))),{css:i,mismatchOffset:s,mismatchLength:c,start:l,end:p}}function Je(e,r){const t=e&&e.loc&&e.loc[r];return t?"line"in t?De(t):t:null}function De({offset:e,line:r,column:t},n){const o={offset:e,line:r,column:t};if(n){const a=n.split(/\n|\r\n?|\f/);o.offset+=n.length,o.line+=a.length-1,o.column=a.length===1?o.column+n.length:a.pop().length+1}return o}const Ie=function(e,r){const t=kr("SyntaxReferenceError",e+(r?" `"+r+"`":""));return t.reference=r,t},Za=function(e,r,t,n){const o=kr("SyntaxMatchError",e),{css:a,mismatchOffset:s,mismatchLength:c,start:u,end:i}=Xa(n,t);return o.rawMessage=e,o.syntax=r?ht(r):"<generic>",o.css=a,o.mismatchOffset=s,o.mismatchLength=c,o.message=e+`
  syntax: `+o.syntax+`
   value: `+(a||"<empty string>")+`
  --------`+new Array(o.mismatchOffset+1).join("-")+"^",Object.assign(o,u),o.loc={source:t&&t.loc&&t.loc.source||"<unknown>",start:u,end:i},o},er=new Map,Ce=new Map,dr=45,Dr=Ja,Vt=ei;function mt(e,r){return r=r||0,e.length-r>=2&&e.charCodeAt(r)===dr&&e.charCodeAt(r+1)===dr}function Bn(e,r){if(r=r||0,e.length-r>=3&&e.charCodeAt(r)===dr&&e.charCodeAt(r+1)!==dr){const t=e.indexOf("-",r+2);if(t!==-1)return e.substring(r,t+1)}return""}function Ja(e){if(er.has(e))return er.get(e);const r=e.toLowerCase();let t=er.get(r);if(t===void 0){const n=mt(r,0),o=n?"":Bn(r,0);t=Object.freeze({basename:r.substr(o.length),name:r,prefix:o,vendor:o,custom:n})}return er.set(e,t),t}function ei(e){if(Ce.has(e))return Ce.get(e);let r=e,t=e[0];t==="/"?t=e[1]==="/"?"//":"/":t!=="_"&&t!=="*"&&t!=="$"&&t!=="#"&&t!=="+"&&t!=="&"&&(t="");const n=mt(r,t.length);if(!n&&(r=r.toLowerCase(),Ce.has(r))){const c=Ce.get(r);return Ce.set(e,c),c}const o=n?"":Bn(r,t.length),a=r.substr(0,t.length+o.length),s=Object.freeze({basename:r.substr(a.length),name:r.substr(t.length),hack:t,vendor:o,prefix:a,custom:n});return Ce.set(e,s),s}const qn=["initial","inherit","unset","revert","revert-layer"],Ge=43,le=45,Nr=110,Ae=!0,ri=!1;function Yr(e,r){return e!==null&&e.type===C&&e.value.charCodeAt(0)===r}function Be(e,r,t){for(;e!==null&&(e.type===I||e.type===H);)e=t(++r);return r}function ye(e,r,t,n){if(!e)return 0;const o=e.value.charCodeAt(r);if(o===Ge||o===le){if(t)return 0;r++}for(;r<e.value.length;r++)if(!F(e.value.charCodeAt(r)))return 0;return n+1}function Rr(e,r,t){let n=!1,o=Be(e,r,t);if(e=t(o),e===null)return r;if(e.type!==x)if(Yr(e,Ge)||Yr(e,le)){if(n=!0,o=Be(t(++o),o,t),e=t(o),e===null||e.type!==x)return 0}else return r;if(!n){const a=e.value.charCodeAt(0);if(a!==Ge&&a!==le)return 0}return ye(e,n?0:1,n,o)}function ti(e,r){let t=0;if(!e)return 0;if(e.type===x)return ye(e,0,ri,t);if(e.type===y&&e.value.charCodeAt(0)===le){if(!Ee(e.value,1,Nr))return 0;switch(e.value.length){case 2:return Rr(r(++t),t,r);case 3:return e.value.charCodeAt(2)!==le?0:(t=Be(r(++t),t,r),e=r(t),ye(e,0,Ae,t));default:return e.value.charCodeAt(2)!==le?0:ye(e,3,Ae,t)}}else if(e.type===y||Yr(e,Ge)&&r(t+1).type===y){if(e.type!==y&&(e=r(++t)),e===null||!Ee(e.value,0,Nr))return 0;switch(e.value.length){case 1:return Rr(r(++t),t,r);case 2:return e.value.charCodeAt(1)!==le?0:(t=Be(r(++t),t,r),e=r(t),ye(e,0,Ae,t));default:return e.value.charCodeAt(1)!==le?0:ye(e,2,Ae,t)}}else if(e.type===S){let n=e.value.charCodeAt(0),o=n===Ge||n===le?1:0,a=o;for(;a<e.value.length&&F(e.value.charCodeAt(a));a++);return a===o||!Ee(e.value,a,Nr)?0:a+1===e.value.length?Rr(r(++t),t,r):e.value.charCodeAt(a+1)!==le?0:a+2===e.value.length?(t=Be(r(++t),t,r),e=r(t),ye(e,0,Ae,t)):ye(e,a+2,Ae,t)}return 0}const ni=43,Un=45,Gn=63,oi=117;function Xr(e,r){return e!==null&&e.type===C&&e.value.charCodeAt(0)===r}function ai(e,r){return e.value.charCodeAt(0)===r}function Ne(e,r,t){let n=0;for(let o=r;o<e.value.length;o++){const a=e.value.charCodeAt(o);if(a===Un&&t&&n!==0)return Ne(e,r+n+1,!1),6;if(!ve(a)||++n>6)return 0}return n}function rr(e,r,t){if(!e)return 0;for(;Xr(t(r),Gn);){if(++e>6)return 0;r++}return r}function ii(e,r){let t=0;if(e===null||e.type!==y||!Ee(e.value,0,oi)||(e=r(++t),e===null))return 0;if(Xr(e,ni))return e=r(++t),e===null?0:e.type===y?rr(Ne(e,0,!0),++t,r):Xr(e,Gn)?rr(1,++t,r):0;if(e.type===x){const n=Ne(e,1,!0);return n===0?0:(e=r(++t),e===null?t:e.type===S||e.type===x?!ai(e,Un)||!Ne(e,1,!1)?0:t+1:rr(n,t,r))}return e.type===S?rr(Ne(e,1,!0),++t,r):0}const si=["calc(","-moz-calc(","-webkit-calc("],ft=new Map([[A,z],[N,z],[Z,se],[G,te]]);function ie(e,r){return r<e.length?e.charCodeAt(r):0}function Hn(e,r){return Ue(e,0,e.length,r)}function Wn(e,r){for(let t=0;t<r.length;t++)if(Hn(e,r[t]))return!0;return!1}function Vn(e,r){return r!==e.length-2?!1:ie(e,r)===92&&F(ie(e,r+1))}function wr(e,r,t){if(e&&e.type==="Range"){const n=Number(t!==void 0&&t!==r.length?r.substr(0,t):r);if(isNaN(n)||e.min!==null&&n<e.min&&typeof e.min!="string"||e.max!==null&&n>e.max&&typeof e.max!="string")return!0}return!1}function li(e,r){let t=0,n=[],o=0;e:do{switch(e.type){case te:case z:case se:if(e.type!==t)break e;if(t=n.pop(),n.length===0){o++;break e}break;case A:case N:case Z:case G:n.push(t),t=ft.get(e.type);break}o++}while(e=r(o));return o}function re(e){return function(r,t,n){return r===null?0:r.type===A&&Wn(r.value,si)?li(r,t):e(r,t,n)}}function L(e){return function(r){return r===null||r.type!==e?0:1}}function ci(e){if(e===null||e.type!==y)return 0;const r=e.value.toLowerCase();return Wn(r,qn)||Hn(r,"default")?0:1}function ui(e){return e===null||e.type!==y||ie(e.value,0)!==45||ie(e.value,1)!==45?0:1}function pi(e){if(e===null||e.type!==P)return 0;const r=e.value.length;if(r!==4&&r!==5&&r!==7&&r!==9)return 0;for(let t=1;t<r;t++)if(!ve(ie(e.value,t)))return 0;return 1}function di(e){return e===null||e.type!==P||!or(ie(e.value,1),ie(e.value,2),ie(e.value,3))?0:1}function hi(e,r){if(!e)return 0;let t=0,n=[],o=0;e:do{switch(e.type){case br:case V:break e;case te:case z:case se:if(e.type!==t)break e;t=n.pop();break;case Q:if(t===0)break e;break;case C:if(t===0&&e.value==="!")break e;break;case A:case N:case Z:case G:n.push(t),t=ft.get(e.type);break}o++}while(e=r(o));return o}function mi(e,r){if(!e)return 0;let t=0,n=[],o=0;e:do{switch(e.type){case br:case V:break e;case te:case z:case se:if(e.type!==t)break e;t=n.pop();break;case A:case N:case Z:case G:n.push(t),t=ft.get(e.type);break}o++}while(e=r(o));return o}function me(e){return e&&(e=new Set(e)),function(r,t,n){if(r===null||r.type!==S)return 0;const o=vr(r.value,0);if(e!==null){const a=r.value.indexOf("\\",o),s=a===-1||!Vn(r.value,a)?r.value.substr(o):r.value.substring(o,a);if(e.has(s.toLowerCase())===!1)return 0}return wr(n,r.value,o)?0:1}}function fi(e,r,t){return e===null||e.type!==M||wr(t,e.value,e.value.length-1)?0:1}function Kn(e){return typeof e!="function"&&(e=function(){return 0}),function(r,t,n){return r!==null&&r.type===x&&Number(r.value)===0?1:e(r,t,n)}}function gi(e,r,t){if(e===null)return 0;const n=vr(e.value,0);return!(n===e.value.length)&&!Vn(e.value,n)||wr(t,e.value,n)?0:1}function yi(e,r,t){if(e===null||e.type!==x)return 0;let n=ie(e.value,0)===43||ie(e.value,0)===45?1:0;for(;n<e.value.length;n++)if(!F(ie(e.value,n)))return 0;return wr(t,e.value,n)?0:1}const bi={"ident-token":L(y),"function-token":L(A),"at-keyword-token":L(j),"hash-token":L(P),"string-token":L(pe),"bad-string-token":L(br),"url-token":L(q),"bad-url-token":L(V),"delim-token":L(C),"number-token":L(x),"percentage-token":L(M),"dimension-token":L(S),"whitespace-token":L(I),"CDO-token":L(We),"CDC-token":L(K),"colon-token":L(U),"semicolon-token":L(Q),"comma-token":L(de),"[-token":L(Z),"]-token":L(se),"(-token":L(N),")-token":L(z),"{-token":L(G),"}-token":L(te)},vi={string:L(pe),ident:L(y),percentage:re(fi),zero:Kn(),number:re(gi),integer:re(yi),"custom-ident":ci,"custom-property-name":ui,"hex-color":pi,"id-selector":di,"an-plus-b":ti,urange:ii,"declaration-value":hi,"any-value":mi};function xi(e){const{angle:r,decibel:t,frequency:n,flex:o,length:a,resolution:s,semitones:c,time:u}=e||{};return{dimension:re(me(null)),angle:re(me(r)),decibel:re(me(t)),frequency:re(me(n)),flex:re(me(o)),length:re(Kn(me(a))),resolution:re(me(s)),semitones:re(me(c)),time:re(me(u))}}function ki(e){return{...bi,...vi,...xi(e)}}const wi=["cm","mm","q","in","pt","pc","px","em","rem","ex","rex","cap","rcap","ch","rch","ic","ric","lh","rlh","vw","svw","lvw","dvw","vh","svh","lvh","dvh","vi","svi","lvi","dvi","vb","svb","lvb","dvb","vmin","svmin","lvmin","dvmin","vmax","svmax","lvmax","dvmax","cqw","cqh","cqi","cqb","cqmin","cqmax"],Si=["deg","grad","rad","turn"],Ci=["s","ms"],Ai=["hz","khz"],Ti=["dpi","dpcm","dppx","x"],Oi=["fr"],_i=["db"],Ei=["st"],Kt=Object.freeze(Object.defineProperty({__proto__:null,angle:Si,decibel:_i,flex:Oi,frequency:Ai,length:wi,resolution:Ti,semitones:Ei,time:Ci},Symbol.toStringTag,{value:"Module"}));function zi(e,r,t){return Object.assign(kr("SyntaxError",e),{input:r,offset:t,rawMessage:e,message:e+`
  `+r+`
--`+new Array((t||r.length)+1).join("-")+"^"})}const $i=9,Li=10,Pi=12,Mi=13,Ii=32;class ji{constructor(r){this.str=r,this.pos=0}charCodeAt(r){return r<this.str.length?this.str.charCodeAt(r):0}charCode(){return this.charCodeAt(this.pos)}nextCharCode(){return this.charCodeAt(this.pos+1)}nextNonWsCode(r){return this.charCodeAt(this.findWsEnd(r))}findWsEnd(r){for(;r<this.str.length;r++){const t=this.str.charCodeAt(r);if(t!==Mi&&t!==Li&&t!==Pi&&t!==Ii&&t!==$i)break}return r}substringToPos(r){return this.str.substring(this.pos,this.pos=r)}eat(r){this.charCode()!==r&&this.error("Expect `"+String.fromCharCode(r)+"`"),this.pos++}peek(){return this.pos<this.str.length?this.str.charAt(this.pos++):""}error(r){throw new zi(r,this.str,this.pos)}}const Di=9,Ni=10,Ri=12,Fi=13,Bi=32,Qn=33,gt=35,Qt=38,hr=39,Yn=40,qi=41,Xn=42,yt=43,bt=44,Yt=45,vt=60,Zn=62,Zr=63,Ui=64,Sr=91,xt=93,mr=123,Xt=124,Zt=125,Jt=8734,He=new Uint8Array(128).map((e,r)=>/[a-zA-Z0-9\-]/.test(String.fromCharCode(r))?1:0),en={" ":1,"&&":2,"||":3,"|":4};function fr(e){return e.substringToPos(e.findWsEnd(e.pos))}function Le(e){let r=e.pos;for(;r<e.str.length;r++){const t=e.str.charCodeAt(r);if(t>=128||He[t]===0)break}return e.pos===r&&e.error("Expect a keyword"),e.substringToPos(r)}function gr(e){let r=e.pos;for(;r<e.str.length;r++){const t=e.str.charCodeAt(r);if(t<48||t>57)break}return e.pos===r&&e.error("Expect a number"),e.substringToPos(r)}function Gi(e){const r=e.str.indexOf("'",e.pos+1);return r===-1&&(e.pos=e.str.length,e.error("Expect an apostrophe")),e.substringToPos(r+1)}function rn(e){let r=null,t=null;return e.eat(mr),r=gr(e),e.charCode()===bt?(e.pos++,e.charCode()!==Zt&&(t=gr(e))):t=r,e.eat(Zt),{min:Number(r),max:t?Number(t):0}}function Hi(e){let r=null,t=!1;switch(e.charCode()){case Xn:e.pos++,r={min:0,max:0};break;case yt:e.pos++,r={min:1,max:0};break;case Zr:e.pos++,r={min:0,max:1};break;case gt:e.pos++,t=!0,e.charCode()===mr?r=rn(e):e.charCode()===Zr?(e.pos++,r={min:0,max:0}):r={min:1,max:0};break;case mr:r=rn(e);break;default:return null}return{type:"Multiplier",comma:t,min:r.min,max:r.max,term:null}}function Pe(e,r){const t=Hi(e);return t!==null?(t.term=r,e.charCode()===gt&&e.charCodeAt(e.pos-1)===yt?Pe(e,t):t):r}function Fr(e){const r=e.peek();return r===""?null:{type:"Token",value:r}}function Wi(e){let r;return e.eat(vt),e.eat(hr),r=Le(e),e.eat(hr),e.eat(Zn),Pe(e,{type:"Property",name:r})}function Vi(e){let r=null,t=null,n=1;return e.eat(Sr),e.charCode()===Yt&&(e.peek(),n=-1),n==-1&&e.charCode()===Jt?e.peek():(r=n*Number(gr(e)),He[e.charCode()]!==0&&(r+=Le(e))),fr(e),e.eat(bt),fr(e),e.charCode()===Jt?e.peek():(n=1,e.charCode()===Yt&&(e.peek(),n=-1),t=n*Number(gr(e)),He[e.charCode()]!==0&&(t+=Le(e))),e.eat(xt),{type:"Range",min:r,max:t}}function Ki(e){let r,t=null;return e.eat(vt),r=Le(e),e.charCode()===Yn&&e.nextCharCode()===qi&&(e.pos+=2,r+="()"),e.charCodeAt(e.findWsEnd(e.pos))===Sr&&(fr(e),t=Vi(e)),e.eat(Zn),Pe(e,{type:"Type",name:r,opts:t})}function Qi(e){const r=Le(e);return e.charCode()===Yn?(e.pos++,{type:"Function",name:r}):Pe(e,{type:"Keyword",name:r})}function Yi(e,r){function t(o,a){return{type:"Group",terms:o,combinator:a,disallowEmpty:!1,explicit:!1}}let n;for(r=Object.keys(r).sort((o,a)=>en[o]-en[a]);r.length>0;){n=r.shift();let o=0,a=0;for(;o<e.length;o++){const s=e[o];s.type==="Combinator"&&(s.value===n?(a===-1&&(a=o-1),e.splice(o,1),o--):(a!==-1&&o-a>1&&(e.splice(a,o-a,t(e.slice(a,o),n)),o=a+1),a=-1))}a!==-1&&r.length&&e.splice(a,o-a,t(e.slice(a,o),n))}return n}function Jn(e){const r=[],t={};let n,o=null,a=e.pos;for(;n=Zi(e);)n.type!=="Spaces"&&(n.type==="Combinator"?((o===null||o.type==="Combinator")&&(e.pos=a,e.error("Unexpected combinator")),t[n.value]=!0):o!==null&&o.type!=="Combinator"&&(t[" "]=!0,r.push({type:"Combinator",value:" "})),r.push(n),o=n,a=e.pos);return o!==null&&o.type==="Combinator"&&(e.pos-=a,e.error("Unexpected combinator")),{type:"Group",terms:r,combinator:Yi(r,t)||" ",disallowEmpty:!1,explicit:!1}}function Xi(e){let r;return e.eat(Sr),r=Jn(e),e.eat(xt),r.explicit=!0,e.charCode()===Qn&&(e.pos++,r.disallowEmpty=!0),r}function Zi(e){let r=e.charCode();if(r<128&&He[r]===1)return Qi(e);switch(r){case xt:break;case Sr:return Pe(e,Xi(e));case vt:return e.nextCharCode()===hr?Wi(e):Ki(e);case Xt:return{type:"Combinator",value:e.substringToPos(e.pos+(e.nextCharCode()===Xt?2:1))};case Qt:return e.pos++,e.eat(Qt),{type:"Combinator",value:"&&"};case bt:return e.pos++,{type:"Comma"};case hr:return Pe(e,{type:"String",value:Gi(e)});case Bi:case Di:case Ni:case Fi:case Ri:return{type:"Spaces",value:fr(e)};case Ui:return r=e.nextCharCode(),r<128&&He[r]===1?(e.pos++,{type:"AtKeyword",name:Le(e)}):Fr(e);case Xn:case yt:case Zr:case gt:case Qn:break;case mr:if(r=e.nextCharCode(),r<48||r>57)return Fr(e);break;default:return Fr(e)}}function eo(e){const r=new ji(e),t=Jn(r);return r.pos!==e.length&&r.error("Unexpected input"),t.terms.length===1&&t.terms[0].type==="Group"?t.terms[0]:t}const Re=function(){};function tn(e){return typeof e=="function"?e:Re}function Ji(e,r,t){function n(s){switch(o.call(t,s),s.type){case"Group":s.terms.forEach(n);break;case"Multiplier":n(s.term);break;case"Type":case"Property":case"Keyword":case"AtKeyword":case"Function":case"String":case"Token":case"Comma":break;default:throw new Error("Unknown type: "+s.type)}a.call(t,s)}let o=Re,a=Re;if(typeof r=="function"?o=r:r&&(o=tn(r.enter),a=tn(r.leave)),o===Re&&a===Re)throw new Error("Neither `enter` nor `leave` walker handler is set or both aren't a function");n(e)}const es={decorator(e){const r=[];let t=null;return{...e,node(n){const o=t;t=n,e.node.call(this,n),t=o},emit(n,o,a){r.push({type:o,value:n,node:a?null:t})},result(){return r}}}};function rs(e){const r=[];return xr(e,(t,n,o)=>r.push({type:t,value:e.slice(n,o),node:null})),r}function ts(e,r){return typeof e=="string"?rs(e):r.generate(e,es)}const O={type:"Match"},E={type:"Mismatch"},kt={type:"DisallowEmpty"},ns=40,os=41;function B(e,r,t){return r===O&&t===E||e===O&&r===O&&t===O?e:(e.type==="If"&&e.else===E&&r===O&&(r=e.then,e=e.match),{type:"If",match:e,then:r,else:t})}function ro(e){return e.length>2&&e.charCodeAt(e.length-2)===ns&&e.charCodeAt(e.length-1)===os}function nn(e){return e.type==="Keyword"||e.type==="AtKeyword"||e.type==="Function"||e.type==="Type"&&ro(e.name)}function Jr(e,r,t){switch(e){case" ":{let n=O;for(let o=r.length-1;o>=0;o--){const a=r[o];n=B(a,n,E)}return n}case"|":{let n=E,o=null;for(let a=r.length-1;a>=0;a--){let s=r[a];if(nn(s)&&(o===null&&a>0&&nn(r[a-1])&&(o=Object.create(null),n=B({type:"Enum",map:o},O,n)),o!==null)){const c=(ro(s.name)?s.name.slice(0,-1):s.name).toLowerCase();if(!(c in o)){o[c]=s;continue}}o=null,n=B(s,O,n)}return n}case"&&":{if(r.length>5)return{type:"MatchOnce",terms:r,all:!0};let n=E;for(let o=r.length-1;o>=0;o--){const a=r[o];let s;r.length>1?s=Jr(e,r.filter(function(c){return c!==a}),!1):s=O,n=B(a,s,n)}return n}case"||":{if(r.length>5)return{type:"MatchOnce",terms:r,all:!1};let n=t?O:E;for(let o=r.length-1;o>=0;o--){const a=r[o];let s;r.length>1?s=Jr(e,r.filter(function(c){return c!==a}),!0):s=O,n=B(a,s,n)}return n}}}function as(e){let r=O,t=wt(e.term);if(e.max===0)t=B(t,kt,E),r=B(t,null,E),r.then=B(O,O,r),e.comma&&(r.then.else=B({type:"Comma",syntax:e},r,E));else for(let n=e.min||1;n<=e.max;n++)e.comma&&r!==O&&(r=B({type:"Comma",syntax:e},r,E)),r=B(t,B(O,O,r),E);if(e.min===0)r=B(O,O,r);else for(let n=0;n<e.min-1;n++)e.comma&&r!==O&&(r=B({type:"Comma",syntax:e},r,E)),r=B(t,r,E);return r}function wt(e){if(typeof e=="function")return{type:"Generic",fn:e};switch(e.type){case"Group":{let r=Jr(e.combinator,e.terms.map(wt),!1);return e.disallowEmpty&&(r=B(r,kt,E)),r}case"Multiplier":return as(e);case"Type":case"Property":return{type:e.type,name:e.name,syntax:e};case"Keyword":return{type:e.type,name:e.name.toLowerCase(),syntax:e};case"AtKeyword":return{type:e.type,name:"@"+e.name.toLowerCase(),syntax:e};case"Function":return{type:e.type,name:e.name.toLowerCase()+"(",syntax:e};case"String":return e.value.length===3?{type:"Token",value:e.value.charAt(1),syntax:e}:{type:e.type,value:e.value.substr(1,e.value.length-2).replace(/\\'/g,"'"),syntax:e};case"Token":return{type:e.type,value:e.value,syntax:e};case"Comma":return{type:e.type,syntax:e};default:throw new Error("Unknown node type:",e.type)}}function et(e,r){return typeof e=="string"&&(e=eo(e)),{type:"MatchGraph",match:wt(e),syntax:r||null,source:e}}const{hasOwnProperty:on}=Object.prototype,is=0,ss=1,rt=2,to=3,an="Match",ls="Mismatch",cs="Maximum iteration number exceeded (please fill an issue on https://github.com/csstree/csstree/issues)",sn=15e3;function us(e){let r=null,t=null,n=e;for(;n!==null;)t=n.prev,n.prev=r,r=n,n=t;return r}function Br(e,r){if(e.length!==r.length)return!1;for(let t=0;t<e.length;t++){const n=r.charCodeAt(t);let o=e.charCodeAt(t);if(o>=65&&o<=90&&(o=o|32),o!==n)return!1}return!0}function ps(e){return e.type!==C?!1:e.value!=="?"}function ln(e){return e===null?!0:e.type===de||e.type===A||e.type===N||e.type===Z||e.type===G||ps(e)}function cn(e){return e===null?!0:e.type===z||e.type===se||e.type===te||e.type===C&&e.value==="/"}function ds(e,r,t){function n(){do T++,k=T<e.length?e[T]:null;while(k!==null&&(k.type===I||k.type===H))}function o(Y){const ne=T+Y;return ne<e.length?e[ne]:null}function a(Y,ne){return{nextState:Y,matchStack:w,syntaxStack:p,thenStack:f,tokenIndex:T,prev:ne}}function s(Y){f={nextState:Y,matchStack:w,syntaxStack:p,prev:f}}function c(Y){m=a(Y,m)}function u(){w={type:ss,syntax:r.syntax,token:k,prev:w},n(),v=null,T>J&&(J=T)}function i(){p={syntax:r.syntax,opts:r.syntax.opts||p!==null&&p.opts||null,prev:p},w={type:rt,syntax:r.syntax,token:w.token,prev:w}}function l(){w.type===rt?w=w.prev:w={type:to,syntax:p.syntax,token:w.token,prev:w},p=p.prev}let p=null,f=null,m=null,v=null,_=0,$=null,k=null,T=-1,J=0,w={type:is,syntax:null,token:null,prev:null};for(n();$===null&&++_<sn;)switch(r.type){case"Match":if(f===null){if(k!==null&&(T!==e.length-1||k.value!=="\\0"&&k.value!=="\\9")){r=E;break}$=an;break}if(r=f.nextState,r===kt)if(f.matchStack===w){r=E;break}else r=O;for(;f.syntaxStack!==p;)l();f=f.prev;break;case"Mismatch":if(v!==null&&v!==!1)(m===null||T>m.tokenIndex)&&(m=v,v=!1);else if(m===null){$=ls;break}r=m.nextState,f=m.thenStack,p=m.syntaxStack,w=m.matchStack,T=m.tokenIndex,k=T<e.length?e[T]:null,m=m.prev;break;case"MatchGraph":r=r.match;break;case"If":r.else!==E&&c(r.else),r.then!==O&&s(r.then),r=r.match;break;case"MatchOnce":r={type:"MatchOnceBuffer",syntax:r,index:0,mask:0};break;case"MatchOnceBuffer":{const D=r.syntax.terms;if(r.index===D.length){if(r.mask===0||r.syntax.all){r=E;break}r=O;break}if(r.mask===(1<<D.length)-1){r=O;break}for(;r.index<D.length;r.index++){const d=1<<r.index;if((r.mask&d)===0){c(r),s({type:"AddMatchOnce",syntax:r.syntax,mask:r.mask|d}),r=D[r.index++];break}}break}case"AddMatchOnce":r={type:"MatchOnceBuffer",syntax:r.syntax,index:0,mask:r.mask};break;case"Enum":if(k!==null){let D=k.value.toLowerCase();if(D.indexOf("\\")!==-1&&(D=D.replace(/\\[09].*$/,"")),on.call(r.map,D)){r=r.map[D];break}}r=E;break;case"Generic":{const D=p!==null?p.opts:null,d=T+Math.floor(r.fn(k,o,D));if(!isNaN(d)&&d>T){for(;T<d;)u();r=O}else r=E;break}case"Type":case"Property":{const D=r.type==="Type"?"types":"properties",d=on.call(t,D)?t[D][r.name]:null;if(!d||!d.match)throw new Error("Bad syntax reference: "+(r.type==="Type"?"<"+r.name+">":"<'"+r.name+"'>"));if(v!==!1&&k!==null&&r.type==="Type"&&(r.name==="custom-ident"&&k.type===y||r.name==="length"&&k.value==="0")){v===null&&(v=a(r,m)),r=E;break}i(),r=d.match;break}case"Keyword":{const D=r.name;if(k!==null){let d=k.value;if(d.indexOf("\\")!==-1&&(d=d.replace(/\\[09].*$/,"")),Br(d,D)){u(),r=O;break}}r=E;break}case"AtKeyword":case"Function":if(k!==null&&Br(k.value,r.name)){u(),r=O;break}r=E;break;case"Token":if(k!==null&&k.value===r.value){u(),r=O;break}r=E;break;case"Comma":k!==null&&k.type===de?ln(w.token)?r=E:(u(),r=cn(k)?E:O):r=ln(w.token)||cn(k)?O:E;break;case"String":let Y="",ne=T;for(;ne<e.length&&Y.length<r.value.length;ne++)Y+=e[ne].value;if(Br(Y,r.value)){for(;T<ne;)u();r=O}else r=E;break;default:throw new Error("Unknown node type: "+r.type)}switch($){case null:console.warn("[csstree-match] BREAK after "+sn+" iterations"),$=cs,w=null;break;case an:for(;p!==null;)l();break;default:w=null}return{tokens:e,reason:$,iterations:_,match:w,longestMatch:J}}function un(e,r,t){const n=ds(e,r,t||{});if(n.match===null)return n;let o=n.match,a=n.match={syntax:r.syntax||null,match:[]};const s=[a];for(o=us(o).prev;o!==null;){switch(o.type){case rt:a.match.push(a={syntax:o.syntax,match:[]}),s.push(a);break;case to:s.pop(),a=s[s.length-1];break;default:a.match.push({syntax:o.syntax||null,token:o.token.value,node:o.token.node})}o=o.prev}return n}function no(e){function r(o){return o===null?!1:o.type==="Type"||o.type==="Property"||o.type==="Keyword"}function t(o){if(Array.isArray(o.match)){for(let a=0;a<o.match.length;a++)if(t(o.match[a]))return r(o.syntax)&&n.unshift(o.syntax),!0}else if(o.node===e)return n=r(o.syntax)?[o.syntax]:[],!0;return!1}let n=null;return this.matched!==null&&t(this.matched),n}function hs(e,r){return St(this,e,t=>t.type==="Type"&&t.name===r)}function ms(e,r){return St(this,e,t=>t.type==="Property"&&t.name===r)}function fs(e){return St(this,e,r=>r.type==="Keyword")}function St(e,r,t){const n=no.call(e,r);return n===null?!1:n.some(t)}const gs=Object.freeze(Object.defineProperty({__proto__:null,getTrace:no,isKeyword:fs,isProperty:ms,isType:hs},Symbol.toStringTag,{value:"Module"}));function oo(e){return"node"in e?e.node:oo(e.match[0])}function ao(e){return"node"in e?e.node:ao(e.match[e.match.length-1])}function pn(e,r,t,n,o){function a(c){if(c.syntax!==null&&c.syntax.type===n&&c.syntax.name===o){const u=oo(c),i=ao(c);e.syntax.walk(r,function(l,p,f){if(l===u){const m=new R;do{if(m.appendData(p.data),p.data===i)break;p=p.next}while(p!==null);s.push({parent:f,nodes:m})}})}Array.isArray(c.match)&&c.match.forEach(a)}const s=[];return t.matched!==null&&a(t.matched),s}const{hasOwnProperty:qe}=Object.prototype;function qr(e){return typeof e=="number"&&isFinite(e)&&Math.floor(e)===e&&e>=0}function dn(e){return!!e&&qr(e.offset)&&qr(e.line)&&qr(e.column)}function ys(e,r){return function(n,o){if(!n||n.constructor!==Object)return o(n,"Type of node should be an Object");for(let a in n){let s=!0;if(qe.call(n,a)!==!1){if(a==="type")n.type!==e&&o(n,"Wrong node type `"+n.type+"`, expected `"+e+"`");else if(a==="loc"){if(n.loc===null)continue;if(n.loc&&n.loc.constructor===Object)if(typeof n.loc.source!="string")a+=".source";else if(!dn(n.loc.start))a+=".start";else if(!dn(n.loc.end))a+=".end";else continue;s=!1}else if(r.hasOwnProperty(a)){s=!1;for(let c=0;!s&&c<r[a].length;c++){const u=r[a][c];switch(u){case String:s=typeof n[a]=="string";break;case Boolean:s=typeof n[a]=="boolean";break;case null:s=n[a]===null;break;default:typeof u=="string"?s=n[a]&&n[a].type===u:Array.isArray(u)&&(s=n[a]instanceof R)}}}else o(n,"Unknown field `"+a+"` for "+e+" node type");s||o(n,"Bad value for `"+e+"."+a+"`")}}for(const a in r)qe.call(r,a)&&qe.call(n,a)===!1&&o(n,"Field `"+e+"."+a+"` is missed")}}function bs(e,r){const t=r.structure,n={type:String,loc:!0},o={type:'"'+e+'"'};for(const a in t){if(qe.call(t,a)===!1)continue;const s=[],c=n[a]=Array.isArray(t[a])?t[a].slice():[t[a]];for(let u=0;u<c.length;u++){const i=c[u];if(i===String||i===Boolean)s.push(i.name);else if(i===null)s.push("null");else if(typeof i=="string")s.push("<"+i+">");else if(Array.isArray(i))s.push("List");else throw new Error("Wrong value `"+i+"` in `"+e+"."+a+"` structure definition")}o[a]=s.join(" | ")}return{docs:o,check:ys(e,n)}}function vs(e){const r={};if(e.node){for(const t in e.node)if(qe.call(e.node,t)){const n=e.node[t];if(n.structure)r[t]=bs(t,n);else throw new Error("Missed `structure` field in `"+t+"` node type definition")}}return r}const xs=et(qn.join(" | "));function tt(e,r,t){const n={};for(const o in e)e[o].syntax&&(n[o]=t?e[o].syntax:ht(e[o].syntax,{compact:r}));return n}function ks(e,r,t){const n={};for(const[o,a]of Object.entries(e))n[o]={prelude:a.prelude&&(t?a.prelude.syntax:ht(a.prelude.syntax,{compact:r})),descriptors:a.descriptors&&tt(a.descriptors,r,t)};return n}function ws(e){for(let r=0;r<e.length;r++)if(e[r].value.toLowerCase()==="var(")return!0;return!1}function ae(e,r,t){return{matched:e,iterations:t,error:r,...gs}}function Te(e,r,t,n){const o=ts(t,e.syntax);let a;return ws(o)?ae(null,new Error("Matching for a tree with var() is not supported")):(n&&(a=un(o,e.cssWideKeywordsSyntax,e)),(!n||!a.match)&&(a=un(o,r.match,e),!a.match)?ae(null,new Za(a.reason,r.syntax,t,a),a.iterations):ae(a.match,null,a.iterations))}class hn{constructor(r,t,n){if(this.cssWideKeywordsSyntax=xs,this.syntax=t,this.generic=!1,this.units={...Kt},this.atrules=Object.create(null),this.properties=Object.create(null),this.types=Object.create(null),this.structure=n||vs(r),r){if(r.units)for(const o of Object.keys(Kt))Array.isArray(r.units[o])&&(this.units[o]=r.units[o]);if(r.types)for(const o in r.types)this.addType_(o,r.types[o]);if(r.generic){this.generic=!0;for(const[o,a]of Object.entries(ki(this.units)))this.addType_(o,a)}if(r.atrules)for(const o in r.atrules)this.addAtrule_(o,r.atrules[o]);if(r.properties)for(const o in r.properties)this.addProperty_(o,r.properties[o])}}checkStructure(r){function t(a,s){o.push({node:a,message:s})}const n=this.structure,o=[];return this.syntax.walk(r,function(a){n.hasOwnProperty(a.type)?n[a.type].check(a,t):t(a,"Unknown node type `"+a.type+"`")}),o.length?o:!1}createDescriptor(r,t,n,o=null){const a={type:t,name:n},s={type:t,name:n,parent:o,serializable:typeof r=="string"||r&&typeof r.type=="string",syntax:null,match:null};return typeof r=="function"?s.match=et(r,a):(typeof r=="string"?Object.defineProperty(s,"syntax",{get(){return Object.defineProperty(s,"syntax",{value:eo(r)}),s.syntax}}):s.syntax=r,Object.defineProperty(s,"match",{get(){return Object.defineProperty(s,"match",{value:et(s.syntax,a)}),s.match}})),s}addAtrule_(r,t){t&&(this.atrules[r]={type:"Atrule",name:r,prelude:t.prelude?this.createDescriptor(t.prelude,"AtrulePrelude",r):null,descriptors:t.descriptors?Object.keys(t.descriptors).reduce((n,o)=>(n[o]=this.createDescriptor(t.descriptors[o],"AtruleDescriptor",o,r),n),Object.create(null)):null})}addProperty_(r,t){t&&(this.properties[r]=this.createDescriptor(t,"Property",r))}addType_(r,t){t&&(this.types[r]=this.createDescriptor(t,"Type",r))}checkAtruleName(r){if(!this.getAtrule(r))return new Ie("Unknown at-rule","@"+r)}checkAtrulePrelude(r,t){const n=this.checkAtruleName(r);if(n)return n;const o=this.getAtrule(r);if(!o.prelude&&t)return new SyntaxError("At-rule `@"+r+"` should not contain a prelude");if(o.prelude&&!t&&!Te(this,o.prelude,"",!1).matched)return new SyntaxError("At-rule `@"+r+"` should contain a prelude")}checkAtruleDescriptorName(r,t){const n=this.checkAtruleName(r);if(n)return n;const o=this.getAtrule(r),a=Dr(t);if(!o.descriptors)return new SyntaxError("At-rule `@"+r+"` has no known descriptors");if(!o.descriptors[a.name]&&!o.descriptors[a.basename])return new Ie("Unknown at-rule descriptor",t)}checkPropertyName(r){if(!this.getProperty(r))return new Ie("Unknown property",r)}matchAtrulePrelude(r,t){const n=this.checkAtrulePrelude(r,t);if(n)return ae(null,n);const o=this.getAtrule(r);return o.prelude?Te(this,o.prelude,t||"",!1):ae(null,null)}matchAtruleDescriptor(r,t,n){const o=this.checkAtruleDescriptorName(r,t);if(o)return ae(null,o);const a=this.getAtrule(r),s=Dr(t);return Te(this,a.descriptors[s.name]||a.descriptors[s.basename],n,!1)}matchDeclaration(r){return r.type!=="Declaration"?ae(null,new Error("Not a Declaration node")):this.matchProperty(r.property,r.value)}matchProperty(r,t){if(Vt(r).custom)return ae(null,new Error("Lexer matching doesn't applicable for custom properties"));const n=this.checkPropertyName(r);return n?ae(null,n):Te(this,this.getProperty(r),t,!0)}matchType(r,t){const n=this.getType(r);return n?Te(this,n,t,!1):ae(null,new Ie("Unknown type",r))}match(r,t){return typeof r!="string"&&(!r||!r.type)?ae(null,new Ie("Bad syntax")):((typeof r=="string"||!r.match)&&(r=this.createDescriptor(r,"Type","anonymous")),Te(this,r,t,!1))}findValueFragments(r,t,n,o){return pn(this,t,this.matchProperty(r,t),n,o)}findDeclarationValueFragments(r,t,n){return pn(this,r.value,this.matchDeclaration(r),t,n)}findAllFragments(r,t,n){const o=[];return this.syntax.walk(r,{visit:"Declaration",enter:a=>{o.push.apply(o,this.findDeclarationValueFragments(a,t,n))}}),o}getAtrule(r,t=!0){const n=Dr(r);return(n.vendor&&t?this.atrules[n.name]||this.atrules[n.basename]:this.atrules[n.name])||null}getAtrulePrelude(r,t=!0){const n=this.getAtrule(r,t);return n&&n.prelude||null}getAtruleDescriptor(r,t){return this.atrules.hasOwnProperty(r)&&this.atrules.declarators&&this.atrules[r].declarators[t]||null}getProperty(r,t=!0){const n=Vt(r);return(n.vendor&&t?this.properties[n.name]||this.properties[n.basename]:this.properties[n.name])||null}getType(r){return hasOwnProperty.call(this.types,r)?this.types[r]:null}validate(){function r(o,a,s,c){if(s.has(a))return s.get(a);s.set(a,!1),c.syntax!==null&&Ji(c.syntax,function(u){if(u.type!=="Type"&&u.type!=="Property")return;const i=u.type==="Type"?o.types:o.properties,l=u.type==="Type"?t:n;(!hasOwnProperty.call(i,u.name)||r(o,u.name,l,i[u.name]))&&s.set(a,!0)},this)}let t=new Map,n=new Map;for(const o in this.types)r(this,o,t,this.types[o]);for(const o in this.properties)r(this,o,n,this.properties[o]);return t=[...t.keys()].filter(o=>t.get(o)),n=[...n.keys()].filter(o=>n.get(o)),t.length||n.length?{types:t,properties:n}:null}dump(r,t){return{generic:this.generic,units:this.units,types:tt(this.types,!t,r),properties:tt(this.properties,!t,r),atrules:ks(this.atrules,!t,r)}}toString(){return JSON.stringify(this.dump())}}function Ur(e,r){return typeof r=="string"&&/^\s*\|/.test(r)?typeof e=="string"?e+r:r.replace(/^\s*\|\s*/,""):r||null}function mn(e,r){const t=Object.create(null);for(const[n,o]of Object.entries(e))if(o){t[n]={};for(const a of Object.keys(o))r.includes(a)&&(t[n][a]=o[a])}return t}function nt(e,r){const t={...e};for(const[n,o]of Object.entries(r))switch(n){case"generic":t[n]=!!o;break;case"units":t[n]={...e[n]};for(const[a,s]of Object.entries(o))t[n][a]=Array.isArray(s)?s:[];break;case"atrules":t[n]={...e[n]};for(const[a,s]of Object.entries(o)){const c=t[n][a]||{},u=t[n][a]={prelude:c.prelude||null,descriptors:{...c.descriptors}};if(s){u.prelude=s.prelude?Ur(u.prelude,s.prelude):u.prelude||null;for(const[i,l]of Object.entries(s.descriptors||{}))u.descriptors[i]=l?Ur(u.descriptors[i],l):null;Object.keys(u.descriptors).length||(u.descriptors=null)}}break;case"types":case"properties":t[n]={...e[n]};for(const[a,s]of Object.entries(o))t[n][a]=Ur(t[n][a],s);break;case"scope":t[n]={...e[n]};for(const[a,s]of Object.entries(o))t[n][a]={...t[n][a],...s};break;case"parseContext":t[n]={...e[n],...o};break;case"atrule":case"pseudo":t[n]={...e[n],...mn(o,["parse"])};break;case"node":t[n]={...e[n],...mn(o,["name","structure","parse","generate","walkContext"])};break}return t}function io(e){const r=Oa(e),t=Wa(e),n=qa(e),{fromPlainObject:o,toPlainObject:a}=Ua(t),s={lexer:null,createLexer:c=>new hn(c,s,s.lexer.structure),tokenize:xr,parse:r,generate:n,walk:t,find:t.find,findLast:t.findLast,findAll:t.findAll,fromPlainObject:o,toPlainObject:a,fork(c){const u=nt({},e);return io(typeof c=="function"?c(u,Object.assign):nt(u,c))}};return s.lexer=new hn({generic:!0,units:e.units,types:e.types,atrules:e.atrules,properties:e.properties,node:e.node},s),s}const Ss=e=>io(nt({},e)),Cs={generic:!0,units:{angle:["deg","grad","rad","turn"],decibel:["db"],flex:["fr"],frequency:["hz","khz"],length:["cm","mm","q","in","pt","pc","px","em","rem","ex","rex","cap","rcap","ch","rch","ic","ric","lh","rlh","vw","svw","lvw","dvw","vh","svh","lvh","dvh","vi","svi","lvi","dvi","vb","svb","lvb","dvb","vmin","svmin","lvmin","dvmin","vmax","svmax","lvmax","dvmax","cqw","cqh","cqi","cqb","cqmin","cqmax"],resolution:["dpi","dpcm","dppx","x"],semitones:["st"],time:["s","ms"]},types:{"abs()":"abs( <calc-sum> )","absolute-size":"xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large","acos()":"acos( <calc-sum> )","alpha-value":"<number>|<percentage>","angle-percentage":"<angle>|<percentage>","angular-color-hint":"<angle-percentage>","angular-color-stop":"<color>&&<color-stop-angle>?","angular-color-stop-list":"[<angular-color-stop> [, <angular-color-hint>]?]# , <angular-color-stop>","animateable-feature":"scroll-position|contents|<custom-ident>","asin()":"asin( <calc-sum> )","atan()":"atan( <calc-sum> )","atan2()":"atan2( <calc-sum> , <calc-sum> )",attachment:"scroll|fixed|local","attr()":"attr( <attr-name> <type-or-unit>? [, <attr-fallback>]? )","attr-matcher":"['~'|'|'|'^'|'$'|'*']? '='","attr-modifier":"i|s","attribute-selector":"'[' <wq-name> ']'|'[' <wq-name> <attr-matcher> [<string-token>|<ident-token>] <attr-modifier>? ']'","auto-repeat":"repeat( [auto-fill|auto-fit] , [<line-names>? <fixed-size>]+ <line-names>? )","auto-track-list":"[<line-names>? [<fixed-size>|<fixed-repeat>]]* <line-names>? <auto-repeat> [<line-names>? [<fixed-size>|<fixed-repeat>]]* <line-names>?",axis:"block|inline|vertical|horizontal","baseline-position":"[first|last]? baseline","basic-shape":"<inset()>|<circle()>|<ellipse()>|<polygon()>|<path()>","bg-image":"none|<image>","bg-layer":"<bg-image>||<bg-position> [/ <bg-size>]?||<repeat-style>||<attachment>||<box>||<box>","bg-position":"[[left|center|right|top|bottom|<length-percentage>]|[left|center|right|<length-percentage>] [top|center|bottom|<length-percentage>]|[center|[left|right] <length-percentage>?]&&[center|[top|bottom] <length-percentage>?]]","bg-size":"[<length-percentage>|auto]{1,2}|cover|contain","blur()":"blur( <length> )","blend-mode":"normal|multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity",box:"border-box|padding-box|content-box","brightness()":"brightness( <number-percentage> )","calc()":"calc( <calc-sum> )","calc-sum":"<calc-product> [['+'|'-'] <calc-product>]*","calc-product":"<calc-value> ['*' <calc-value>|'/' <number>]*","calc-value":"<number>|<dimension>|<percentage>|<calc-constant>|( <calc-sum> )","calc-constant":"e|pi|infinity|-infinity|NaN","cf-final-image":"<image>|<color>","cf-mixing-image":"<percentage>?&&<image>","circle()":"circle( [<shape-radius>]? [at <position>]? )","clamp()":"clamp( <calc-sum>#{3} )","class-selector":"'.' <ident-token>","clip-source":"<url>",color:"<rgb()>|<rgba()>|<hsl()>|<hsla()>|<hwb()>|<lab()>|<lch()>|<hex-color>|<named-color>|currentcolor|<deprecated-system-color>","color-stop":"<color-stop-length>|<color-stop-angle>","color-stop-angle":"<angle-percentage>{1,2}","color-stop-length":"<length-percentage>{1,2}","color-stop-list":"[<linear-color-stop> [, <linear-color-hint>]?]# , <linear-color-stop>",combinator:"'>'|'+'|'~'|['||']","common-lig-values":"[common-ligatures|no-common-ligatures]","compat-auto":"searchfield|textarea|push-button|slider-horizontal|checkbox|radio|square-button|menulist|listbox|meter|progress-bar|button","composite-style":"clear|copy|source-over|source-in|source-out|source-atop|destination-over|destination-in|destination-out|destination-atop|xor","compositing-operator":"add|subtract|intersect|exclude","compound-selector":"[<type-selector>? <subclass-selector>* [<pseudo-element-selector> <pseudo-class-selector>*]*]!","compound-selector-list":"<compound-selector>#","complex-selector":"<compound-selector> [<combinator>? <compound-selector>]*","complex-selector-list":"<complex-selector>#","conic-gradient()":"conic-gradient( [from <angle>]? [at <position>]? , <angular-color-stop-list> )","contextual-alt-values":"[contextual|no-contextual]","content-distribution":"space-between|space-around|space-evenly|stretch","content-list":"[<string>|contents|<image>|<counter>|<quote>|<target>|<leader()>|<attr()>]+","content-position":"center|start|end|flex-start|flex-end","content-replacement":"<image>","contrast()":"contrast( [<number-percentage>] )","cos()":"cos( <calc-sum> )",counter:"<counter()>|<counters()>","counter()":"counter( <counter-name> , <counter-style>? )","counter-name":"<custom-ident>","counter-style":"<counter-style-name>|symbols( )","counter-style-name":"<custom-ident>","counters()":"counters( <counter-name> , <string> , <counter-style>? )","cross-fade()":"cross-fade( <cf-mixing-image> , <cf-final-image>? )","cubic-bezier-timing-function":"ease|ease-in|ease-out|ease-in-out|cubic-bezier( <number [0,1]> , <number> , <number [0,1]> , <number> )","deprecated-system-color":"ActiveBorder|ActiveCaption|AppWorkspace|Background|ButtonFace|ButtonHighlight|ButtonShadow|ButtonText|CaptionText|GrayText|Highlight|HighlightText|InactiveBorder|InactiveCaption|InactiveCaptionText|InfoBackground|InfoText|Menu|MenuText|Scrollbar|ThreeDDarkShadow|ThreeDFace|ThreeDHighlight|ThreeDLightShadow|ThreeDShadow|Window|WindowFrame|WindowText","discretionary-lig-values":"[discretionary-ligatures|no-discretionary-ligatures]","display-box":"contents|none","display-inside":"flow|flow-root|table|flex|grid|ruby","display-internal":"table-row-group|table-header-group|table-footer-group|table-row|table-cell|table-column-group|table-column|table-caption|ruby-base|ruby-text|ruby-base-container|ruby-text-container","display-legacy":"inline-block|inline-list-item|inline-table|inline-flex|inline-grid","display-listitem":"<display-outside>?&&[flow|flow-root]?&&list-item","display-outside":"block|inline|run-in","drop-shadow()":"drop-shadow( <length>{2,3} <color>? )","east-asian-variant-values":"[jis78|jis83|jis90|jis04|simplified|traditional]","east-asian-width-values":"[full-width|proportional-width]","element()":"element( <custom-ident> , [first|start|last|first-except]? )|element( <id-selector> )","ellipse()":"ellipse( [<shape-radius>{2}]? [at <position>]? )","ending-shape":"circle|ellipse","env()":"env( <custom-ident> , <declaration-value>? )","exp()":"exp( <calc-sum> )","explicit-track-list":"[<line-names>? <track-size>]+ <line-names>?","family-name":"<string>|<custom-ident>+","feature-tag-value":"<string> [<integer>|on|off]?","feature-type":"@stylistic|@historical-forms|@styleset|@character-variant|@swash|@ornaments|@annotation","feature-value-block":"<feature-type> '{' <feature-value-declaration-list> '}'","feature-value-block-list":"<feature-value-block>+","feature-value-declaration":"<custom-ident> : <integer>+ ;","feature-value-declaration-list":"<feature-value-declaration>","feature-value-name":"<custom-ident>","fill-rule":"nonzero|evenodd","filter-function":"<blur()>|<brightness()>|<contrast()>|<drop-shadow()>|<grayscale()>|<hue-rotate()>|<invert()>|<opacity()>|<saturate()>|<sepia()>","filter-function-list":"[<filter-function>|<url>]+","final-bg-layer":"<'background-color'>||<bg-image>||<bg-position> [/ <bg-size>]?||<repeat-style>||<attachment>||<box>||<box>","fixed-breadth":"<length-percentage>","fixed-repeat":"repeat( [<integer [1,∞]>] , [<line-names>? <fixed-size>]+ <line-names>? )","fixed-size":"<fixed-breadth>|minmax( <fixed-breadth> , <track-breadth> )|minmax( <inflexible-breadth> , <fixed-breadth> )","font-stretch-absolute":"normal|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded|<percentage>","font-variant-css21":"[normal|small-caps]","font-weight-absolute":"normal|bold|<number [1,1000]>","frequency-percentage":"<frequency>|<percentage>","general-enclosed":"[<function-token> <any-value> )]|( <ident> <any-value> )","generic-family":"serif|sans-serif|cursive|fantasy|monospace|-apple-system","generic-name":"serif|sans-serif|cursive|fantasy|monospace","geometry-box":"<shape-box>|fill-box|stroke-box|view-box",gradient:"<linear-gradient()>|<repeating-linear-gradient()>|<radial-gradient()>|<repeating-radial-gradient()>|<conic-gradient()>|<repeating-conic-gradient()>|<-legacy-gradient>","grayscale()":"grayscale( <number-percentage> )","grid-line":"auto|<custom-ident>|[<integer>&&<custom-ident>?]|[span&&[<integer>||<custom-ident>]]","historical-lig-values":"[historical-ligatures|no-historical-ligatures]","hsl()":"hsl( <hue> <percentage> <percentage> [/ <alpha-value>]? )|hsl( <hue> , <percentage> , <percentage> , <alpha-value>? )","hsla()":"hsla( <hue> <percentage> <percentage> [/ <alpha-value>]? )|hsla( <hue> , <percentage> , <percentage> , <alpha-value>? )",hue:"<number>|<angle>","hue-rotate()":"hue-rotate( <angle> )","hwb()":"hwb( [<hue>|none] [<percentage>|none] [<percentage>|none] [/ [<alpha-value>|none]]? )","hypot()":"hypot( <calc-sum># )",image:"<url>|<image()>|<image-set()>|<element()>|<paint()>|<cross-fade()>|<gradient>","image()":"image( <image-tags>? [<image-src>? , <color>?]! )","image-set()":"image-set( <image-set-option># )","image-set-option":"[<image>|<string>] [<resolution>||type( <string> )]","image-src":"<url>|<string>","image-tags":"ltr|rtl","inflexible-breadth":"<length-percentage>|min-content|max-content|auto","inset()":"inset( <length-percentage>{1,4} [round <'border-radius'>]? )","invert()":"invert( <number-percentage> )","keyframes-name":"<custom-ident>|<string>","keyframe-block":"<keyframe-selector># { <declaration-list> }","keyframe-block-list":"<keyframe-block>+","keyframe-selector":"from|to|<percentage>","lab()":"lab( [<percentage>|<number>|none] [<percentage>|<number>|none] [<percentage>|<number>|none] [/ [<alpha-value>|none]]? )","layer()":"layer( <layer-name> )","layer-name":"<ident> ['.' <ident>]*","lch()":"lch( [<percentage>|<number>|none] [<percentage>|<number>|none] [<hue>|none] [/ [<alpha-value>|none]]? )","leader()":"leader( <leader-type> )","leader-type":"dotted|solid|space|<string>","length-percentage":"<length>|<percentage>","line-names":"'[' <custom-ident>* ']'","line-name-list":"[<line-names>|<name-repeat>]+","line-style":"none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset","line-width":"<length>|thin|medium|thick","linear-color-hint":"<length-percentage>","linear-color-stop":"<color> <color-stop-length>?","linear-gradient()":"linear-gradient( [<angle>|to <side-or-corner>]? , <color-stop-list> )","log()":"log( <calc-sum> , <calc-sum>? )","mask-layer":"<mask-reference>||<position> [/ <bg-size>]?||<repeat-style>||<geometry-box>||[<geometry-box>|no-clip]||<compositing-operator>||<masking-mode>","mask-position":"[<length-percentage>|left|center|right] [<length-percentage>|top|center|bottom]?","mask-reference":"none|<image>|<mask-source>","mask-source":"<url>","masking-mode":"alpha|luminance|match-source","matrix()":"matrix( <number>#{6} )","matrix3d()":"matrix3d( <number>#{16} )","max()":"max( <calc-sum># )","media-and":"<media-in-parens> [and <media-in-parens>]+","media-condition":"<media-not>|<media-and>|<media-or>|<media-in-parens>","media-condition-without-or":"<media-not>|<media-and>|<media-in-parens>","media-feature":"( [<mf-plain>|<mf-boolean>|<mf-range>] )","media-in-parens":"( <media-condition> )|<media-feature>|<general-enclosed>","media-not":"not <media-in-parens>","media-or":"<media-in-parens> [or <media-in-parens>]+","media-query":"<media-condition>|[not|only]? <media-type> [and <media-condition-without-or>]?","media-query-list":"<media-query>#","media-type":"<ident>","mf-boolean":"<mf-name>","mf-name":"<ident>","mf-plain":"<mf-name> : <mf-value>","mf-range":"<mf-name> ['<'|'>']? '='? <mf-value>|<mf-value> ['<'|'>']? '='? <mf-name>|<mf-value> '<' '='? <mf-name> '<' '='? <mf-value>|<mf-value> '>' '='? <mf-name> '>' '='? <mf-value>","mf-value":"<number>|<dimension>|<ident>|<ratio>","min()":"min( <calc-sum># )","minmax()":"minmax( [<length-percentage>|min-content|max-content|auto] , [<length-percentage>|<flex>|min-content|max-content|auto] )","mod()":"mod( <calc-sum> , <calc-sum> )","name-repeat":"repeat( [<integer [1,∞]>|auto-fill] , <line-names>+ )","named-color":"transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen|<-non-standard-color>","namespace-prefix":"<ident>","ns-prefix":"[<ident-token>|'*']? '|'","number-percentage":"<number>|<percentage>","numeric-figure-values":"[lining-nums|oldstyle-nums]","numeric-fraction-values":"[diagonal-fractions|stacked-fractions]","numeric-spacing-values":"[proportional-nums|tabular-nums]",nth:"<an-plus-b>|even|odd","opacity()":"opacity( [<number-percentage>] )","overflow-position":"unsafe|safe","outline-radius":"<length>|<percentage>","page-body":"<declaration>? [; <page-body>]?|<page-margin-box> <page-body>","page-margin-box":"<page-margin-box-type> '{' <declaration-list> '}'","page-margin-box-type":"@top-left-corner|@top-left|@top-center|@top-right|@top-right-corner|@bottom-left-corner|@bottom-left|@bottom-center|@bottom-right|@bottom-right-corner|@left-top|@left-middle|@left-bottom|@right-top|@right-middle|@right-bottom","page-selector-list":"[<page-selector>#]?","page-selector":"<pseudo-page>+|<ident> <pseudo-page>*","page-size":"A5|A4|A3|B5|B4|JIS-B5|JIS-B4|letter|legal|ledger","path()":"path( [<fill-rule> ,]? <string> )","paint()":"paint( <ident> , <declaration-value>? )","perspective()":"perspective( [<length [0,∞]>|none] )","polygon()":"polygon( <fill-rule>? , [<length-percentage> <length-percentage>]# )",position:"[[left|center|right]||[top|center|bottom]|[left|center|right|<length-percentage>] [top|center|bottom|<length-percentage>]?|[[left|right] <length-percentage>]&&[[top|bottom] <length-percentage>]]","pow()":"pow( <calc-sum> , <calc-sum> )","pseudo-class-selector":"':' <ident-token>|':' <function-token> <any-value> ')'","pseudo-element-selector":"':' <pseudo-class-selector>","pseudo-page":": [left|right|first|blank]",quote:"open-quote|close-quote|no-open-quote|no-close-quote","radial-gradient()":"radial-gradient( [<ending-shape>||<size>]? [at <position>]? , <color-stop-list> )",ratio:"<number [0,∞]> [/ <number [0,∞]>]?","relative-selector":"<combinator>? <complex-selector>","relative-selector-list":"<relative-selector>#","relative-size":"larger|smaller","rem()":"rem( <calc-sum> , <calc-sum> )","repeat-style":"repeat-x|repeat-y|[repeat|space|round|no-repeat]{1,2}","repeating-conic-gradient()":"repeating-conic-gradient( [from <angle>]? [at <position>]? , <angular-color-stop-list> )","repeating-linear-gradient()":"repeating-linear-gradient( [<angle>|to <side-or-corner>]? , <color-stop-list> )","repeating-radial-gradient()":"repeating-radial-gradient( [<ending-shape>||<size>]? [at <position>]? , <color-stop-list> )","reversed-counter-name":"reversed( <counter-name> )","rgb()":"rgb( <percentage>{3} [/ <alpha-value>]? )|rgb( <number>{3} [/ <alpha-value>]? )|rgb( <percentage>#{3} , <alpha-value>? )|rgb( <number>#{3} , <alpha-value>? )","rgba()":"rgba( <percentage>{3} [/ <alpha-value>]? )|rgba( <number>{3} [/ <alpha-value>]? )|rgba( <percentage>#{3} , <alpha-value>? )|rgba( <number>#{3} , <alpha-value>? )","rotate()":"rotate( [<angle>|<zero>] )","rotate3d()":"rotate3d( <number> , <number> , <number> , [<angle>|<zero>] )","rotateX()":"rotateX( [<angle>|<zero>] )","rotateY()":"rotateY( [<angle>|<zero>] )","rotateZ()":"rotateZ( [<angle>|<zero>] )","round()":"round( <rounding-strategy>? , <calc-sum> , <calc-sum> )","rounding-strategy":"nearest|up|down|to-zero","saturate()":"saturate( <number-percentage> )","scale()":"scale( [<number>|<percentage>]#{1,2} )","scale3d()":"scale3d( [<number>|<percentage>]#{3} )","scaleX()":"scaleX( [<number>|<percentage>] )","scaleY()":"scaleY( [<number>|<percentage>] )","scaleZ()":"scaleZ( [<number>|<percentage>] )",scroller:"root|nearest","self-position":"center|start|end|self-start|self-end|flex-start|flex-end","shape-radius":"<length-percentage>|closest-side|farthest-side","sign()":"sign( <calc-sum> )","skew()":"skew( [<angle>|<zero>] , [<angle>|<zero>]? )","skewX()":"skewX( [<angle>|<zero>] )","skewY()":"skewY( [<angle>|<zero>] )","sepia()":"sepia( <number-percentage> )",shadow:"inset?&&<length>{2,4}&&<color>?","shadow-t":"[<length>{2,3}&&<color>?]",shape:"rect( <top> , <right> , <bottom> , <left> )|rect( <top> <right> <bottom> <left> )","shape-box":"<box>|margin-box","side-or-corner":"[left|right]||[top|bottom]","sin()":"sin( <calc-sum> )","single-animation":"<time>||<easing-function>||<time>||<single-animation-iteration-count>||<single-animation-direction>||<single-animation-fill-mode>||<single-animation-play-state>||[none|<keyframes-name>]","single-animation-direction":"normal|reverse|alternate|alternate-reverse","single-animation-fill-mode":"none|forwards|backwards|both","single-animation-iteration-count":"infinite|<number>","single-animation-play-state":"running|paused","single-animation-timeline":"auto|none|<timeline-name>|scroll( <axis>? <scroller>? )","single-transition":"[none|<single-transition-property>]||<time>||<easing-function>||<time>","single-transition-property":"all|<custom-ident>",size:"closest-side|farthest-side|closest-corner|farthest-corner|<length>|<length-percentage>{2}","sqrt()":"sqrt( <calc-sum> )","step-position":"jump-start|jump-end|jump-none|jump-both|start|end","step-timing-function":"step-start|step-end|steps( <integer> [, <step-position>]? )","subclass-selector":"<id-selector>|<class-selector>|<attribute-selector>|<pseudo-class-selector>","supports-condition":"not <supports-in-parens>|<supports-in-parens> [and <supports-in-parens>]*|<supports-in-parens> [or <supports-in-parens>]*","supports-in-parens":"( <supports-condition> )|<supports-feature>|<general-enclosed>","supports-feature":"<supports-decl>|<supports-selector-fn>","supports-decl":"( <declaration> )","supports-selector-fn":"selector( <complex-selector> )",symbol:"<string>|<image>|<custom-ident>","tan()":"tan( <calc-sum> )",target:"<target-counter()>|<target-counters()>|<target-text()>","target-counter()":"target-counter( [<string>|<url>] , <custom-ident> , <counter-style>? )","target-counters()":"target-counters( [<string>|<url>] , <custom-ident> , <string> , <counter-style>? )","target-text()":"target-text( [<string>|<url>] , [content|before|after|first-letter]? )","time-percentage":"<time>|<percentage>","timeline-name":"<custom-ident>|<string>","easing-function":"linear|<cubic-bezier-timing-function>|<step-timing-function>","track-breadth":"<length-percentage>|<flex>|min-content|max-content|auto","track-list":"[<line-names>? [<track-size>|<track-repeat>]]+ <line-names>?","track-repeat":"repeat( [<integer [1,∞]>] , [<line-names>? <track-size>]+ <line-names>? )","track-size":"<track-breadth>|minmax( <inflexible-breadth> , <track-breadth> )|fit-content( <length-percentage> )","transform-function":"<matrix()>|<translate()>|<translateX()>|<translateY()>|<scale()>|<scaleX()>|<scaleY()>|<rotate()>|<skew()>|<skewX()>|<skewY()>|<matrix3d()>|<translate3d()>|<translateZ()>|<scale3d()>|<scaleZ()>|<rotate3d()>|<rotateX()>|<rotateY()>|<rotateZ()>|<perspective()>","transform-list":"<transform-function>+","translate()":"translate( <length-percentage> , <length-percentage>? )","translate3d()":"translate3d( <length-percentage> , <length-percentage> , <length> )","translateX()":"translateX( <length-percentage> )","translateY()":"translateY( <length-percentage> )","translateZ()":"translateZ( <length> )","type-or-unit":"string|color|url|integer|number|length|angle|time|frequency|cap|ch|em|ex|ic|lh|rlh|rem|vb|vi|vw|vh|vmin|vmax|mm|Q|cm|in|pt|pc|px|deg|grad|rad|turn|ms|s|Hz|kHz|%","type-selector":"<wq-name>|<ns-prefix>? '*'","var()":"var( <custom-property-name> , <declaration-value>? )","viewport-length":"auto|<length-percentage>","visual-box":"content-box|padding-box|border-box","wq-name":"<ns-prefix>? <ident-token>","-legacy-gradient":"<-webkit-gradient()>|<-legacy-linear-gradient>|<-legacy-repeating-linear-gradient>|<-legacy-radial-gradient>|<-legacy-repeating-radial-gradient>","-legacy-linear-gradient":"-moz-linear-gradient( <-legacy-linear-gradient-arguments> )|-webkit-linear-gradient( <-legacy-linear-gradient-arguments> )|-o-linear-gradient( <-legacy-linear-gradient-arguments> )","-legacy-repeating-linear-gradient":"-moz-repeating-linear-gradient( <-legacy-linear-gradient-arguments> )|-webkit-repeating-linear-gradient( <-legacy-linear-gradient-arguments> )|-o-repeating-linear-gradient( <-legacy-linear-gradient-arguments> )","-legacy-linear-gradient-arguments":"[<angle>|<side-or-corner>]? , <color-stop-list>","-legacy-radial-gradient":"-moz-radial-gradient( <-legacy-radial-gradient-arguments> )|-webkit-radial-gradient( <-legacy-radial-gradient-arguments> )|-o-radial-gradient( <-legacy-radial-gradient-arguments> )","-legacy-repeating-radial-gradient":"-moz-repeating-radial-gradient( <-legacy-radial-gradient-arguments> )|-webkit-repeating-radial-gradient( <-legacy-radial-gradient-arguments> )|-o-repeating-radial-gradient( <-legacy-radial-gradient-arguments> )","-legacy-radial-gradient-arguments":"[<position> ,]? [[[<-legacy-radial-gradient-shape>||<-legacy-radial-gradient-size>]|[<length>|<percentage>]{2}] ,]? <color-stop-list>","-legacy-radial-gradient-size":"closest-side|closest-corner|farthest-side|farthest-corner|contain|cover","-legacy-radial-gradient-shape":"circle|ellipse","-non-standard-font":"-apple-system-body|-apple-system-headline|-apple-system-subheadline|-apple-system-caption1|-apple-system-caption2|-apple-system-footnote|-apple-system-short-body|-apple-system-short-headline|-apple-system-short-subheadline|-apple-system-short-caption1|-apple-system-short-footnote|-apple-system-tall-body","-non-standard-color":"-moz-ButtonDefault|-moz-ButtonHoverFace|-moz-ButtonHoverText|-moz-CellHighlight|-moz-CellHighlightText|-moz-Combobox|-moz-ComboboxText|-moz-Dialog|-moz-DialogText|-moz-dragtargetzone|-moz-EvenTreeRow|-moz-Field|-moz-FieldText|-moz-html-CellHighlight|-moz-html-CellHighlightText|-moz-mac-accentdarkestshadow|-moz-mac-accentdarkshadow|-moz-mac-accentface|-moz-mac-accentlightesthighlight|-moz-mac-accentlightshadow|-moz-mac-accentregularhighlight|-moz-mac-accentregularshadow|-moz-mac-chrome-active|-moz-mac-chrome-inactive|-moz-mac-focusring|-moz-mac-menuselect|-moz-mac-menushadow|-moz-mac-menutextselect|-moz-MenuHover|-moz-MenuHoverText|-moz-MenuBarText|-moz-MenuBarHoverText|-moz-nativehyperlinktext|-moz-OddTreeRow|-moz-win-communicationstext|-moz-win-mediatext|-moz-activehyperlinktext|-moz-default-background-color|-moz-default-color|-moz-hyperlinktext|-moz-visitedhyperlinktext|-webkit-activelink|-webkit-focus-ring-color|-webkit-link|-webkit-text","-non-standard-image-rendering":"optimize-contrast|-moz-crisp-edges|-o-crisp-edges|-webkit-optimize-contrast","-non-standard-overflow":"-moz-scrollbars-none|-moz-scrollbars-horizontal|-moz-scrollbars-vertical|-moz-hidden-unscrollable","-non-standard-width":"fill-available|min-intrinsic|intrinsic|-moz-available|-moz-fit-content|-moz-min-content|-moz-max-content|-webkit-min-content|-webkit-max-content","-webkit-gradient()":"-webkit-gradient( <-webkit-gradient-type> , <-webkit-gradient-point> [, <-webkit-gradient-point>|, <-webkit-gradient-radius> , <-webkit-gradient-point>] [, <-webkit-gradient-radius>]? [, <-webkit-gradient-color-stop>]* )","-webkit-gradient-color-stop":"from( <color> )|color-stop( [<number-zero-one>|<percentage>] , <color> )|to( <color> )","-webkit-gradient-point":"[left|center|right|<length-percentage>] [top|center|bottom|<length-percentage>]","-webkit-gradient-radius":"<length>|<percentage>","-webkit-gradient-type":"linear|radial","-webkit-mask-box-repeat":"repeat|stretch|round","-webkit-mask-clip-style":"border|border-box|padding|padding-box|content|content-box|text","-ms-filter-function-list":"<-ms-filter-function>+","-ms-filter-function":"<-ms-filter-function-progid>|<-ms-filter-function-legacy>","-ms-filter-function-progid":"'progid:' [<ident-token> '.']* [<ident-token>|<function-token> <any-value>? )]","-ms-filter-function-legacy":"<ident-token>|<function-token> <any-value>? )","-ms-filter":"<string>",age:"child|young|old","attr-name":"<wq-name>","attr-fallback":"<any-value>","bg-clip":"<box>|border|text",bottom:"<length>|auto","generic-voice":"[<age>? <gender> <integer>?]",gender:"male|female|neutral",left:"<length>|auto","mask-image":"<mask-reference>#",paint:"none|<color>|<url> [none|<color>]?|context-fill|context-stroke",right:"<length>|auto","scroll-timeline-axis":"block|inline|vertical|horizontal","scroll-timeline-name":"none|<custom-ident>","single-animation-composition":"replace|add|accumulate","svg-length":"<percentage>|<length>|<number>","svg-writing-mode":"lr-tb|rl-tb|tb-rl|lr|rl|tb",top:"<length>|auto",x:"<number>",y:"<number>",declaration:"<ident-token> : <declaration-value>? ['!' important]?","declaration-list":"[<declaration>? ';']* <declaration>?",url:"url( <string> <url-modifier>* )|<url-token>","url-modifier":"<ident>|<function-token> <any-value> )","number-zero-one":"<number [0,1]>","number-one-or-greater":"<number [1,∞]>","-non-standard-display":"-ms-inline-flexbox|-ms-grid|-ms-inline-grid|-webkit-flex|-webkit-inline-flex|-webkit-box|-webkit-inline-box|-moz-inline-stack|-moz-box|-moz-inline-box"},properties:{"--*":"<declaration-value>","-ms-accelerator":"false|true","-ms-block-progression":"tb|rl|bt|lr","-ms-content-zoom-chaining":"none|chained","-ms-content-zooming":"none|zoom","-ms-content-zoom-limit":"<'-ms-content-zoom-limit-min'> <'-ms-content-zoom-limit-max'>","-ms-content-zoom-limit-max":"<percentage>","-ms-content-zoom-limit-min":"<percentage>","-ms-content-zoom-snap":"<'-ms-content-zoom-snap-type'>||<'-ms-content-zoom-snap-points'>","-ms-content-zoom-snap-points":"snapInterval( <percentage> , <percentage> )|snapList( <percentage># )","-ms-content-zoom-snap-type":"none|proximity|mandatory","-ms-filter":"<string>","-ms-flow-from":"[none|<custom-ident>]#","-ms-flow-into":"[none|<custom-ident>]#","-ms-grid-columns":"none|<track-list>|<auto-track-list>","-ms-grid-rows":"none|<track-list>|<auto-track-list>","-ms-high-contrast-adjust":"auto|none","-ms-hyphenate-limit-chars":"auto|<integer>{1,3}","-ms-hyphenate-limit-lines":"no-limit|<integer>","-ms-hyphenate-limit-zone":"<percentage>|<length>","-ms-ime-align":"auto|after","-ms-overflow-style":"auto|none|scrollbar|-ms-autohiding-scrollbar","-ms-scrollbar-3dlight-color":"<color>","-ms-scrollbar-arrow-color":"<color>","-ms-scrollbar-base-color":"<color>","-ms-scrollbar-darkshadow-color":"<color>","-ms-scrollbar-face-color":"<color>","-ms-scrollbar-highlight-color":"<color>","-ms-scrollbar-shadow-color":"<color>","-ms-scrollbar-track-color":"<color>","-ms-scroll-chaining":"chained|none","-ms-scroll-limit":"<'-ms-scroll-limit-x-min'> <'-ms-scroll-limit-y-min'> <'-ms-scroll-limit-x-max'> <'-ms-scroll-limit-y-max'>","-ms-scroll-limit-x-max":"auto|<length>","-ms-scroll-limit-x-min":"<length>","-ms-scroll-limit-y-max":"auto|<length>","-ms-scroll-limit-y-min":"<length>","-ms-scroll-rails":"none|railed","-ms-scroll-snap-points-x":"snapInterval( <length-percentage> , <length-percentage> )|snapList( <length-percentage># )","-ms-scroll-snap-points-y":"snapInterval( <length-percentage> , <length-percentage> )|snapList( <length-percentage># )","-ms-scroll-snap-type":"none|proximity|mandatory","-ms-scroll-snap-x":"<'-ms-scroll-snap-type'> <'-ms-scroll-snap-points-x'>","-ms-scroll-snap-y":"<'-ms-scroll-snap-type'> <'-ms-scroll-snap-points-y'>","-ms-scroll-translation":"none|vertical-to-horizontal","-ms-text-autospace":"none|ideograph-alpha|ideograph-numeric|ideograph-parenthesis|ideograph-space","-ms-touch-select":"grippers|none","-ms-user-select":"none|element|text","-ms-wrap-flow":"auto|both|start|end|maximum|clear","-ms-wrap-margin":"<length>","-ms-wrap-through":"wrap|none","-moz-appearance":"none|button|button-arrow-down|button-arrow-next|button-arrow-previous|button-arrow-up|button-bevel|button-focus|caret|checkbox|checkbox-container|checkbox-label|checkmenuitem|dualbutton|groupbox|listbox|listitem|menuarrow|menubar|menucheckbox|menuimage|menuitem|menuitemtext|menulist|menulist-button|menulist-text|menulist-textfield|menupopup|menuradio|menuseparator|meterbar|meterchunk|progressbar|progressbar-vertical|progresschunk|progresschunk-vertical|radio|radio-container|radio-label|radiomenuitem|range|range-thumb|resizer|resizerpanel|scale-horizontal|scalethumbend|scalethumb-horizontal|scalethumbstart|scalethumbtick|scalethumb-vertical|scale-vertical|scrollbarbutton-down|scrollbarbutton-left|scrollbarbutton-right|scrollbarbutton-up|scrollbarthumb-horizontal|scrollbarthumb-vertical|scrollbartrack-horizontal|scrollbartrack-vertical|searchfield|separator|sheet|spinner|spinner-downbutton|spinner-textfield|spinner-upbutton|splitter|statusbar|statusbarpanel|tab|tabpanel|tabpanels|tab-scroll-arrow-back|tab-scroll-arrow-forward|textfield|textfield-multiline|toolbar|toolbarbutton|toolbarbutton-dropdown|toolbargripper|toolbox|tooltip|treeheader|treeheadercell|treeheadersortarrow|treeitem|treeline|treetwisty|treetwistyopen|treeview|-moz-mac-unified-toolbar|-moz-win-borderless-glass|-moz-win-browsertabbar-toolbox|-moz-win-communicationstext|-moz-win-communications-toolbox|-moz-win-exclude-glass|-moz-win-glass|-moz-win-mediatext|-moz-win-media-toolbox|-moz-window-button-box|-moz-window-button-box-maximized|-moz-window-button-close|-moz-window-button-maximize|-moz-window-button-minimize|-moz-window-button-restore|-moz-window-frame-bottom|-moz-window-frame-left|-moz-window-frame-right|-moz-window-titlebar|-moz-window-titlebar-maximized","-moz-binding":"<url>|none","-moz-border-bottom-colors":"<color>+|none","-moz-border-left-colors":"<color>+|none","-moz-border-right-colors":"<color>+|none","-moz-border-top-colors":"<color>+|none","-moz-context-properties":"none|[fill|fill-opacity|stroke|stroke-opacity]#","-moz-float-edge":"border-box|content-box|margin-box|padding-box","-moz-force-broken-image-icon":"0|1","-moz-image-region":"<shape>|auto","-moz-orient":"inline|block|horizontal|vertical","-moz-outline-radius":"<outline-radius>{1,4} [/ <outline-radius>{1,4}]?","-moz-outline-radius-bottomleft":"<outline-radius>","-moz-outline-radius-bottomright":"<outline-radius>","-moz-outline-radius-topleft":"<outline-radius>","-moz-outline-radius-topright":"<outline-radius>","-moz-stack-sizing":"ignore|stretch-to-fit","-moz-text-blink":"none|blink","-moz-user-focus":"ignore|normal|select-after|select-before|select-menu|select-same|select-all|none","-moz-user-input":"auto|none|enabled|disabled","-moz-user-modify":"read-only|read-write|write-only","-moz-window-dragging":"drag|no-drag","-moz-window-shadow":"default|menu|tooltip|sheet|none","-webkit-appearance":"none|button|button-bevel|caps-lock-indicator|caret|checkbox|default-button|inner-spin-button|listbox|listitem|media-controls-background|media-controls-fullscreen-background|media-current-time-display|media-enter-fullscreen-button|media-exit-fullscreen-button|media-fullscreen-button|media-mute-button|media-overlay-play-button|media-play-button|media-seek-back-button|media-seek-forward-button|media-slider|media-sliderthumb|media-time-remaining-display|media-toggle-closed-captions-button|media-volume-slider|media-volume-slider-container|media-volume-sliderthumb|menulist|menulist-button|menulist-text|menulist-textfield|meter|progress-bar|progress-bar-value|push-button|radio|scrollbarbutton-down|scrollbarbutton-left|scrollbarbutton-right|scrollbarbutton-up|scrollbargripper-horizontal|scrollbargripper-vertical|scrollbarthumb-horizontal|scrollbarthumb-vertical|scrollbartrack-horizontal|scrollbartrack-vertical|searchfield|searchfield-cancel-button|searchfield-decoration|searchfield-results-button|searchfield-results-decoration|slider-horizontal|slider-vertical|sliderthumb-horizontal|sliderthumb-vertical|square-button|textarea|textfield|-apple-pay-button","-webkit-border-before":"<'border-width'>||<'border-style'>||<color>","-webkit-border-before-color":"<color>","-webkit-border-before-style":"<'border-style'>","-webkit-border-before-width":"<'border-width'>","-webkit-box-reflect":"[above|below|right|left]? <length>? <image>?","-webkit-line-clamp":"none|<integer>","-webkit-mask":"[<mask-reference>||<position> [/ <bg-size>]?||<repeat-style>||[<box>|border|padding|content|text]||[<box>|border|padding|content]]#","-webkit-mask-attachment":"<attachment>#","-webkit-mask-clip":"[<box>|border|padding|content|text]#","-webkit-mask-composite":"<composite-style>#","-webkit-mask-image":"<mask-reference>#","-webkit-mask-origin":"[<box>|border|padding|content]#","-webkit-mask-position":"<position>#","-webkit-mask-position-x":"[<length-percentage>|left|center|right]#","-webkit-mask-position-y":"[<length-percentage>|top|center|bottom]#","-webkit-mask-repeat":"<repeat-style>#","-webkit-mask-repeat-x":"repeat|no-repeat|space|round","-webkit-mask-repeat-y":"repeat|no-repeat|space|round","-webkit-mask-size":"<bg-size>#","-webkit-overflow-scrolling":"auto|touch","-webkit-tap-highlight-color":"<color>","-webkit-text-fill-color":"<color>","-webkit-text-stroke":"<length>||<color>","-webkit-text-stroke-color":"<color>","-webkit-text-stroke-width":"<length>","-webkit-touch-callout":"default|none","-webkit-user-modify":"read-only|read-write|read-write-plaintext-only","accent-color":"auto|<color>","align-content":"normal|<baseline-position>|<content-distribution>|<overflow-position>? <content-position>","align-items":"normal|stretch|<baseline-position>|[<overflow-position>? <self-position>]","align-self":"auto|normal|stretch|<baseline-position>|<overflow-position>? <self-position>","align-tracks":"[normal|<baseline-position>|<content-distribution>|<overflow-position>? <content-position>]#",all:"initial|inherit|unset|revert|revert-layer",animation:"<single-animation>#","animation-composition":"<single-animation-composition>#","animation-delay":"<time>#","animation-direction":"<single-animation-direction>#","animation-duration":"<time>#","animation-fill-mode":"<single-animation-fill-mode>#","animation-iteration-count":"<single-animation-iteration-count>#","animation-name":"[none|<keyframes-name>]#","animation-play-state":"<single-animation-play-state>#","animation-timing-function":"<easing-function>#","animation-timeline":"<single-animation-timeline>#",appearance:"none|auto|textfield|menulist-button|<compat-auto>","aspect-ratio":"auto|<ratio>",azimuth:"<angle>|[[left-side|far-left|left|center-left|center|center-right|right|far-right|right-side]||behind]|leftwards|rightwards","backdrop-filter":"none|<filter-function-list>","backface-visibility":"visible|hidden",background:"[<bg-layer> ,]* <final-bg-layer>","background-attachment":"<attachment>#","background-blend-mode":"<blend-mode>#","background-clip":"<bg-clip>#","background-color":"<color>","background-image":"<bg-image>#","background-origin":"<box>#","background-position":"<bg-position>#","background-position-x":"[center|[[left|right|x-start|x-end]? <length-percentage>?]!]#","background-position-y":"[center|[[top|bottom|y-start|y-end]? <length-percentage>?]!]#","background-repeat":"<repeat-style>#","background-size":"<bg-size>#","block-overflow":"clip|ellipsis|<string>","block-size":"<'width'>",border:"<line-width>||<line-style>||<color>","border-block":"<'border-top-width'>||<'border-top-style'>||<color>","border-block-color":"<'border-top-color'>{1,2}","border-block-style":"<'border-top-style'>","border-block-width":"<'border-top-width'>","border-block-end":"<'border-top-width'>||<'border-top-style'>||<color>","border-block-end-color":"<'border-top-color'>","border-block-end-style":"<'border-top-style'>","border-block-end-width":"<'border-top-width'>","border-block-start":"<'border-top-width'>||<'border-top-style'>||<color>","border-block-start-color":"<'border-top-color'>","border-block-start-style":"<'border-top-style'>","border-block-start-width":"<'border-top-width'>","border-bottom":"<line-width>||<line-style>||<color>","border-bottom-color":"<'border-top-color'>","border-bottom-left-radius":"<length-percentage>{1,2}","border-bottom-right-radius":"<length-percentage>{1,2}","border-bottom-style":"<line-style>","border-bottom-width":"<line-width>","border-collapse":"collapse|separate","border-color":"<color>{1,4}","border-end-end-radius":"<length-percentage>{1,2}","border-end-start-radius":"<length-percentage>{1,2}","border-image":"<'border-image-source'>||<'border-image-slice'> [/ <'border-image-width'>|/ <'border-image-width'>? / <'border-image-outset'>]?||<'border-image-repeat'>","border-image-outset":"[<length>|<number>]{1,4}","border-image-repeat":"[stretch|repeat|round|space]{1,2}","border-image-slice":"<number-percentage>{1,4}&&fill?","border-image-source":"none|<image>","border-image-width":"[<length-percentage>|<number>|auto]{1,4}","border-inline":"<'border-top-width'>||<'border-top-style'>||<color>","border-inline-end":"<'border-top-width'>||<'border-top-style'>||<color>","border-inline-color":"<'border-top-color'>{1,2}","border-inline-style":"<'border-top-style'>","border-inline-width":"<'border-top-width'>","border-inline-end-color":"<'border-top-color'>","border-inline-end-style":"<'border-top-style'>","border-inline-end-width":"<'border-top-width'>","border-inline-start":"<'border-top-width'>||<'border-top-style'>||<color>","border-inline-start-color":"<'border-top-color'>","border-inline-start-style":"<'border-top-style'>","border-inline-start-width":"<'border-top-width'>","border-left":"<line-width>||<line-style>||<color>","border-left-color":"<color>","border-left-style":"<line-style>","border-left-width":"<line-width>","border-radius":"<length-percentage>{1,4} [/ <length-percentage>{1,4}]?","border-right":"<line-width>||<line-style>||<color>","border-right-color":"<color>","border-right-style":"<line-style>","border-right-width":"<line-width>","border-spacing":"<length> <length>?","border-start-end-radius":"<length-percentage>{1,2}","border-start-start-radius":"<length-percentage>{1,2}","border-style":"<line-style>{1,4}","border-top":"<line-width>||<line-style>||<color>","border-top-color":"<color>","border-top-left-radius":"<length-percentage>{1,2}","border-top-right-radius":"<length-percentage>{1,2}","border-top-style":"<line-style>","border-top-width":"<line-width>","border-width":"<line-width>{1,4}",bottom:"<length>|<percentage>|auto","box-align":"start|center|end|baseline|stretch","box-decoration-break":"slice|clone","box-direction":"normal|reverse|inherit","box-flex":"<number>","box-flex-group":"<integer>","box-lines":"single|multiple","box-ordinal-group":"<integer>","box-orient":"horizontal|vertical|inline-axis|block-axis|inherit","box-pack":"start|center|end|justify","box-shadow":"none|<shadow>#","box-sizing":"content-box|border-box","break-after":"auto|avoid|always|all|avoid-page|page|left|right|recto|verso|avoid-column|column|avoid-region|region","break-before":"auto|avoid|always|all|avoid-page|page|left|right|recto|verso|avoid-column|column|avoid-region|region","break-inside":"auto|avoid|avoid-page|avoid-column|avoid-region","caption-side":"top|bottom|block-start|block-end|inline-start|inline-end",caret:"<'caret-color'>||<'caret-shape'>","caret-color":"auto|<color>","caret-shape":"auto|bar|block|underscore",clear:"none|left|right|both|inline-start|inline-end",clip:"<shape>|auto","clip-path":"<clip-source>|[<basic-shape>||<geometry-box>]|none",color:"<color>","print-color-adjust":"economy|exact","color-scheme":"normal|[light|dark|<custom-ident>]+&&only?","column-count":"<integer>|auto","column-fill":"auto|balance|balance-all","column-gap":"normal|<length-percentage>","column-rule":"<'column-rule-width'>||<'column-rule-style'>||<'column-rule-color'>","column-rule-color":"<color>","column-rule-style":"<'border-style'>","column-rule-width":"<'border-width'>","column-span":"none|all","column-width":"<length>|auto",columns:"<'column-width'>||<'column-count'>",contain:"none|strict|content|[[size||inline-size]||layout||style||paint]","contain-intrinsic-size":"[none|<length>|auto <length>]{1,2}","contain-intrinsic-block-size":"none|<length>|auto <length>","contain-intrinsic-height":"none|<length>|auto <length>","contain-intrinsic-inline-size":"none|<length>|auto <length>","contain-intrinsic-width":"none|<length>|auto <length>",content:"normal|none|[<content-replacement>|<content-list>] [/ [<string>|<counter>]+]?","content-visibility":"visible|auto|hidden","counter-increment":"[<counter-name> <integer>?]+|none","counter-reset":"[<counter-name> <integer>?|<reversed-counter-name> <integer>?]+|none","counter-set":"[<counter-name> <integer>?]+|none",cursor:"[[<url> [<x> <y>]? ,]* [auto|default|none|context-menu|help|pointer|progress|wait|cell|crosshair|text|vertical-text|alias|copy|move|no-drop|not-allowed|e-resize|n-resize|ne-resize|nw-resize|s-resize|se-resize|sw-resize|w-resize|ew-resize|ns-resize|nesw-resize|nwse-resize|col-resize|row-resize|all-scroll|zoom-in|zoom-out|grab|grabbing|hand|-webkit-grab|-webkit-grabbing|-webkit-zoom-in|-webkit-zoom-out|-moz-grab|-moz-grabbing|-moz-zoom-in|-moz-zoom-out]]",direction:"ltr|rtl",display:"[<display-outside>||<display-inside>]|<display-listitem>|<display-internal>|<display-box>|<display-legacy>|<-non-standard-display>","empty-cells":"show|hide",filter:"none|<filter-function-list>|<-ms-filter-function-list>",flex:"none|[<'flex-grow'> <'flex-shrink'>?||<'flex-basis'>]","flex-basis":"content|<'width'>","flex-direction":"row|row-reverse|column|column-reverse","flex-flow":"<'flex-direction'>||<'flex-wrap'>","flex-grow":"<number>","flex-shrink":"<number>","flex-wrap":"nowrap|wrap|wrap-reverse",float:"left|right|none|inline-start|inline-end",font:"[[<'font-style'>||<font-variant-css21>||<'font-weight'>||<'font-stretch'>]? <'font-size'> [/ <'line-height'>]? <'font-family'>]|caption|icon|menu|message-box|small-caption|status-bar","font-family":"[<family-name>|<generic-family>]#","font-feature-settings":"normal|<feature-tag-value>#","font-kerning":"auto|normal|none","font-language-override":"normal|<string>","font-optical-sizing":"auto|none","font-variation-settings":"normal|[<string> <number>]#","font-size":"<absolute-size>|<relative-size>|<length-percentage>","font-size-adjust":"none|[ex-height|cap-height|ch-width|ic-width|ic-height]? [from-font|<number>]","font-smooth":"auto|never|always|<absolute-size>|<length>","font-stretch":"<font-stretch-absolute>","font-style":"normal|italic|oblique <angle>?","font-synthesis":"none|[weight||style||small-caps]","font-variant":"normal|none|[<common-lig-values>||<discretionary-lig-values>||<historical-lig-values>||<contextual-alt-values>||stylistic( <feature-value-name> )||historical-forms||styleset( <feature-value-name># )||character-variant( <feature-value-name># )||swash( <feature-value-name> )||ornaments( <feature-value-name> )||annotation( <feature-value-name> )||[small-caps|all-small-caps|petite-caps|all-petite-caps|unicase|titling-caps]||<numeric-figure-values>||<numeric-spacing-values>||<numeric-fraction-values>||ordinal||slashed-zero||<east-asian-variant-values>||<east-asian-width-values>||ruby]","font-variant-alternates":"normal|[stylistic( <feature-value-name> )||historical-forms||styleset( <feature-value-name># )||character-variant( <feature-value-name># )||swash( <feature-value-name> )||ornaments( <feature-value-name> )||annotation( <feature-value-name> )]","font-variant-caps":"normal|small-caps|all-small-caps|petite-caps|all-petite-caps|unicase|titling-caps","font-variant-east-asian":"normal|[<east-asian-variant-values>||<east-asian-width-values>||ruby]","font-variant-ligatures":"normal|none|[<common-lig-values>||<discretionary-lig-values>||<historical-lig-values>||<contextual-alt-values>]","font-variant-numeric":"normal|[<numeric-figure-values>||<numeric-spacing-values>||<numeric-fraction-values>||ordinal||slashed-zero]","font-variant-position":"normal|sub|super","font-weight":"<font-weight-absolute>|bolder|lighter","forced-color-adjust":"auto|none",gap:"<'row-gap'> <'column-gap'>?",grid:"<'grid-template'>|<'grid-template-rows'> / [auto-flow&&dense?] <'grid-auto-columns'>?|[auto-flow&&dense?] <'grid-auto-rows'>? / <'grid-template-columns'>","grid-area":"<grid-line> [/ <grid-line>]{0,3}","grid-auto-columns":"<track-size>+","grid-auto-flow":"[row|column]||dense","grid-auto-rows":"<track-size>+","grid-column":"<grid-line> [/ <grid-line>]?","grid-column-end":"<grid-line>","grid-column-gap":"<length-percentage>","grid-column-start":"<grid-line>","grid-gap":"<'grid-row-gap'> <'grid-column-gap'>?","grid-row":"<grid-line> [/ <grid-line>]?","grid-row-end":"<grid-line>","grid-row-gap":"<length-percentage>","grid-row-start":"<grid-line>","grid-template":"none|[<'grid-template-rows'> / <'grid-template-columns'>]|[<line-names>? <string> <track-size>? <line-names>?]+ [/ <explicit-track-list>]?","grid-template-areas":"none|<string>+","grid-template-columns":"none|<track-list>|<auto-track-list>|subgrid <line-name-list>?","grid-template-rows":"none|<track-list>|<auto-track-list>|subgrid <line-name-list>?","hanging-punctuation":"none|[first||[force-end|allow-end]||last]",height:"auto|<length>|<percentage>|min-content|max-content|fit-content|fit-content( <length-percentage> )","hyphenate-character":"auto|<string>",hyphens:"none|manual|auto","image-orientation":"from-image|<angle>|[<angle>? flip]","image-rendering":"auto|crisp-edges|pixelated|optimizeSpeed|optimizeQuality|<-non-standard-image-rendering>","image-resolution":"[from-image||<resolution>]&&snap?","ime-mode":"auto|normal|active|inactive|disabled","initial-letter":"normal|[<number> <integer>?]","initial-letter-align":"[auto|alphabetic|hanging|ideographic]","inline-size":"<'width'>","input-security":"auto|none",inset:"<'top'>{1,4}","inset-block":"<'top'>{1,2}","inset-block-end":"<'top'>","inset-block-start":"<'top'>","inset-inline":"<'top'>{1,2}","inset-inline-end":"<'top'>","inset-inline-start":"<'top'>",isolation:"auto|isolate","justify-content":"normal|<content-distribution>|<overflow-position>? [<content-position>|left|right]","justify-items":"normal|stretch|<baseline-position>|<overflow-position>? [<self-position>|left|right]|legacy|legacy&&[left|right|center]","justify-self":"auto|normal|stretch|<baseline-position>|<overflow-position>? [<self-position>|left|right]","justify-tracks":"[normal|<content-distribution>|<overflow-position>? [<content-position>|left|right]]#",left:"<length>|<percentage>|auto","letter-spacing":"normal|<length-percentage>","line-break":"auto|loose|normal|strict|anywhere","line-clamp":"none|<integer>","line-height":"normal|<number>|<length>|<percentage>","line-height-step":"<length>","list-style":"<'list-style-type'>||<'list-style-position'>||<'list-style-image'>","list-style-image":"<image>|none","list-style-position":"inside|outside","list-style-type":"<counter-style>|<string>|none",margin:"[<length>|<percentage>|auto]{1,4}","margin-block":"<'margin-left'>{1,2}","margin-block-end":"<'margin-left'>","margin-block-start":"<'margin-left'>","margin-bottom":"<length>|<percentage>|auto","margin-inline":"<'margin-left'>{1,2}","margin-inline-end":"<'margin-left'>","margin-inline-start":"<'margin-left'>","margin-left":"<length>|<percentage>|auto","margin-right":"<length>|<percentage>|auto","margin-top":"<length>|<percentage>|auto","margin-trim":"none|in-flow|all",mask:"<mask-layer>#","mask-border":"<'mask-border-source'>||<'mask-border-slice'> [/ <'mask-border-width'>? [/ <'mask-border-outset'>]?]?||<'mask-border-repeat'>||<'mask-border-mode'>","mask-border-mode":"luminance|alpha","mask-border-outset":"[<length>|<number>]{1,4}","mask-border-repeat":"[stretch|repeat|round|space]{1,2}","mask-border-slice":"<number-percentage>{1,4} fill?","mask-border-source":"none|<image>","mask-border-width":"[<length-percentage>|<number>|auto]{1,4}","mask-clip":"[<geometry-box>|no-clip]#","mask-composite":"<compositing-operator>#","mask-image":"<mask-reference>#","mask-mode":"<masking-mode>#","mask-origin":"<geometry-box>#","mask-position":"<position>#","mask-repeat":"<repeat-style>#","mask-size":"<bg-size>#","mask-type":"luminance|alpha","masonry-auto-flow":"[pack|next]||[definite-first|ordered]","math-depth":"auto-add|add( <integer> )|<integer>","math-shift":"normal|compact","math-style":"normal|compact","max-block-size":"<'max-width'>","max-height":"none|<length-percentage>|min-content|max-content|fit-content|fit-content( <length-percentage> )","max-inline-size":"<'max-width'>","max-lines":"none|<integer>","max-width":"none|<length-percentage>|min-content|max-content|fit-content|fit-content( <length-percentage> )|<-non-standard-width>","min-block-size":"<'min-width'>","min-height":"auto|<length>|<percentage>|min-content|max-content|fit-content|fit-content( <length-percentage> )","min-inline-size":"<'min-width'>","min-width":"auto|<length>|<percentage>|min-content|max-content|fit-content|fit-content( <length-percentage> )|<-non-standard-width>","mix-blend-mode":"<blend-mode>|plus-lighter","object-fit":"fill|contain|cover|none|scale-down","object-position":"<position>",offset:"[<'offset-position'>? [<'offset-path'> [<'offset-distance'>||<'offset-rotate'>]?]?]! [/ <'offset-anchor'>]?","offset-anchor":"auto|<position>","offset-distance":"<length-percentage>","offset-path":"none|ray( [<angle>&&<size>&&contain?] )|<path()>|<url>|[<basic-shape>||<geometry-box>]","offset-position":"auto|<position>","offset-rotate":"[auto|reverse]||<angle>",opacity:"<alpha-value>",order:"<integer>",orphans:"<integer>",outline:"[<'outline-color'>||<'outline-style'>||<'outline-width'>]","outline-color":"<color>|invert","outline-offset":"<length>","outline-style":"auto|<'border-style'>","outline-width":"<line-width>",overflow:"[visible|hidden|clip|scroll|auto]{1,2}|<-non-standard-overflow>","overflow-anchor":"auto|none","overflow-block":"visible|hidden|clip|scroll|auto","overflow-clip-box":"padding-box|content-box","overflow-clip-margin":"<visual-box>||<length [0,∞]>","overflow-inline":"visible|hidden|clip|scroll|auto","overflow-wrap":"normal|break-word|anywhere","overflow-x":"visible|hidden|clip|scroll|auto","overflow-y":"visible|hidden|clip|scroll|auto","overscroll-behavior":"[contain|none|auto]{1,2}","overscroll-behavior-block":"contain|none|auto","overscroll-behavior-inline":"contain|none|auto","overscroll-behavior-x":"contain|none|auto","overscroll-behavior-y":"contain|none|auto",padding:"[<length>|<percentage>]{1,4}","padding-block":"<'padding-left'>{1,2}","padding-block-end":"<'padding-left'>","padding-block-start":"<'padding-left'>","padding-bottom":"<length>|<percentage>","padding-inline":"<'padding-left'>{1,2}","padding-inline-end":"<'padding-left'>","padding-inline-start":"<'padding-left'>","padding-left":"<length>|<percentage>","padding-right":"<length>|<percentage>","padding-top":"<length>|<percentage>","page-break-after":"auto|always|avoid|left|right|recto|verso","page-break-before":"auto|always|avoid|left|right|recto|verso","page-break-inside":"auto|avoid","paint-order":"normal|[fill||stroke||markers]",perspective:"none|<length>","perspective-origin":"<position>","place-content":"<'align-content'> <'justify-content'>?","place-items":"<'align-items'> <'justify-items'>?","place-self":"<'align-self'> <'justify-self'>?","pointer-events":"auto|none|visiblePainted|visibleFill|visibleStroke|visible|painted|fill|stroke|all|inherit",position:"static|relative|absolute|sticky|fixed|-webkit-sticky",quotes:"none|auto|[<string> <string>]+",resize:"none|both|horizontal|vertical|block|inline",right:"<length>|<percentage>|auto",rotate:"none|<angle>|[x|y|z|<number>{3}]&&<angle>","row-gap":"normal|<length-percentage>","ruby-align":"start|center|space-between|space-around","ruby-merge":"separate|collapse|auto","ruby-position":"[alternate||[over|under]]|inter-character",scale:"none|<number>{1,3}","scrollbar-color":"auto|<color>{2}","scrollbar-gutter":"auto|stable&&both-edges?","scrollbar-width":"auto|thin|none","scroll-behavior":"auto|smooth","scroll-margin":"<length>{1,4}","scroll-margin-block":"<length>{1,2}","scroll-margin-block-start":"<length>","scroll-margin-block-end":"<length>","scroll-margin-bottom":"<length>","scroll-margin-inline":"<length>{1,2}","scroll-margin-inline-start":"<length>","scroll-margin-inline-end":"<length>","scroll-margin-left":"<length>","scroll-margin-right":"<length>","scroll-margin-top":"<length>","scroll-padding":"[auto|<length-percentage>]{1,4}","scroll-padding-block":"[auto|<length-percentage>]{1,2}","scroll-padding-block-start":"auto|<length-percentage>","scroll-padding-block-end":"auto|<length-percentage>","scroll-padding-bottom":"auto|<length-percentage>","scroll-padding-inline":"[auto|<length-percentage>]{1,2}","scroll-padding-inline-start":"auto|<length-percentage>","scroll-padding-inline-end":"auto|<length-percentage>","scroll-padding-left":"auto|<length-percentage>","scroll-padding-right":"auto|<length-percentage>","scroll-padding-top":"auto|<length-percentage>","scroll-snap-align":"[none|start|end|center]{1,2}","scroll-snap-coordinate":"none|<position>#","scroll-snap-destination":"<position>","scroll-snap-points-x":"none|repeat( <length-percentage> )","scroll-snap-points-y":"none|repeat( <length-percentage> )","scroll-snap-stop":"normal|always","scroll-snap-type":"none|[x|y|block|inline|both] [mandatory|proximity]?","scroll-snap-type-x":"none|mandatory|proximity","scroll-snap-type-y":"none|mandatory|proximity","scroll-timeline":"<scroll-timeline-name>||<scroll-timeline-axis>","scroll-timeline-axis":"block|inline|vertical|horizontal","scroll-timeline-name":"none|<custom-ident>","shape-image-threshold":"<alpha-value>","shape-margin":"<length-percentage>","shape-outside":"none|[<shape-box>||<basic-shape>]|<image>","tab-size":"<integer>|<length>","table-layout":"auto|fixed","text-align":"start|end|left|right|center|justify|match-parent","text-align-last":"auto|start|end|left|right|center|justify","text-combine-upright":"none|all|[digits <integer>?]","text-decoration":"<'text-decoration-line'>||<'text-decoration-style'>||<'text-decoration-color'>||<'text-decoration-thickness'>","text-decoration-color":"<color>","text-decoration-line":"none|[underline||overline||line-through||blink]|spelling-error|grammar-error","text-decoration-skip":"none|[objects||[spaces|[leading-spaces||trailing-spaces]]||edges||box-decoration]","text-decoration-skip-ink":"auto|all|none","text-decoration-style":"solid|double|dotted|dashed|wavy","text-decoration-thickness":"auto|from-font|<length>|<percentage>","text-emphasis":"<'text-emphasis-style'>||<'text-emphasis-color'>","text-emphasis-color":"<color>","text-emphasis-position":"[over|under]&&[right|left]","text-emphasis-style":"none|[[filled|open]||[dot|circle|double-circle|triangle|sesame]]|<string>","text-indent":"<length-percentage>&&hanging?&&each-line?","text-justify":"auto|inter-character|inter-word|none","text-orientation":"mixed|upright|sideways","text-overflow":"[clip|ellipsis|<string>]{1,2}","text-rendering":"auto|optimizeSpeed|optimizeLegibility|geometricPrecision","text-shadow":"none|<shadow-t>#","text-size-adjust":"none|auto|<percentage>","text-transform":"none|capitalize|uppercase|lowercase|full-width|full-size-kana","text-underline-offset":"auto|<length>|<percentage>","text-underline-position":"auto|from-font|[under||[left|right]]",top:"<length>|<percentage>|auto","touch-action":"auto|none|[[pan-x|pan-left|pan-right]||[pan-y|pan-up|pan-down]||pinch-zoom]|manipulation",transform:"none|<transform-list>","transform-box":"content-box|border-box|fill-box|stroke-box|view-box","transform-origin":"[<length-percentage>|left|center|right|top|bottom]|[[<length-percentage>|left|center|right]&&[<length-percentage>|top|center|bottom]] <length>?","transform-style":"flat|preserve-3d",transition:"<single-transition>#","transition-delay":"<time>#","transition-duration":"<time>#","transition-property":"none|<single-transition-property>#","transition-timing-function":"<easing-function>#",translate:"none|<length-percentage> [<length-percentage> <length>?]?","unicode-bidi":"normal|embed|isolate|bidi-override|isolate-override|plaintext|-moz-isolate|-moz-isolate-override|-moz-plaintext|-webkit-isolate|-webkit-isolate-override|-webkit-plaintext","user-select":"auto|text|none|contain|all","vertical-align":"baseline|sub|super|text-top|text-bottom|middle|top|bottom|<percentage>|<length>",visibility:"visible|hidden|collapse","white-space":"normal|pre|nowrap|pre-wrap|pre-line|break-spaces",widows:"<integer>",width:"auto|<length>|<percentage>|min-content|max-content|fit-content|fit-content( <length-percentage> )|fill|stretch|intrinsic|-moz-max-content|-webkit-max-content|-moz-fit-content|-webkit-fit-content","will-change":"auto|<animateable-feature>#","word-break":"normal|break-all|keep-all|break-word","word-spacing":"normal|<length>","word-wrap":"normal|break-word","writing-mode":"horizontal-tb|vertical-rl|vertical-lr|sideways-rl|sideways-lr|<svg-writing-mode>","z-index":"auto|<integer>",zoom:"normal|reset|<number>|<percentage>","-moz-background-clip":"padding|border","-moz-border-radius-bottomleft":"<'border-bottom-left-radius'>","-moz-border-radius-bottomright":"<'border-bottom-right-radius'>","-moz-border-radius-topleft":"<'border-top-left-radius'>","-moz-border-radius-topright":"<'border-bottom-right-radius'>","-moz-control-character-visibility":"visible|hidden","-moz-osx-font-smoothing":"auto|grayscale","-moz-user-select":"none|text|all|-moz-none","-ms-flex-align":"start|end|center|baseline|stretch","-ms-flex-item-align":"auto|start|end|center|baseline|stretch","-ms-flex-line-pack":"start|end|center|justify|distribute|stretch","-ms-flex-negative":"<'flex-shrink'>","-ms-flex-pack":"start|end|center|justify|distribute","-ms-flex-order":"<integer>","-ms-flex-positive":"<'flex-grow'>","-ms-flex-preferred-size":"<'flex-basis'>","-ms-interpolation-mode":"nearest-neighbor|bicubic","-ms-grid-column-align":"start|end|center|stretch","-ms-grid-row-align":"start|end|center|stretch","-ms-hyphenate-limit-last":"none|always|column|page|spread","-webkit-background-clip":"[<box>|border|padding|content|text]#","-webkit-column-break-after":"always|auto|avoid","-webkit-column-break-before":"always|auto|avoid","-webkit-column-break-inside":"always|auto|avoid","-webkit-font-smoothing":"auto|none|antialiased|subpixel-antialiased","-webkit-mask-box-image":"[<url>|<gradient>|none] [<length-percentage>{4} <-webkit-mask-box-repeat>{2}]?","-webkit-print-color-adjust":"economy|exact","-webkit-text-security":"none|circle|disc|square","-webkit-user-drag":"none|element|auto","-webkit-user-select":"auto|none|text|all","alignment-baseline":"auto|baseline|before-edge|text-before-edge|middle|central|after-edge|text-after-edge|ideographic|alphabetic|hanging|mathematical","baseline-shift":"baseline|sub|super|<svg-length>",behavior:"<url>+","clip-rule":"nonzero|evenodd",cue:"<'cue-before'> <'cue-after'>?","cue-after":"<url> <decibel>?|none","cue-before":"<url> <decibel>?|none","dominant-baseline":"auto|use-script|no-change|reset-size|ideographic|alphabetic|hanging|mathematical|central|middle|text-after-edge|text-before-edge",fill:"<paint>","fill-opacity":"<number-zero-one>","fill-rule":"nonzero|evenodd","glyph-orientation-horizontal":"<angle>","glyph-orientation-vertical":"<angle>",kerning:"auto|<svg-length>",marker:"none|<url>","marker-end":"none|<url>","marker-mid":"none|<url>","marker-start":"none|<url>",pause:"<'pause-before'> <'pause-after'>?","pause-after":"<time>|none|x-weak|weak|medium|strong|x-strong","pause-before":"<time>|none|x-weak|weak|medium|strong|x-strong",rest:"<'rest-before'> <'rest-after'>?","rest-after":"<time>|none|x-weak|weak|medium|strong|x-strong","rest-before":"<time>|none|x-weak|weak|medium|strong|x-strong","shape-rendering":"auto|optimizeSpeed|crispEdges|geometricPrecision",src:"[<url> [format( <string># )]?|local( <family-name> )]#",speak:"auto|none|normal","speak-as":"normal|spell-out||digits||[literal-punctuation|no-punctuation]",stroke:"<paint>","stroke-dasharray":"none|[<svg-length>+]#","stroke-dashoffset":"<svg-length>","stroke-linecap":"butt|round|square","stroke-linejoin":"miter|round|bevel","stroke-miterlimit":"<number-one-or-greater>","stroke-opacity":"<number-zero-one>","stroke-width":"<svg-length>","text-anchor":"start|middle|end","unicode-range":"<urange>#","voice-balance":"<number>|left|center|right|leftwards|rightwards","voice-duration":"auto|<time>","voice-family":"[[<family-name>|<generic-voice>] ,]* [<family-name>|<generic-voice>]|preserve","voice-pitch":"<frequency>&&absolute|[[x-low|low|medium|high|x-high]||[<frequency>|<semitones>|<percentage>]]","voice-range":"<frequency>&&absolute|[[x-low|low|medium|high|x-high]||[<frequency>|<semitones>|<percentage>]]","voice-rate":"[normal|x-slow|slow|medium|fast|x-fast]||<percentage>","voice-stress":"normal|strong|moderate|none|reduced","voice-volume":"silent|[[x-soft|soft|medium|loud|x-loud]||<decibel>]"},atrules:{charset:{prelude:"<string>",descriptors:null},"counter-style":{prelude:"<counter-style-name>",descriptors:{"additive-symbols":"[<integer>&&<symbol>]#",fallback:"<counter-style-name>",negative:"<symbol> <symbol>?",pad:"<integer>&&<symbol>",prefix:"<symbol>",range:"[[<integer>|infinite]{2}]#|auto","speak-as":"auto|bullets|numbers|words|spell-out|<counter-style-name>",suffix:"<symbol>",symbols:"<symbol>+",system:"cyclic|numeric|alphabetic|symbolic|additive|[fixed <integer>?]|[extends <counter-style-name>]"}},document:{prelude:"[<url>|url-prefix( <string> )|domain( <string> )|media-document( <string> )|regexp( <string> )]#",descriptors:null},"font-face":{prelude:null,descriptors:{"ascent-override":"normal|<percentage>","descent-override":"normal|<percentage>","font-display":"[auto|block|swap|fallback|optional]","font-family":"<family-name>","font-feature-settings":"normal|<feature-tag-value>#","font-variation-settings":"normal|[<string> <number>]#","font-stretch":"<font-stretch-absolute>{1,2}","font-style":"normal|italic|oblique <angle>{0,2}","font-weight":"<font-weight-absolute>{1,2}","font-variant":"normal|none|[<common-lig-values>||<discretionary-lig-values>||<historical-lig-values>||<contextual-alt-values>||stylistic( <feature-value-name> )||historical-forms||styleset( <feature-value-name># )||character-variant( <feature-value-name># )||swash( <feature-value-name> )||ornaments( <feature-value-name> )||annotation( <feature-value-name> )||[small-caps|all-small-caps|petite-caps|all-petite-caps|unicase|titling-caps]||<numeric-figure-values>||<numeric-spacing-values>||<numeric-fraction-values>||ordinal||slashed-zero||<east-asian-variant-values>||<east-asian-width-values>||ruby]","line-gap-override":"normal|<percentage>","size-adjust":"<percentage>",src:"[<url> [format( <string># )]?|local( <family-name> )]#","unicode-range":"<urange>#"}},"font-feature-values":{prelude:"<family-name>#",descriptors:null},import:{prelude:"[<string>|<url>] [layer|layer( <layer-name> )]? [supports( [<supports-condition>|<declaration>] )]? <media-query-list>?",descriptors:null},keyframes:{prelude:"<keyframes-name>",descriptors:null},layer:{prelude:"[<layer-name>#|<layer-name>?]",descriptors:null},media:{prelude:"<media-query-list>",descriptors:null},namespace:{prelude:"<namespace-prefix>? [<string>|<url>]",descriptors:null},page:{prelude:"<page-selector-list>",descriptors:{bleed:"auto|<length>",marks:"none|[crop||cross]",size:"<length>{1,2}|auto|[<page-size>||[portrait|landscape]]"}},property:{prelude:"<custom-property-name>",descriptors:{syntax:"<string>",inherits:"true|false","initial-value":"<string>"}},"scroll-timeline":{prelude:"<timeline-name>",descriptors:null},supports:{prelude:"<supports-condition>",descriptors:null},viewport:{prelude:null,descriptors:{height:"<viewport-length>{1,2}","max-height":"<viewport-length>","max-width":"<viewport-length>","max-zoom":"auto|<number>|<percentage>","min-height":"<viewport-length>","min-width":"<viewport-length>","min-zoom":"auto|<number>|<percentage>",orientation:"auto|portrait|landscape","user-zoom":"zoom|fixed","viewport-fit":"auto|contain|cover",width:"<viewport-length>{1,2}",zoom:"auto|<number>|<percentage>"}},nest:{prelude:"<complex-selector-list>",descriptors:null}}},ce=43,X=45,ir=110,ke=!0,As=!1;function sr(e,r){let t=this.tokenStart+e;const n=this.charCodeAt(t);for((n===ce||n===X)&&(r&&this.error("Number sign is not allowed"),t++);t<this.tokenEnd;t++)F(this.charCodeAt(t))||this.error("Integer is expected",t)}function Oe(e){return sr.call(this,0,e)}function ge(e,r){if(!this.cmpChar(this.tokenStart+e,r)){let t="";switch(r){case ir:t="N is expected";break;case X:t="HyphenMinus is expected";break}this.error(t,this.tokenStart+e)}}function Gr(){let e=0,r=0,t=this.tokenType;for(;t===I||t===H;)t=this.lookupType(++e);if(t!==x)if(this.isDelim(ce,e)||this.isDelim(X,e)){r=this.isDelim(ce,e)?ce:X;do t=this.lookupType(++e);while(t===I||t===H);t!==x&&(this.skip(e),Oe.call(this,ke))}else return null;return e>0&&this.skip(e),r===0&&(t=this.charCodeAt(this.tokenStart),t!==ce&&t!==X&&this.error("Number sign is expected")),Oe.call(this,r!==0),r===X?"-"+this.consume(x):this.consume(x)}const Ts="AnPlusB",Os={a:[String,null],b:[String,null]};function so(){const e=this.tokenStart;let r=null,t=null;if(this.tokenType===x)Oe.call(this,As),t=this.consume(x);else if(this.tokenType===y&&this.cmpChar(this.tokenStart,X))switch(r="-1",ge.call(this,1,ir),this.tokenEnd-this.tokenStart){case 2:this.next(),t=Gr.call(this);break;case 3:ge.call(this,2,X),this.next(),this.skipSC(),Oe.call(this,ke),t="-"+this.consume(x);break;default:ge.call(this,2,X),sr.call(this,3,ke),this.next(),t=this.substrToCursor(e+2)}else if(this.tokenType===y||this.isDelim(ce)&&this.lookupType(1)===y){let n=0;switch(r="1",this.isDelim(ce)&&(n=1,this.next()),ge.call(this,0,ir),this.tokenEnd-this.tokenStart){case 1:this.next(),t=Gr.call(this);break;case 2:ge.call(this,1,X),this.next(),this.skipSC(),Oe.call(this,ke),t="-"+this.consume(x);break;default:ge.call(this,1,X),sr.call(this,2,ke),this.next(),t=this.substrToCursor(e+n+1)}}else if(this.tokenType===S){const n=this.charCodeAt(this.tokenStart),o=n===ce||n===X;let a=this.tokenStart+o;for(;a<this.tokenEnd&&F(this.charCodeAt(a));a++);a===this.tokenStart+o&&this.error("Integer is expected",this.tokenStart+o),ge.call(this,a-this.tokenStart,ir),r=this.substring(e,a),a+1===this.tokenEnd?(this.next(),t=Gr.call(this)):(ge.call(this,a-this.tokenStart+1,X),a+2===this.tokenEnd?(this.next(),this.skipSC(),Oe.call(this,ke),t="-"+this.consume(x)):(sr.call(this,a-this.tokenStart+2,ke),this.next(),t=this.substrToCursor(a+1)))}else this.error();return r!==null&&r.charCodeAt(0)===ce&&(r=r.substr(1)),t!==null&&t.charCodeAt(0)===ce&&(t=t.substr(1)),{type:"AnPlusB",loc:this.getLocation(e,this.tokenStart),a:r,b:t}}function _s(e){if(e.a){const r=e.a==="+1"&&"n"||e.a==="1"&&"n"||e.a==="-1"&&"-n"||e.a+"n";if(e.b){const t=e.b[0]==="-"||e.b[0]==="+"?e.b:"+"+e.b;this.tokenize(r+t)}else this.tokenize(r)}else this.tokenize(e.b)}const Es=Object.freeze(Object.defineProperty({__proto__:null,generate:_s,name:Ts,parse:so,structure:Os},Symbol.toStringTag,{value:"Module"}));function fn(e){return this.Raw(e,this.consumeUntilLeftCurlyBracketOrSemicolon,!0)}function zs(){for(let e=1,r;r=this.lookupType(e);e++){if(r===te)return!0;if(r===G||r===j)return!1}return!1}const $s="Atrule",Ls="atrule",Ps={name:String,prelude:["AtrulePrelude","Raw",null],block:["Block",null]};function lo(e=!1){const r=this.tokenStart;let t,n,o=null,a=null;switch(this.eat(j),t=this.substrToCursor(r+1),n=t.toLowerCase(),this.skipSC(),this.eof===!1&&this.tokenType!==G&&this.tokenType!==Q&&(this.parseAtrulePrelude?o=this.parseWithFallback(this.AtrulePrelude.bind(this,t,e),fn):o=fn.call(this,this.tokenIndex),this.skipSC()),this.tokenType){case Q:this.next();break;case G:hasOwnProperty.call(this.atrule,n)&&typeof this.atrule[n].block=="function"?a=this.atrule[n].block.call(this,e):a=this.Block(zs.call(this));break}return{type:"Atrule",loc:this.getLocation(r,this.tokenStart),name:t,prelude:o,block:a}}function Ms(e){this.token(j,"@"+e.name),e.prelude!==null&&this.node(e.prelude),e.block?this.node(e.block):this.token(Q,";")}const Is=Object.freeze(Object.defineProperty({__proto__:null,generate:Ms,name:$s,parse:lo,structure:Ps,walkContext:Ls},Symbol.toStringTag,{value:"Module"})),js="AtrulePrelude",Ds="atrulePrelude",Ns={children:[[]]};function co(e){let r=null;return e!==null&&(e=e.toLowerCase()),this.skipSC(),hasOwnProperty.call(this.atrule,e)&&typeof this.atrule[e].prelude=="function"?r=this.atrule[e].prelude.call(this):r=this.readSequence(this.scope.AtrulePrelude),this.skipSC(),this.eof!==!0&&this.tokenType!==G&&this.tokenType!==Q&&this.error("Semicolon or block is expected"),{type:"AtrulePrelude",loc:this.getLocationFromList(r),children:r}}function Rs(e){this.children(e)}const Fs=Object.freeze(Object.defineProperty({__proto__:null,generate:Rs,name:js,parse:co,structure:Ns,walkContext:Ds},Symbol.toStringTag,{value:"Module"})),Bs=36,uo=42,lr=61,qs=94,ot=124,Us=126;function Gs(){this.eof&&this.error("Unexpected end of input");const e=this.tokenStart;let r=!1;return this.isDelim(uo)?(r=!0,this.next()):this.isDelim(ot)||this.eat(y),this.isDelim(ot)?this.charCodeAt(this.tokenStart+1)!==lr?(this.next(),this.eat(y)):r&&this.error("Identifier is expected",this.tokenEnd):r&&this.error("Vertical line is expected"),{type:"Identifier",loc:this.getLocation(e,this.tokenStart),name:this.substrToCursor(e)}}function Hs(){const e=this.tokenStart,r=this.charCodeAt(e);return r!==lr&&r!==Us&&r!==qs&&r!==Bs&&r!==uo&&r!==ot&&this.error("Attribute selector (=, ~=, ^=, $=, *=, |=) is expected"),this.next(),r!==lr&&(this.isDelim(lr)||this.error("Equal sign is expected"),this.next()),this.substrToCursor(e)}const Ws="AttributeSelector",Vs={name:"Identifier",matcher:[String,null],value:["String","Identifier",null],flags:[String,null]};function po(){const e=this.tokenStart;let r,t=null,n=null,o=null;return this.eat(Z),this.skipSC(),r=Gs.call(this),this.skipSC(),this.tokenType!==se&&(this.tokenType!==y&&(t=Hs.call(this),this.skipSC(),n=this.tokenType===pe?this.String():this.Identifier(),this.skipSC()),this.tokenType===y&&(o=this.consume(y),this.skipSC())),this.eat(se),{type:"AttributeSelector",loc:this.getLocation(e,this.tokenStart),name:r,matcher:t,value:n,flags:o}}function Ks(e){this.token(C,"["),this.node(e.name),e.matcher!==null&&(this.tokenize(e.matcher),this.node(e.value)),e.flags!==null&&this.token(y,e.flags),this.token(C,"]")}const Qs=Object.freeze(Object.defineProperty({__proto__:null,generate:Ks,name:Ws,parse:po,structure:Vs},Symbol.toStringTag,{value:"Module"})),Ys=38;function ho(e){return this.Raw(e,null,!0)}function gn(){return this.parseWithFallback(this.Rule,ho)}function yn(e){return this.Raw(e,this.consumeUntilSemicolonIncluded,!0)}function Xs(){if(this.tokenType===Q)return yn.call(this,this.tokenIndex);const e=this.parseWithFallback(this.Declaration,yn);return this.tokenType===Q&&this.next(),e}const Zs="Block",Js="block",el={children:[["Atrule","Rule","Declaration"]]};function mo(e){const r=e?Xs:gn,t=this.tokenStart;let n=this.createList();this.eat(G);e:for(;!this.eof;)switch(this.tokenType){case te:break e;case I:case H:this.next();break;case j:n.push(this.parseWithFallback(this.Atrule.bind(this,e),ho));break;default:e&&this.isDelim(Ys)?n.push(gn.call(this)):n.push(r.call(this))}return this.eof||this.eat(te),{type:"Block",loc:this.getLocation(t,this.tokenStart),children:n}}function rl(e){this.token(G,"{"),this.children(e,r=>{r.type==="Declaration"&&this.token(Q,";")}),this.token(te,"}")}const tl=Object.freeze(Object.defineProperty({__proto__:null,generate:rl,name:Zs,parse:mo,structure:el,walkContext:Js},Symbol.toStringTag,{value:"Module"})),nl="Brackets",ol={children:[[]]};function fo(e,r){const t=this.tokenStart;let n=null;return this.eat(Z),n=e.call(this,r),this.eof||this.eat(se),{type:"Brackets",loc:this.getLocation(t,this.tokenStart),children:n}}function al(e){this.token(C,"["),this.children(e),this.token(C,"]")}const il=Object.freeze(Object.defineProperty({__proto__:null,generate:al,name:nl,parse:fo,structure:ol},Symbol.toStringTag,{value:"Module"})),sl="CDC",ll=[];function go(){const e=this.tokenStart;return this.eat(K),{type:"CDC",loc:this.getLocation(e,this.tokenStart)}}function cl(){this.token(K,"-->")}const ul=Object.freeze(Object.defineProperty({__proto__:null,generate:cl,name:sl,parse:go,structure:ll},Symbol.toStringTag,{value:"Module"})),pl="CDO",dl=[];function yo(){const e=this.tokenStart;return this.eat(We),{type:"CDO",loc:this.getLocation(e,this.tokenStart)}}function hl(){this.token(We,"<!--")}const ml=Object.freeze(Object.defineProperty({__proto__:null,generate:hl,name:pl,parse:yo,structure:dl},Symbol.toStringTag,{value:"Module"})),fl=46,gl="ClassSelector",yl={name:String};function bo(){return this.eatDelim(fl),{type:"ClassSelector",loc:this.getLocation(this.tokenStart-1,this.tokenEnd),name:this.consume(y)}}function bl(e){this.token(C,"."),this.token(y,e.name)}const vl=Object.freeze(Object.defineProperty({__proto__:null,generate:bl,name:gl,parse:bo,structure:yl},Symbol.toStringTag,{value:"Module"})),xl=43,bn=47,kl=62,wl=126,Sl="Combinator",Cl={name:String};function vo(){const e=this.tokenStart;let r;switch(this.tokenType){case I:r=" ";break;case C:switch(this.charCodeAt(this.tokenStart)){case kl:case xl:case wl:this.next();break;case bn:this.next(),this.eatIdent("deep"),this.eatDelim(bn);break;default:this.error("Combinator is expected")}r=this.substrToCursor(e);break}return{type:"Combinator",loc:this.getLocation(e,this.tokenStart),name:r}}function Al(e){this.tokenize(e.name)}const Tl=Object.freeze(Object.defineProperty({__proto__:null,generate:Al,name:Sl,parse:vo,structure:Cl},Symbol.toStringTag,{value:"Module"})),Ol=42,_l=47,El="Comment",zl={value:String};function xo(){const e=this.tokenStart;let r=this.tokenEnd;return this.eat(H),r-e+2>=2&&this.charCodeAt(r-2)===Ol&&this.charCodeAt(r-1)===_l&&(r-=2),{type:"Comment",loc:this.getLocation(e,this.tokenStart),value:this.substring(e+2,r)}}function $l(e){this.token(H,"/*"+e.value+"*/")}const Ll=Object.freeze(Object.defineProperty({__proto__:null,generate:$l,name:El,parse:xo,structure:zl},Symbol.toStringTag,{value:"Module"})),ko=33,Pl=35,Ml=36,Il=38,jl=42,Dl=43,vn=47;function Nl(e){return this.Raw(e,this.consumeUntilExclamationMarkOrSemicolon,!0)}function Rl(e){return this.Raw(e,this.consumeUntilExclamationMarkOrSemicolon,!1)}function Fl(){const e=this.tokenIndex,r=this.Value();return r.type!=="Raw"&&this.eof===!1&&this.tokenType!==Q&&this.isDelim(ko)===!1&&this.isBalanceEdge(e)===!1&&this.error(),r}const Bl="Declaration",ql="declaration",Ul={important:[Boolean,String],property:String,value:["Value","Raw"]};function wo(){const e=this.tokenStart,r=this.tokenIndex,t=Hl.call(this),n=mt(t),o=n?this.parseCustomProperty:this.parseValue,a=n?Rl:Nl;let s=!1,c;this.skipSC(),this.eat(U);const u=this.tokenIndex;if(n||this.skipSC(),o?c=this.parseWithFallback(Fl,a):c=a.call(this,this.tokenIndex),n&&c.type==="Value"&&c.children.isEmpty){for(let i=u-this.tokenIndex;i<=0;i++)if(this.lookupType(i)===I){c.children.appendData({type:"WhiteSpace",loc:null,value:" "});break}}return this.isDelim(ko)&&(s=Wl.call(this),this.skipSC()),this.eof===!1&&this.tokenType!==Q&&this.isBalanceEdge(r)===!1&&this.error(),{type:"Declaration",loc:this.getLocation(e,this.tokenStart),important:s,property:t,value:c}}function Gl(e){this.token(y,e.property),this.token(U,":"),this.node(e.value),e.important&&(this.token(C,"!"),this.token(y,e.important===!0?"important":e.important))}function Hl(){const e=this.tokenStart;if(this.tokenType===C)switch(this.charCodeAt(this.tokenStart)){case jl:case Ml:case Dl:case Pl:case Il:this.next();break;case vn:this.next(),this.isDelim(vn)&&this.next();break}return this.tokenType===P?this.eat(P):this.eat(y),this.substrToCursor(e)}function Wl(){this.eat(C),this.skipSC();const e=this.consume(y);return e==="important"?!0:e}const Vl=Object.freeze(Object.defineProperty({__proto__:null,generate:Gl,name:Bl,parse:wo,structure:Ul,walkContext:ql},Symbol.toStringTag,{value:"Module"})),Kl=38;function Hr(e){return this.Raw(e,this.consumeUntilSemicolonIncluded,!0)}const Ql="DeclarationList",Yl={children:[["Declaration","Atrule","Rule"]]};function So(){const e=this.createList();for(;!this.eof;)switch(this.tokenType){case I:case H:case Q:this.next();break;case j:e.push(this.parseWithFallback(this.Atrule.bind(this,!0),Hr));break;default:this.isDelim(Kl)?e.push(this.parseWithFallback(this.Rule,Hr)):e.push(this.parseWithFallback(this.Declaration,Hr))}return{type:"DeclarationList",loc:this.getLocationFromList(e),children:e}}function Xl(e){this.children(e,r=>{r.type==="Declaration"&&this.token(Q,";")})}const Zl=Object.freeze(Object.defineProperty({__proto__:null,generate:Xl,name:Ql,parse:So,structure:Yl},Symbol.toStringTag,{value:"Module"})),Jl="Dimension",ec={value:String,unit:String};function Co(){const e=this.tokenStart,r=this.consumeNumber(S);return{type:"Dimension",loc:this.getLocation(e,this.tokenStart),value:r,unit:this.substring(e+r.length,this.tokenStart)}}function rc(e){this.token(S,e.value+e.unit)}const tc=Object.freeze(Object.defineProperty({__proto__:null,generate:rc,name:Jl,parse:Co,structure:ec},Symbol.toStringTag,{value:"Module"})),nc="Function",oc="function",ac={name:String,children:[[]]};function Ao(e,r){const t=this.tokenStart,n=this.consumeFunctionName(),o=n.toLowerCase();let a;return a=r.hasOwnProperty(o)?r[o].call(this,r):e.call(this,r),this.eof||this.eat(z),{type:"Function",loc:this.getLocation(t,this.tokenStart),name:n,children:a}}function ic(e){this.token(A,e.name+"("),this.children(e),this.token(z,")")}const sc=Object.freeze(Object.defineProperty({__proto__:null,generate:ic,name:nc,parse:Ao,structure:ac,walkContext:oc},Symbol.toStringTag,{value:"Module"})),lc="XXX",cc="Hash",uc={value:String};function To(){const e=this.tokenStart;return this.eat(P),{type:"Hash",loc:this.getLocation(e,this.tokenStart),value:this.substrToCursor(e+1)}}function pc(e){this.token(P,"#"+e.value)}const dc=Object.freeze(Object.defineProperty({__proto__:null,generate:pc,name:cc,parse:To,structure:uc,xxx:lc},Symbol.toStringTag,{value:"Module"})),hc="Identifier",mc={name:String};function Oo(){return{type:"Identifier",loc:this.getLocation(this.tokenStart,this.tokenEnd),name:this.consume(y)}}function fc(e){this.token(y,e.name)}const gc=Object.freeze(Object.defineProperty({__proto__:null,generate:fc,name:hc,parse:Oo,structure:mc},Symbol.toStringTag,{value:"Module"})),yc="IdSelector",bc={name:String};function _o(){const e=this.tokenStart;return this.eat(P),{type:"IdSelector",loc:this.getLocation(e,this.tokenStart),name:this.substrToCursor(e+1)}}function vc(e){this.token(C,"#"+e.name)}const xc=Object.freeze(Object.defineProperty({__proto__:null,generate:vc,name:yc,parse:_o,structure:bc},Symbol.toStringTag,{value:"Module"})),kc="MediaFeature",wc={name:String,value:["Identifier","Number","Dimension","Ratio",null]};function Eo(){const e=this.tokenStart;let r,t=null;if(this.eat(N),this.skipSC(),r=this.consume(y),this.skipSC(),this.tokenType!==z){switch(this.eat(U),this.skipSC(),this.tokenType){case x:this.lookupNonWSType(1)===C?t=this.Ratio():t=this.Number();break;case S:t=this.Dimension();break;case y:t=this.Identifier();break;default:this.error("Number, dimension, ratio or identifier is expected")}this.skipSC()}return this.eat(z),{type:"MediaFeature",loc:this.getLocation(e,this.tokenStart),name:r,value:t}}function Sc(e){this.token(N,"("),this.token(y,e.name),e.value!==null&&(this.token(U,":"),this.node(e.value)),this.token(z,")")}const Cc=Object.freeze(Object.defineProperty({__proto__:null,generate:Sc,name:kc,parse:Eo,structure:wc},Symbol.toStringTag,{value:"Module"})),Ac="MediaQuery",Tc={children:[["Identifier","MediaFeature","WhiteSpace"]]};function zo(){const e=this.createList();let r=null;this.skipSC();e:for(;!this.eof;){switch(this.tokenType){case H:case I:this.next();continue;case y:r=this.Identifier();break;case N:r=this.MediaFeature();break;default:break e}e.push(r)}return r===null&&this.error("Identifier or parenthesis is expected"),{type:"MediaQuery",loc:this.getLocationFromList(e),children:e}}function Oc(e){this.children(e)}const _c=Object.freeze(Object.defineProperty({__proto__:null,generate:Oc,name:Ac,parse:zo,structure:Tc},Symbol.toStringTag,{value:"Module"})),Ec="MediaQueryList",zc={children:[["MediaQuery"]]};function $o(){const e=this.createList();for(this.skipSC();!this.eof&&(e.push(this.MediaQuery()),this.tokenType===de);)this.next();return{type:"MediaQueryList",loc:this.getLocationFromList(e),children:e}}function $c(e){this.children(e,()=>this.token(de,","))}const Lc=Object.freeze(Object.defineProperty({__proto__:null,generate:$c,name:Ec,parse:$o,structure:zc},Symbol.toStringTag,{value:"Module"})),Pc=38,Mc="NestingSelector",Ic={};function Lo(){const e=this.tokenStart;return this.eatDelim(Pc),{type:"NestingSelector",loc:this.getLocation(e,this.tokenStart)}}function jc(){this.token(C,"&")}const Dc=Object.freeze(Object.defineProperty({__proto__:null,generate:jc,name:Mc,parse:Lo,structure:Ic},Symbol.toStringTag,{value:"Module"})),Nc="Nth",Rc={nth:["AnPlusB","Identifier"],selector:["SelectorList",null]};function Po(){this.skipSC();const e=this.tokenStart;let r=e,t=null,n;return this.lookupValue(0,"odd")||this.lookupValue(0,"even")?n=this.Identifier():n=this.AnPlusB(),r=this.tokenStart,this.skipSC(),this.lookupValue(0,"of")&&(this.next(),t=this.SelectorList(),r=this.tokenStart),{type:"Nth",loc:this.getLocation(e,r),nth:n,selector:t}}function Fc(e){this.node(e.nth),e.selector!==null&&(this.token(y,"of"),this.node(e.selector))}const Bc=Object.freeze(Object.defineProperty({__proto__:null,generate:Fc,name:Nc,parse:Po,structure:Rc},Symbol.toStringTag,{value:"Module"})),qc="Number",Uc={value:String};function Mo(){return{type:"Number",loc:this.getLocation(this.tokenStart,this.tokenEnd),value:this.consume(x)}}function Gc(e){this.token(x,e.value)}const Hc=Object.freeze(Object.defineProperty({__proto__:null,generate:Gc,name:qc,parse:Mo,structure:Uc},Symbol.toStringTag,{value:"Module"})),Wc="Operator",Vc={value:String};function Io(){const e=this.tokenStart;return this.next(),{type:"Operator",loc:this.getLocation(e,this.tokenStart),value:this.substrToCursor(e)}}function Kc(e){this.tokenize(e.value)}const Qc=Object.freeze(Object.defineProperty({__proto__:null,generate:Kc,name:Wc,parse:Io,structure:Vc},Symbol.toStringTag,{value:"Module"})),Yc="Parentheses",Xc={children:[[]]};function jo(e,r){const t=this.tokenStart;let n=null;return this.eat(N),n=e.call(this,r),this.eof||this.eat(z),{type:"Parentheses",loc:this.getLocation(t,this.tokenStart),children:n}}function Zc(e){this.token(N,"("),this.children(e),this.token(z,")")}const Jc=Object.freeze(Object.defineProperty({__proto__:null,generate:Zc,name:Yc,parse:jo,structure:Xc},Symbol.toStringTag,{value:"Module"})),eu="Percentage",ru={value:String};function Do(){return{type:"Percentage",loc:this.getLocation(this.tokenStart,this.tokenEnd),value:this.consumeNumber(M)}}function tu(e){this.token(M,e.value+"%")}const nu=Object.freeze(Object.defineProperty({__proto__:null,generate:tu,name:eu,parse:Do,structure:ru},Symbol.toStringTag,{value:"Module"})),ou="PseudoClassSelector",au="function",iu={name:String,children:[["Raw"],null]};function No(){const e=this.tokenStart;let r=null,t,n;return this.eat(U),this.tokenType===A?(t=this.consumeFunctionName(),n=t.toLowerCase(),hasOwnProperty.call(this.pseudo,n)?(this.skipSC(),r=this.pseudo[n].call(this),this.skipSC()):(r=this.createList(),r.push(this.Raw(this.tokenIndex,null,!1))),this.eat(z)):t=this.consume(y),{type:"PseudoClassSelector",loc:this.getLocation(e,this.tokenStart),name:t,children:r}}function su(e){this.token(U,":"),e.children===null?this.token(y,e.name):(this.token(A,e.name+"("),this.children(e),this.token(z,")"))}const lu=Object.freeze(Object.defineProperty({__proto__:null,generate:su,name:ou,parse:No,structure:iu,walkContext:au},Symbol.toStringTag,{value:"Module"})),cu="PseudoElementSelector",uu="function",pu={name:String,children:[["Raw"],null]};function Ro(){const e=this.tokenStart;let r=null,t,n;return this.eat(U),this.eat(U),this.tokenType===A?(t=this.consumeFunctionName(),n=t.toLowerCase(),hasOwnProperty.call(this.pseudo,n)?(this.skipSC(),r=this.pseudo[n].call(this),this.skipSC()):(r=this.createList(),r.push(this.Raw(this.tokenIndex,null,!1))),this.eat(z)):t=this.consume(y),{type:"PseudoElementSelector",loc:this.getLocation(e,this.tokenStart),name:t,children:r}}function du(e){this.token(U,":"),this.token(U,":"),e.children===null?this.token(y,e.name):(this.token(A,e.name+"("),this.children(e),this.token(z,")"))}const hu=Object.freeze(Object.defineProperty({__proto__:null,generate:du,name:cu,parse:Ro,structure:pu,walkContext:uu},Symbol.toStringTag,{value:"Module"})),mu=47,fu=46;function xn(){this.skipSC();const e=this.consume(x);for(let r=0;r<e.length;r++){const t=e.charCodeAt(r);!F(t)&&t!==fu&&this.error("Unsigned number is expected",this.tokenStart-e.length+r)}return Number(e)===0&&this.error("Zero number is not allowed",this.tokenStart-e.length),e}const gu="Ratio",yu={left:String,right:String};function Fo(){const e=this.tokenStart,r=xn.call(this);let t;return this.skipSC(),this.eatDelim(mu),t=xn.call(this),{type:"Ratio",loc:this.getLocation(e,this.tokenStart),left:r,right:t}}function bu(e){this.token(x,e.left),this.token(C,"/"),this.token(x,e.right)}const vu=Object.freeze(Object.defineProperty({__proto__:null,generate:bu,name:gu,parse:Fo,structure:yu},Symbol.toStringTag,{value:"Module"}));function xu(){return this.tokenIndex>0&&this.lookupType(-1)===I?this.tokenIndex>1?this.getTokenStart(this.tokenIndex-1):this.firstCharOffset:this.tokenStart}const ku="Raw",wu={value:String};function Bo(e,r,t){const n=this.getTokenStart(e);let o;return this.skipUntilBalanced(e,r||this.consumeUntilBalanceEnd),t&&this.tokenStart>n?o=xu.call(this):o=this.tokenStart,{type:"Raw",loc:this.getLocation(n,o),value:this.substring(n,o)}}function Su(e){this.tokenize(e.value)}const Cu=Object.freeze(Object.defineProperty({__proto__:null,generate:Su,name:ku,parse:Bo,structure:wu},Symbol.toStringTag,{value:"Module"}));function kn(e){return this.Raw(e,this.consumeUntilLeftCurlyBracket,!0)}function Au(){const e=this.SelectorList();return e.type!=="Raw"&&this.eof===!1&&this.tokenType!==G&&this.error(),e}const Tu="Rule",Ou="rule",_u={prelude:["SelectorList","Raw"],block:["Block"]};function qo(){const e=this.tokenIndex,r=this.tokenStart;let t,n;return this.parseRulePrelude?t=this.parseWithFallback(Au,kn):t=kn.call(this,e),n=this.Block(!0),{type:"Rule",loc:this.getLocation(r,this.tokenStart),prelude:t,block:n}}function Eu(e){this.node(e.prelude),this.node(e.block)}const zu=Object.freeze(Object.defineProperty({__proto__:null,generate:Eu,name:Tu,parse:qo,structure:_u,walkContext:Ou},Symbol.toStringTag,{value:"Module"})),$u="Selector",Lu={children:[["TypeSelector","IdSelector","ClassSelector","AttributeSelector","PseudoClassSelector","PseudoElementSelector","Combinator","WhiteSpace"]]};function Uo(){const e=this.readSequence(this.scope.Selector);return this.getFirstListNode(e)===null&&this.error("Selector is expected"),{type:"Selector",loc:this.getLocationFromList(e),children:e}}function Pu(e){this.children(e)}const Mu=Object.freeze(Object.defineProperty({__proto__:null,generate:Pu,name:$u,parse:Uo,structure:Lu},Symbol.toStringTag,{value:"Module"})),Iu="SelectorList",ju="selector",Du={children:[["Selector","Raw"]]};function Go(){const e=this.createList();for(;!this.eof;){if(e.push(this.Selector()),this.tokenType===de){this.next();continue}break}return{type:"SelectorList",loc:this.getLocationFromList(e),children:e}}function Nu(e){this.children(e,()=>this.token(de,","))}const Ru=Object.freeze(Object.defineProperty({__proto__:null,generate:Nu,name:Iu,parse:Go,structure:Du,walkContext:ju},Symbol.toStringTag,{value:"Module"})),at=92,Ho=34,Fu=39;function Wo(e){const r=e.length,t=e.charCodeAt(0),n=t===Ho||t===Fu?1:0,o=n===1&&r>1&&e.charCodeAt(r-1)===t?r-2:r-1;let a="";for(let s=n;s<=o;s++){let c=e.charCodeAt(s);if(c===at){if(s===o){s!==r-1&&(a=e.substr(s+1));break}if(c=e.charCodeAt(++s),ue(at,c)){const u=s-1,i=$e(e,u);s=i-1,a+=jn(e.substring(u+1,i))}else c===13&&e.charCodeAt(s+1)===10&&s++}else a+=e[s]}return a}function Bu(e,r){const n=Ho;let o="",a=!1;for(let s=0;s<e.length;s++){const c=e.charCodeAt(s);if(c===0){o+="�";continue}if(c<=31||c===127){o+="\\"+c.toString(16),a=!0;continue}c===n||c===at?(o+="\\"+e.charAt(s),a=!1):(a&&(ve(c)||we(c))&&(o+=" "),o+=e.charAt(s),a=!1)}return'"'+o+'"'}const qu="String",Uu={value:String};function Vo(){return{type:"String",loc:this.getLocation(this.tokenStart,this.tokenEnd),value:Wo(this.consume(pe))}}function Gu(e){this.token(pe,Bu(e.value))}const Hu=Object.freeze(Object.defineProperty({__proto__:null,generate:Gu,name:qu,parse:Vo,structure:Uu},Symbol.toStringTag,{value:"Module"})),Wu=33;function wn(e){return this.Raw(e,null,!1)}const Vu="StyleSheet",Ku="stylesheet",Qu={children:[["Comment","CDO","CDC","Atrule","Rule","Raw"]]};function Ko(){const e=this.tokenStart,r=this.createList();let t;for(;!this.eof;){switch(this.tokenType){case I:this.next();continue;case H:if(this.charCodeAt(this.tokenStart+2)!==Wu){this.next();continue}t=this.Comment();break;case We:t=this.CDO();break;case K:t=this.CDC();break;case j:t=this.parseWithFallback(this.Atrule,wn);break;default:t=this.parseWithFallback(this.Rule,wn)}r.push(t)}return{type:"StyleSheet",loc:this.getLocation(e,this.tokenStart),children:r}}function Yu(e){this.children(e)}const Xu=Object.freeze(Object.defineProperty({__proto__:null,generate:Yu,name:Vu,parse:Ko,structure:Qu,walkContext:Ku},Symbol.toStringTag,{value:"Module"})),Zu=42,Sn=124;function Wr(){this.tokenType!==y&&this.isDelim(Zu)===!1&&this.error("Identifier or asterisk is expected"),this.next()}const Ju="TypeSelector",ep={name:String};function Qo(){const e=this.tokenStart;return this.isDelim(Sn)?(this.next(),Wr.call(this)):(Wr.call(this),this.isDelim(Sn)&&(this.next(),Wr.call(this))),{type:"TypeSelector",loc:this.getLocation(e,this.tokenStart),name:this.substrToCursor(e)}}function rp(e){this.tokenize(e.name)}const tp=Object.freeze(Object.defineProperty({__proto__:null,generate:rp,name:Ju,parse:Qo,structure:ep},Symbol.toStringTag,{value:"Module"})),Yo=43,Xo=45,it=63;function Fe(e,r){let t=0;for(let n=this.tokenStart+e;n<this.tokenEnd;n++){const o=this.charCodeAt(n);if(o===Xo&&r&&t!==0)return Fe.call(this,e+t+1,!1),-1;ve(o)||this.error(r&&t!==0?"Hyphen minus"+(t<6?" or hex digit":"")+" is expected":t<6?"Hex digit is expected":"Unexpected input",n),++t>6&&this.error("Too many hex digits",n)}return this.next(),t}function tr(e){let r=0;for(;this.isDelim(it);)++r>e&&this.error("Too many question marks"),this.next()}function np(e){this.charCodeAt(this.tokenStart)!==e&&this.error((e===Yo?"Plus sign":"Hyphen minus")+" is expected")}function op(){let e=0;switch(this.tokenType){case x:if(e=Fe.call(this,1,!0),this.isDelim(it)){tr.call(this,6-e);break}if(this.tokenType===S||this.tokenType===x){np.call(this,Xo),Fe.call(this,1,!1);break}break;case S:e=Fe.call(this,1,!0),e>0&&tr.call(this,6-e);break;default:if(this.eatDelim(Yo),this.tokenType===y){e=Fe.call(this,0,!0),e>0&&tr.call(this,6-e);break}if(this.isDelim(it)){this.next(),tr.call(this,5);break}this.error("Hex digit or question mark is expected")}}const ap="UnicodeRange",ip={value:String};function Zo(){const e=this.tokenStart;return this.eatIdent("u"),op.call(this),{type:"UnicodeRange",loc:this.getLocation(e,this.tokenStart),value:this.substrToCursor(e)}}function sp(e){this.tokenize(e.value)}const lp=Object.freeze(Object.defineProperty({__proto__:null,generate:sp,name:ap,parse:Zo,structure:ip},Symbol.toStringTag,{value:"Module"})),cp=32,st=92,up=34,pp=39,dp=40,Jo=41;function hp(e){const r=e.length;let t=4,n=e.charCodeAt(r-1)===Jo?r-2:r-1,o="";for(;t<n&&we(e.charCodeAt(t));)t++;for(;t<n&&we(e.charCodeAt(n));)n--;for(let a=t;a<=n;a++){let s=e.charCodeAt(a);if(s===st){if(a===n){a!==r-1&&(o=e.substr(a+1));break}if(s=e.charCodeAt(++a),ue(st,s)){const c=a-1,u=$e(e,c);a=u-1,o+=jn(e.substring(c+1,u))}else s===13&&e.charCodeAt(a+1)===10&&a++}else o+=e[a]}return o}function mp(e){let r="",t=!1;for(let n=0;n<e.length;n++){const o=e.charCodeAt(n);if(o===0){r+="�";continue}if(o<=31||o===127){r+="\\"+o.toString(16),t=!0;continue}o===cp||o===st||o===up||o===pp||o===dp||o===Jo?(r+="\\"+e.charAt(n),t=!1):(t&&ve(o)&&(r+=" "),r+=e.charAt(n),t=!1)}return"url("+r+")"}const fp="Url",gp={value:String};function ea(){const e=this.tokenStart;let r;switch(this.tokenType){case q:r=hp(this.consume(q));break;case A:this.cmpStr(this.tokenStart,this.tokenEnd,"url(")||this.error("Function name must be `url`"),this.eat(A),this.skipSC(),r=Wo(this.consume(pe)),this.skipSC(),this.eof||this.eat(z);break;default:this.error("Url or Function is expected")}return{type:"Url",loc:this.getLocation(e,this.tokenStart),value:r}}function yp(e){this.token(q,mp(e.value))}const bp=Object.freeze(Object.defineProperty({__proto__:null,generate:yp,name:fp,parse:ea,structure:gp},Symbol.toStringTag,{value:"Module"})),vp="Value",xp={children:[[]]};function ra(){const e=this.tokenStart,r=this.readSequence(this.scope.Value);return{type:"Value",loc:this.getLocation(e,this.tokenStart),children:r}}function kp(e){this.children(e)}const wp=Object.freeze(Object.defineProperty({__proto__:null,generate:kp,name:vp,parse:ra,structure:xp},Symbol.toStringTag,{value:"Module"})),Sp=Object.freeze({type:"WhiteSpace",loc:null,value:" "}),Cp="WhiteSpace",Ap={value:String};function ta(){return this.eat(I),Sp}function Tp(e){this.token(I,e.value)}const Op=Object.freeze(Object.defineProperty({__proto__:null,generate:Tp,name:Cp,parse:ta,structure:Ap},Symbol.toStringTag,{value:"Module"})),na=Object.freeze(Object.defineProperty({__proto__:null,AnPlusB:Es,Atrule:Is,AtrulePrelude:Fs,AttributeSelector:Qs,Block:tl,Brackets:il,CDC:ul,CDO:ml,ClassSelector:vl,Combinator:Tl,Comment:Ll,Declaration:Vl,DeclarationList:Zl,Dimension:tc,Function:sc,Hash:dc,IdSelector:xc,Identifier:gc,MediaFeature:Cc,MediaQuery:_c,MediaQueryList:Lc,NestingSelector:Dc,Nth:Bc,Number:Hc,Operator:Qc,Parentheses:Jc,Percentage:nu,PseudoClassSelector:lu,PseudoElementSelector:hu,Ratio:vu,Raw:Cu,Rule:zu,Selector:Mu,SelectorList:Ru,String:Hu,StyleSheet:Xu,TypeSelector:tp,UnicodeRange:lp,Url:bp,Value:wp,WhiteSpace:Op},Symbol.toStringTag,{value:"Module"})),_p={generic:!0,...Cs,node:na},Ep=35,zp=42,Cn=43,$p=45,Lp=47,Pp=117;function oa(e){switch(this.tokenType){case P:return this.Hash();case de:return this.Operator();case N:return this.Parentheses(this.readSequence,e.recognizer);case Z:return this.Brackets(this.readSequence,e.recognizer);case pe:return this.String();case S:return this.Dimension();case M:return this.Percentage();case x:return this.Number();case A:return this.cmpStr(this.tokenStart,this.tokenEnd,"url(")?this.Url():this.Function(this.readSequence,e.recognizer);case q:return this.Url();case y:return this.cmpChar(this.tokenStart,Pp)&&this.cmpChar(this.tokenStart+1,Cn)?this.UnicodeRange():this.Identifier();case C:{const r=this.charCodeAt(this.tokenStart);if(r===Lp||r===zp||r===Cn||r===$p)return this.Operator();r===Ep&&this.error("Hex or identifier is expected",this.tokenStart+1);break}}}const Mp={getNode:oa},Ip=35,jp=38,Dp=42,Np=43,Rp=47,An=46,Fp=62,Bp=124,qp=126;function Up(e,r){r.last!==null&&r.last.type!=="Combinator"&&e!==null&&e.type!=="Combinator"&&r.push({type:"Combinator",loc:null,name:" "})}function Gp(){switch(this.tokenType){case Z:return this.AttributeSelector();case P:return this.IdSelector();case U:return this.lookupType(1)===U?this.PseudoElementSelector():this.PseudoClassSelector();case y:return this.TypeSelector();case x:case M:return this.Percentage();case S:this.charCodeAt(this.tokenStart)===An&&this.error("Identifier is expected",this.tokenStart+1);break;case C:{switch(this.charCodeAt(this.tokenStart)){case Np:case Fp:case qp:case Rp:return this.Combinator();case An:return this.ClassSelector();case Dp:case Bp:return this.TypeSelector();case Ip:return this.IdSelector();case jp:return this.NestingSelector()}break}}}const Hp={onWhiteSpace:Up,getNode:Gp};function Wp(){return this.createSingleNodeList(this.Raw(this.tokenIndex,null,!1))}function Vp(){const e=this.createList();if(this.skipSC(),e.push(this.Identifier()),this.skipSC(),this.tokenType===de){e.push(this.Operator());const r=this.tokenIndex,t=this.parseCustomProperty?this.Value(null):this.Raw(this.tokenIndex,this.consumeUntilExclamationMarkOrSemicolon,!1);if(t.type==="Value"&&t.children.isEmpty){for(let n=r-this.tokenIndex;n<=0;n++)if(this.lookupType(n)===I){t.children.appendData({type:"WhiteSpace",loc:null,value:" "});break}}e.push(t)}return e}function Tn(e){return e!==null&&e.type==="Operator"&&(e.value[e.value.length-1]==="-"||e.value[e.value.length-1]==="+")}const Kp={getNode:oa,onWhiteSpace(e,r){Tn(e)&&(e.value=" "+e.value),Tn(r.last)&&(r.last.value+=" ")},expression:Wp,var:Vp},Qp=Object.freeze(Object.defineProperty({__proto__:null,AtrulePrelude:Mp,Selector:Hp,Value:Kp},Symbol.toStringTag,{value:"Module"})),Yp={parse:{prelude:null,block(){return this.Block(!0)}}},Xp={parse:{prelude(){const e=this.createList();switch(this.skipSC(),this.tokenType){case pe:e.push(this.String());break;case q:case A:e.push(this.Url());break;default:this.error("String or url() is expected")}return(this.lookupNonWSType(0)===y||this.lookupNonWSType(0)===N)&&e.push(this.MediaQueryList()),e},block:null}},Zp={parse:{prelude(){return this.createSingleNodeList(this.MediaQueryList())},block(e=!1){return this.Block(e)}}},Jp={parse:{prelude(){return this.createSingleNodeList(this.SelectorList())},block(){return this.Block(!0)}}},ed={parse:{prelude(){return this.createSingleNodeList(this.SelectorList())},block(){return this.Block(!0)}}};function rd(){return this.createSingleNodeList(this.Raw(this.tokenIndex,null,!1))}function td(){return this.skipSC(),this.tokenType===y&&this.lookupNonWSType(1)===U?this.createSingleNodeList(this.Declaration()):aa.call(this)}function aa(){const e=this.createList();let r;this.skipSC();e:for(;!this.eof;){switch(this.tokenType){case H:case I:this.next();continue;case A:r=this.Function(rd,this.scope.AtrulePrelude);break;case y:r=this.Identifier();break;case N:r=this.Parentheses(td,this.scope.AtrulePrelude);break;default:break e}e.push(r)}return e}const nd={parse:{prelude(){const e=aa.call(this);return this.getFirstListNode(e)===null&&this.error("Condition is expected"),e},block(e=!1){return this.Block(e)}}},od={"font-face":Yp,import:Xp,media:Zp,nest:Jp,page:ed,supports:nd},xe={parse(){return this.createSingleNodeList(this.SelectorList())}},Vr={parse(){return this.createSingleNodeList(this.Selector())}},On={parse(){return this.createSingleNodeList(this.Identifier())}},nr={parse(){return this.createSingleNodeList(this.Nth())}},ad={dir:On,has:xe,lang:On,matches:xe,is:xe,"-moz-any":xe,"-webkit-any":xe,where:xe,not:xe,"nth-child":nr,"nth-last-child":nr,"nth-last-of-type":nr,"nth-of-type":nr,slotted:Vr,host:Vr,"host-context":Vr},id=Object.freeze(Object.defineProperty({__proto__:null,AnPlusB:so,Atrule:lo,AtrulePrelude:co,AttributeSelector:po,Block:mo,Brackets:fo,CDC:go,CDO:yo,ClassSelector:bo,Combinator:vo,Comment:xo,Declaration:wo,DeclarationList:So,Dimension:Co,Function:Ao,Hash:To,IdSelector:_o,Identifier:Oo,MediaFeature:Eo,MediaQuery:zo,MediaQueryList:$o,NestingSelector:Lo,Nth:Po,Number:Mo,Operator:Io,Parentheses:jo,Percentage:Do,PseudoClassSelector:No,PseudoElementSelector:Ro,Ratio:Fo,Raw:Bo,Rule:qo,Selector:Uo,SelectorList:Go,String:Vo,StyleSheet:Ko,TypeSelector:Qo,UnicodeRange:Zo,Url:ea,Value:ra,WhiteSpace:ta},Symbol.toStringTag,{value:"Module"})),sd={parseContext:{default:"StyleSheet",stylesheet:"StyleSheet",atrule:"Atrule",atrulePrelude(e){return this.AtrulePrelude(e.atrule?String(e.atrule):null)},mediaQueryList:"MediaQueryList",mediaQuery:"MediaQuery",rule:"Rule",selectorList:"SelectorList",selector:"Selector",block(){return this.Block(!0)},declarationList:"DeclarationList",declaration:"Declaration",value:"Value"},scope:Qp,atrule:od,pseudo:ad,node:id},ld={node:na},cd=Ss({..._p,...sd,...ld}),{tokenize:kd,parse:ia,generate:wd,lexer:Sd,createLexer:Cd,walk:Ad,find:Td,findLast:Od,findAll:_d,toPlainObject:sa,fromPlainObject:Ed,fork:zd}=cd;var la=function(e,r){return e.A!==r.A?e.A-r.A:e.B!==r.B?e.B-r.B:e.C-r.C},_n=function(e,r){return la(r,e)},yr=function(){return yr=Object.assign||function(e){for(var r,t=1,n=arguments.length;t<n;t++){r=arguments[t];for(var o in r)Object.prototype.hasOwnProperty.call(r,o)&&(e[o]=r[o])}return e},yr.apply(this,arguments)},En=function(e,r,t){if(t||arguments.length===2)for(var n=0,o=r.length,a;n<o;n++)(a||!(n in r))&&(a||(a=Array.prototype.slice.call(r,0,n)),a[n]=r[n]);return e.concat(a||Array.prototype.slice.call(r))},ud="*",be=function(e,r,t){var n,o,a,s,c,u,i,l,p,f=r.total,m=r.contributingParts;return{total:yr(yr({},f),(n={},n[t]=f[t]+1,n)),contributingParts:En(En([],m,!0),[{level:t,start:{line:(a=(o=e?.loc)===null||o===void 0?void 0:o.start.line)!==null&&a!==void 0?a:1,column:(c=(s=e?.loc)===null||s===void 0?void 0:s.start.column)!==null&&c!==void 0?c:1},end:{line:(i=(u=e?.loc)===null||u===void 0?void 0:u.end.line)!==null&&i!==void 0?i:1,column:(p=(l=e?.loc)===null||l===void 0?void 0:l.end.column)!==null&&p!==void 0?p:1}}],!1)}},pd=["before","after","first-line","first-letter"],dd=function(e){if(e.children){var r=e.children[0];return r.type==="SelectorList"?r.children:r.type==="Nth"&&r.selector?r.selector.children:e.children}return[]},hd=function(e,r){var t=e.name.toLowerCase(),n=dd(e);if(t==="not"||t==="is"||t==="has"){if(n.length>0)return n.map(function(a){return ze(a,r)}).sort(function(a,s){return _n(a.total,s.total)})[0]}else if(t==="nth-child"||t==="nth-last-child")if(n.length>0){var o=n.map(function(a){return ze(a,be(e,r,"B"))}).sort(function(a,s){return _n(a.total,s.total)})[0];return o}else return be(e,r,"B");else{if(t==="where")return r;if(t==="global"||t==="local"){if(n.length>0)return n.reduce(function(a,s){return ze(s,a)},r)}else return pd.includes(t)?be(e,r,"C"):be(e,r,"B")}return r},ze=function(e,r){var t,n,o,a;if(r===void 0&&(r={total:{A:0,B:0,C:0},contributingParts:[]}),e.type==="IdSelector")return be(e,r,"A");if(e.type==="PseudoClassSelector")return hd(e,r);if(e.type==="ClassSelector"||e.type==="AttributeSelector")return be(e,r,"B");if(e.type==="TypeSelector"){if(e.name!==ud)return be(e,r,"C")}else{if(e.type==="PseudoElementSelector")return be(e,r,"C");if(e.type==="Selector"||e.type==="SelectorList")return e.children.reduce(function(s,c){return ze(c,s)},r);if(e.type==="Raw")return ze(sa(ia(e.value,{context:"selector",positions:!0,line:(n=(t=e?.loc)===null||t===void 0?void 0:t.end.line)!==null&&n!==void 0?n:1,column:(a=(o=e?.loc)===null||o===void 0?void 0:o.end.column)!==null&&a!==void 0?a:1})),r)}return r},zn=function(e){var r=sa(ia(e,{context:"selector"}));return ze(r).total};const $d=(e,r)=>{const t=md(r),n=fd(t),o=yd(n),a=gd(n),s=bd({theme:e,objRootClasses:a,objDarkClasses:o}),c=vd(s);return xd(c)};function md(e){let n=ca(e,"/* CSS PARSER: START - DO NOT REMOVE */","/* CSS PARSER: END - DO NOT REMOVE */");return n=n.replace(/\/\*[\s\S]*?\*\//g,"").trim(),n}function fd(e){const r={};return e.split("}").filter(n=>n.trim()!=="").forEach(n=>{const o=n.indexOf("{");if(o===-1)return;const a=n.substring(0,o).trim(),s=n.substring(o+1).trim(),c=a.split(",").map(i=>i.trim()),u=s.split(";").reduce((i,l)=>{const[p,f]=l.split(":").map(m=>m.trim());return p&&f&&(i[p]=f),i},{});c.forEach(i=>{r[i]||(r[i]={}),Object.assign(r[i],u)})}),r}function gd(e){const r={};return Object.keys(e).forEach(t=>{t.includes(".dark")||(r[t]=e[t])}),r}function yd(e){const r={};return Object.keys(e).forEach(t=>{if(t.includes(".dark")){const n=t.replace(/^\.dark/,"");e[n]?r[n]={...e[n],...e[t]}:r[n]=e[t]}else r[t]||(r[t]=e[t])}),r}function bd({theme:e,objRootClasses:r,objDarkClasses:t}){if(!e)throw new Error("No theme provided");const n=$n(r),o=$n(t),a=Array.isArray(e)?e:e?.split(" ");let s={},c={};return Object.entries(n).forEach(([u,i])=>{a.forEach(l=>{u.includes(`.${l}`)&&(s={...s,...i})})}),Object.entries(o).forEach(([u,i])=>{a.forEach(l=>{u.includes(`.${l}`)&&(c={...c,...i})})}),{root:s,dark:c}}function $n(e){return Object.keys(e).sort((o,a)=>{const s=zn(o),c=zn(a);return la(s,c)}).reduce((o,a)=>(o[a]=e[a],o),{})}function vd(e){const r=["--background","--foreground","--muted","--muted-foreground","--popover","--popover-foreground","--card","--card-foreground","--border","--input","--primary","--primary-foreground","--secondary","--secondary-foreground","--accent","--accent-foreground","--alert","--alert-foreground","--ring","--border-width","--stroke-width","--border-radius","--shadow-base","--shadow-2xs","--shadow-xs","--shadow-sm","--shadow-md","--shadow-lg","--shadow-xl","--shadow-2xl","--shadow-inner","--transform-press"];function t(n){const o={};return r.forEach(a=>{a in n&&(o[a]=n[a])}),o}return{root:t(e.root),dark:t(e.dark)}}function xd(e){let r=`@layer base, qwik-ui, popover-polyfill, theme, components, utilities;
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

@layer base {
`;for(const[t,n]of Object.entries(e)){r+=`  ${t==="root"?":root":`.${t}`} {
`;for(const[o,a]of Object.entries(n))r+=`    ${o}: ${a};
`;r+=`  }
`}return r+=`}

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-alert: var(--alert);
  --color-alert-foreground: var(--alert-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-xs: var(--border-radius);
  --radius-sm: calc(var(--border-radius) + 0.125rem);
  --radius-md: calc(var(--border-radius) + 0.375rem);
  --radius-lg: calc(var(--border-radius) + 0.5rem);
  --radius-xl: calc(var(--border-radius) + 0.75rem);
  --radius-2xl: calc(var(--border-radius) + 1rem);
  --radius-3xl: calc(var(--border-radius) + 1.5rem);
  --shadow-base: var(--shadow-base);
  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
  --shadow-inner: var(--shadow-inner);
  --default-border-width: calc(var(--border-width) + 1px);
  --border-width-base: var(--border-width);
  --border-width-2: calc(var(--border-width) + 2px);
  --border-width-4: calc(var(--border-width) + 4px);
  --border-width-8: calc(var(--border-width) + 8px);
  --stroke-width-0: 0px;
  --stroke-width-base: var(--stroke-width);
  --stroke-width-1: calc(var(--stroke-width) + 1px);
  --stroke-width-2: calc(var(--stroke-width) + 2px);
  --animate-accordion-down: collapsible-down 0.2s ease-out forwards;
  --animate-accordion-up: collapsible-up 0.2s ease-out forwards;

  @keyframes collapsible-down {
    from {
      height: 0;
    }
    to {
      height: var(--qwikui-collapsible-content-height);
    }
  }
  @keyframes collapsible-up {
    from {
      height: var(--qwikui-collapsible-content-height);
    }
    to {
      height: 0;
    }
  }
}

@utility press {
  transform: var(--transform-press);
}
@utility border-width-* {
  /* prettier-ignore */
  border: --value(--border-width-*);
}
@utility stroke-width-* {
  /* prettier-ignore */
  stroke: --value(--stroke-width-*);
}
@utility shadow-* {
  /* prettier-ignore */
  box-shadow: --value(--shadow-*);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`,r}const Ld=`@layer theme, base, qwik-ui, popover-polyfill, components, utilities;
@import 'tailwindcss';
@import 'tw-animate-css';

@source "../../../packages/kit-styled";

@custom-variant dark (&:is(.dark *));

@layer theme {
  :root {
    --background: white;
    --foreground: var(--color-slate-900);
    --muted: var(--color-slate-100);
    --muted-foreground: var(--color-slate-700);
    --popover: white;
    --popover-foreground: var(--color-slate-900);
    --card: white;
    --card-foreground: var(--color-slate-900);
    --border: var(--color-slate-200);
    --input: var(--color-slate-200);
    --primary: oklch(74.1% 38.5% 234.357);
    --primary-foreground: black;
    --secondary: oklch(69.9% 46.25% 301.823);
    --secondary-foreground: black;
    --accent: var(--color-slate-100);
    --accent-foreground: var(--color-slate-900);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-slate-50);
    --ring: var(--color-slate-900);
    --border-width: 0px;
    --stroke-width: 1px;
    --border-radius: 0.25rem;
    --shadow-base: none;
    --shadow-2xs: 0 1px rgb(0 0 0 / 0.05);
    --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    --shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.01);
    --transform-press: scale(0.95);
  }

  .dark {
    --background: var(--color-slate-950);
    --foreground: var(--color-slate-50);
    --muted: var(--color-slate-800);
    --muted-foreground: var(--color-slate-300);
    --popover: var(--color-slate-950);
    --popover-foreground: var(--color-slate-50);
    --card: var(--color-slate-950);
    --card-foreground: var(--color-slate-50);
    --border: var(--color-slate-800);
    --input: var(--color-slate-800);
    --primary: oklch(74.1% 38.5% 234.357);
    --primary-foreground: black;
    --secondary: oklch(69.9% 46.25% 301.823);
    --secondary-foreground: black;
    --accent: var(--color-slate-700);
    --accent-foreground: var(--color-slate-50);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-slate-50);
    --ring: var(--color-slate-300);
    --border-width: 0px;
    --stroke-width: 1px;
    --border-radius: 0.25rem;
    --shadow-base: none;
    --shadow-2xs: 0 1px rgb(0 0 0 / 0.05);
    --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    --shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.01);
    --transform-press: scale(0.95);
  }

  @theme {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-alert: var(--alert);
    --color-alert-foreground: var(--alert-foreground);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --radius-xs: var(--border-radius);
    --radius-sm: calc(var(--border-radius) + 0.125rem);
    --radius-md: calc(var(--border-radius) + 0.375rem);
    --radius-lg: calc(var(--border-radius) + 0.5rem);
    --radius-xl: calc(var(--border-radius) + 0.75rem);
    --radius-2xl: calc(var(--border-radius) + 1rem);
    --radius-3xl: calc(var(--border-radius) + 1.5rem);
    --shadow-base: var(--shadow-base);
    --shadow-2xs: var(--shadow-2xs);
    --shadow-xs: var(--shadow-xs);
    --shadow-sm: var(--shadow-sm);
    --shadow-md: var(--shadow-md);
    --shadow-lg: var(--shadow-lg);
    --shadow-xl: var(--shadow-xl);
    --shadow-2xl: var(--shadow-2xl);
    --shadow-inner: var(--shadow-inner);
    --default-border-width: calc(var(--border-width) + 1px);
    --border-width-base: var(--border-width);
    --border-width-2: calc(var(--border-width) + 2px);
    --border-width-4: calc(var(--border-width) + 4px);
    --border-width-8: calc(var(--border-width) + 8px);
    --stroke-width-0: 0px;
    --stroke-width-base: var(--stroke-width);
    --stroke-width-1: calc(var(--stroke-width) + 1px);
    --stroke-width-2: calc(var(--stroke-width) + 2px);
    --animate-accordion-down: collapsible-down 0.2s ease-out forwards;
    --animate-accordion-up: collapsible-up 0.2s ease-out forwards;

    @keyframes collapsible-down {
      from {
        height: 0;
      }
      to {
        height: var(--qwikui-collapsible-content-height);
      }
    }
    @keyframes collapsible-up {
      from {
        height: var(--qwikui-collapsible-content-height);
      }
      to {
        height: 0;
      }
    }
  }
}

@utility press {
  transform: var(--transform-press);
}
@utility border-width-* {
  /* prettier-ignore */
  border: --value(--border-width-*);
}
@utility stroke-width-* {
  /* prettier-ignore */
  stroke: --value(--stroke-width-*);
}
@utility shadow-* {
  /* prettier-ignore */
  box-shadow: --value(--shadow-*);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}

@layer base {
  /* CSS PARSER: START - DO NOT REMOVE */
  .border-radius-0 {
    --border-radius: 0rem;
  }

  .border-radius-dot-25 {
    --border-radius: 0.25rem;
  }

  .border-radius-dot-50 {
    --border-radius: 0.5rem;
  }

  .border-radius-dot-75 {
    --border-radius: 0.75rem;
  }

  .border-radius-1 {
    --border-radius: 1rem;
  }

  .simple {
    --border-width: 0px;
    --stroke-width: 1px;
    --shadow-base: none;
    --shadow-2xs: 0 1px rgb(0 0 0 / 0.05);
    --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    --shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.01);
    --transform-press: scale(0.95);
  }

  .brutalist.brutalist {
    --border-width: 2px;
    --stroke-width: 2px;
    --border: black;
    --input: black;
    --ring: black;
    --shadow-base: 0px 1px rgba(0, 0, 0, 1);
    --shadow-2xs: 1px 2px rgba(0, 0, 0, 1);
    --shadow-xs: 3px 4px rgba(0, 0, 0, 1);
    --shadow-sm: 5px 6px rgba(0, 0, 0, 1);
    --shadow-md: 7px 8px rgba(0, 0, 0, 1);
    --shadow-lg: 9px 10px rgba(0, 0, 0, 1);
    --shadow-xl: 11px 12px rgba(0, 0, 0, 1);
    --shadow-2xl: 13px 14px rgba(0, 0, 0, 1);
    --shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.01);
    --transform-press: translate(4px, 4px);
  }

  .dark.brutalist.brutalist {
    --border-width: 3px;
    --stroke-width: 2px;
    --underline: 2px;
    --shadow-2xs: 0px 1px rgba(0, 0, 0, 1);
    --shadow-xs: 1px 2px rgba(0, 0, 0, 1);
    --shadow-sm: 3px 4px rgba(0, 0, 0, 1);
    --shadow-md: 5px 6px rgba(0, 0, 0, 1);
    --shadow-lg: 7px 8px rgba(0, 0, 0, 1);
    --shadow-xl: 9px 10px rgba(0, 0, 0, 1);
    --shadow-2xl: 11px 12px rgba(0, 0, 0, 1);
    --transform-press: translate(4px, 4px);
  }

  .neumorphic.neumorphic {
    --border-width: 0px;
    --stroke-width: 1px;
    --background: hsl(0 0 88%);
    --foreground: var(--color-zinc-900);
    --popover: hsl(0 0 88%);
    --popover-foreground: var(--color-zinc-900);
    --card: hsl(0 0 88%);
    --card-foreground: var(--color-zinc-900);
    --border: hsl(0 0% 80.2%);
    --ring: hsl(0 0% 80.2%);
    --input: hsl(0 0% 80.2%);
    --shadow-base:
      -3px -3px 6px #bebebe, 3px 3px 6px #ffffff,
      inset 1px 1px 2px rgba(190, 190, 190, 0.5),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    --shadow-2xs:
      -3px -3px 6px #bebebe, 3px 3px 6px #ffffff,
      inset 1px 1px 2px rgba(190, 190, 190, 0.5),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    --shadow-sm:
      3px 3px 6px #bebebe, -3px -3px 6px #ffffff,
      inset 1px 1px 2px rgba(190, 190, 190, 0.5),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    --shadow-md:
      4px 4px 8px #bebebe, -4px -4px 8px #ffffff,
      inset 1px 1px 2px rgba(190, 190, 190, 0.5),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    --shadow-lg:
      6px 6px 12px #bebebe, -6px -6px 12px #ffffff,
      inset 1px 1px 2px rgba(190, 190, 190, 0.5),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    --shadow-xl:
      8px 8px 15px #bebebe, -8px -8px 15px #ffffff,
      inset 1px 1px 2px rgba(190, 190, 190, 0.5),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    --shadow-2xl:
      10px 10px 20px #bebebe, -10px -10px 20px #ffffff,
      inset 1px 1px 2px rgba(190, 190, 190, 0.5),
      inset -1px -1px 2px rgba(255, 255, 255, 0.5);
    --shadow-inner: inset 4px 4px 8px #bebebe, inset -2px -2px 4px #ffffff;
    --transform-press: scale(0.95);
  }

  .dark.neumorphic.neumorphic {
    --border-width: 0px;
    --stroke-width: 1px;
    --background: var(--color-zinc-700);
    --foreground: var(--color-zinc-200);
    --popover: var(--color-zinc-700);
    --popover-foreground: var(--color-zinc-200);
    --card: var(--color-zinc-700);
    --card-foreground: var(--color-zinc-200);
    --border: hsl(240 5.9% 20%);
    --ring: hsl(240 5.9% 20%);
    --input: hsl(240 5.9% 20%);
    --shadow-base:
      -3px -3px 6px #2c2c31, 3px 3px 6px #52525b, inset 1px 1px 2px #2c2c31,
      inset -1px -1px 2px #52525b;
    --shadow-xs:
      3px 3px 6px #2c2c31, -3px -3px 6px #52525b, inset 1px 1px 2px #2c2c31,
      inset -1px -1px 2px #52525b;
    --shadow-sm:
      4px 4px 8px #2c2c31, -4px -4px 8px #52525b, inset 1px 1px 2px #2c2c31,
      inset -1px -1px 2px #52525b;
    --shadow-md:
      5px 5px 10px #2c2c31, -5px -5px 10px #52525b, inset 1px 1px 2px #2c2c31,
      inset -1px -1px 2px #52525b;
    --shadow-lg:
      6px 6px 12px #2c2c31, -6px -6px 12px #52525b, inset 1px 1px 2px #2c2c31,
      inset -1px -1px 2px #52525b;
    --shadow-xl:
      8px 8px 15px #2c2c31, -8px -8px 15px #52525b, inset 1px 1px 2px #2c2c31,
      inset -1px -1px 2px #52525b;
    --shadow-2xl:
      10px 10px 20px #2c2c31, -10px -10px 20px #52525b, inset 1px 1px 2px #2c2c31,
      inset -1px -1px 2px #52525b;
    --shadow-inner: inset 2px 2px 4px #2c2c31, inset -2px -2px 4px #52525b;
    --transform-press: scale(0.95);
  }

  /* use colors from colors.ts */

  .base-slate {
    --background: white;
    --foreground: var(--color-slate-950);
    --muted: var(--color-slate-100);
    --muted-foreground: var(--color-slate-700);
    --popover: white;
    --popover-foreground: var(--color-slate-900);
    --card: white;
    --card-foreground: var(--color-slate-900);
    --border: var(--color-slate-200);
    --input: var(--color-slate-200);
    --secondary: var(--color-slate-900);
    --secondary-foreground: white;
    --accent: var(--color-slate-100);
    --accent-foreground: var(--color-slate-900);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-slate-50);
    --ring: var(--color-slate-900);
  }
  .dark.base-slate {
    --background: var(--color-slate-950);
    --foreground: var(--color-slate-50);
    --muted: var(--color-slate-800);
    --muted-foreground: var(--color-slate-300);
    --popover: var(--color-slate-950);
    --popover-foreground: var(--color-slate-50);
    --card: var(--color-slate-950);
    --card-foreground: var(--color-slate-50);
    --border: var(--color-slate-800);
    --input: var(--color-slate-800);
    --secondary: var(--color-slate-100);
    --secondary-foreground: black;
    --accent: var(--color-slate-700);
    --accent-foreground: var(--color-slate-50);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-slate-50);
    --ring: var(--color-slate-300);
  }

  .base-gray {
    --background: white;
    --foreground: var(--color-gray-950);
    --muted: var(--color-gray-100);
    --muted-foreground: var(--color-gray-700);
    --popover: white;
    --popover-foreground: var(--color-gray-950);
    --card: white;
    --card-foreground: var(--color-gray-950);
    --border: var(--color-gray-200);
    --input: var(--color-gray-200);
    --secondary: var(--color-gray-950);
    --secondary-foreground: white;
    --accent: var(--color-gray-100);
    --accent-foreground: var(--color-gray-950);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-gray-50);
    --ring: var(--color-gray-950);
  }
  .dark.base-gray {
    --background: var(--color-gray-950);
    --foreground: var(--color-gray-50);
    --muted: var(--color-gray-800);
    --muted-foreground: var(--color-gray-300);
    --popover: var(--color-gray-950);
    --popover-foreground: var(--color-gray-50);
    --card: var(--color-gray-950);
    --card-foreground: var(--color-gray-50);
    --border: var(--color-gray-800);
    --input: var(--color-gray-800);
    --secondary: var(--color-gray-100);
    --secondary-foreground: black;
    --accent: var(--color-gray-700);
    --accent-foreground: var(--color-gray-50);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-gray-50);
    --ring: var(--color-gray-300);
  }

  .base-zinc {
    --background: white;
    --foreground: var(--color-zinc-900);
    --muted: var(--color-zinc-100);
    --muted-foreground: var(--color-zinc-700);
    --popover: white;
    --popover-foreground: var(--color-zinc-900);
    --card: white;
    --card-foreground: var(--color-zinc-900);
    --border: var(--color-zinc-200);
    --input: var(--color-zinc-200);
    --secondary: var(--color-zinc-900);
    --secondary-foreground: white;
    --accent: var(--color-zinc-100);
    --accent-foreground: var(--color-zinc-900);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-zinc-50);
    --ring: var(--color-zinc-900);
  }
  .dark.base-zinc {
    --background: var(--color-zinc-950);
    --foreground: var(--color-zinc-50);
    --muted: var(--color-zinc-800);
    --muted-foreground: var(--color-zinc-300);
    --popover: var(--color-zinc-950);
    --popover-foreground: var(--color-zinc-50);
    --card: var(--color-zinc-950);
    --card-foreground: var(--color-zinc-50);
    --border: var(--color-zinc-800);
    --input: var(--color-zinc-800);
    --secondary: var(--color-zinc-100);
    --secondary-foreground: black;
    --accent: var(--color-zinc-700);
    --accent-foreground: var(--color-zinc-50);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-zinc-50);
    --ring: var(--color-zinc-300);
  }

  .base-neutral {
    --background: white;
    --foreground: var(--color-neutral-900);
    --muted: var(--color-neutral-100);
    --muted-foreground: var(--color-neutral-700);
    --popover: white;
    --popover-foreground: var(--color-neutral-900);
    --card: white;
    --card-foreground: var(--color-neutral-900);
    --border: var(--color-neutral-200);
    --input: var(--color-neutral-200);
    --secondary: var(--color-neutral-900);
    --secondary-foreground: white;
    --accent: var(--color-neutral-100);
    --accent-foreground: var(--color-neutral-900);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-neutral-50);
    --ring: var(--color-neutral-900);
  }
  .dark.base-neutral {
    --background: var(--color-neutral-950);
    --foreground: var(--color-neutral-50);
    --muted: var(--color-neutral-800);
    --muted-foreground: var(--color-neutral-300);
    --popover: var(--color-neutral-950);
    --popover-foreground: var(--color-neutral-50);
    --card: var(--color-neutral-950);
    --card-foreground: var(--color-neutral-50);
    --border: var(--color-neutral-800);
    --input: var(--color-neutral-800);
    --secondary: var(--color-neutral-100);
    --secondary-foreground: black;
    --accent: var(--color-neutral-700);
    --accent-foreground: var(--color-neutral-50);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-neutral-50);
    --ring: var(--color-neutral-300);
  }

  .base-stone {
    --background: white;
    --foreground: var(--color-stone-900);
    --muted: var(--color-stone-100);
    --muted-foreground: var(--color-stone-700);
    --popover: white;
    --popover-foreground: var(--color-stone-900);
    --card: white;
    --card-foreground: var(--color-stone-900);
    --border: var(--color-stone-200);
    --input: var(--color-stone-200);
    --secondary: var(--color-stone-900);
    --secondary-foreground: white;
    --accent: var(--color-stone-100);
    --accent-foreground: var(--color-stone-900);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-stone-50);
    --ring: var(--color-stone-900);
  }
  .dark.base-stone {
    --background: var(--color-stone-950);
    --foreground: var(--color-stone-50);
    --muted: var(--color-stone-800);
    --muted-foreground: var(--color-stone-300);
    --popover: var(--color-stone-950);
    --popover-foreground: var(--color-stone-50);
    --card: var(--color-stone-950);
    --card-foreground: var(--color-stone-50);
    --border: var(--color-stone-800);
    --input: var(--color-stone-800);
    --secondary: var(--color-stone-100);
    --secondary-foreground: black;
    --accent: var(--color-stone-700);
    --accent-foreground: var(--color-stone-50);
    --alert: var(--color-red-500);
    --alert-foreground: var(--color-stone-50);
    --ring: var(--color-stone-300);
  }

  .primary-slate-100,
  .dark.primary-slate-900 {
    --primary: var(--color-slate-100);
    --primary-foreground: black;
  }
  .primary-slate-200,
  .dark.primary-slate-800 {
    --primary: var(--color-slate-200);
    --primary-foreground: black;
  }
  .primary-slate-300 {
    --primary: var(--color-slate-300);
    --primary-foreground: black;
  }
  .primary-slate-400 {
    --primary: var(--color-slate-400);
    --primary-foreground: black;
  }
  .primary-slate-500 {
    --primary: var(--color-slate-500);
    --primary-foreground: white;
  }
  .primary-slate-600 {
    --primary: var(--color-slate-600);
    --primary-foreground: white;
  }
  .primary-slate-700 {
    --primary: var(--color-slate-700);
    --primary-foreground: white;
  }
  .primary-slate-800 {
    --primary: var(--color-slate-800);
    --primary-foreground: white;
  }
  .primary-slate-900 {
    --primary: var(--color-slate-900);
    --primary-foreground: white;
  }

  .primary-gray-100,
  .dark.primary-gray-900 {
    --primary: var(--color-gray-100);
    --primary-foreground: black;
  }
  .primary-gray-200,
  .dark.primary-gray-800 {
    --primary: var(--color-gray-200);
    --primary-foreground: black;
  }
  .primary-gray-300 {
    --primary: var(--color-gray-300);
    --primary-foreground: black;
  }
  .primary-gray-400 {
    --primary: var(--color-gray-400);
    --primary-foreground: black;
  }
  .primary-gray-500 {
    --primary: var(--color-gray-500);
    --primary-foreground: white;
  }
  .primary-gray-600 {
    --primary: var(--color-gray-600);
    --primary-foreground: white;
  }
  .primary-gray-700 {
    --primary: var(--color-gray-700);
    --primary-foreground: white;
  }
  .primary-gray-800 {
    --primary: var(--color-gray-800);
    --primary-foreground: white;
  }
  .primary-gray-900 {
    --primary: var(--color-gray-950);
    --primary-foreground: white;
  }

  .primary-zinc-100,
  .dark.primary-zinc-900 {
    --primary: var(--color-zinc-100);
    --primary-foreground: black;
  }
  .primary-zinc-200,
  .dark.primary-zinc-800 {
    --primary: var(--color-zinc-200);
    --primary-foreground: black;
  }
  .primary-zinc-300 {
    --primary: var(--color-zinc-300);
    --primary-foreground: black;
  }
  .primary-zinc-400 {
    --primary: var(--color-zinc-400);
    --primary-foreground: black;
  }
  .primary-zinc-500 {
    --primary: var(--color-zinc-500);
    --primary-foreground: white;
  }
  .primary-zinc-600 {
    --primary: var(--color-zinc-600);
    --primary-foreground: white;
  }
  .primary-zinc-700 {
    --primary: var(--color-zinc-700);
    --primary-foreground: white;
  }
  .primary-zinc-800 {
    --primary: var(--color-zinc-800);
    --primary-foreground: white;
  }
  .primary-zinc-900 {
    --primary: var(--color-zinc-900);
    --primary-foreground: white;
  }

  .primary-neutral-100,
  .dark.primary-neutral-900 {
    --primary: var(--color-neutral-100);
    --primary-foreground: black;
  }
  .primary-neutral-200,
  .dark.primary-neutral-800 {
    --primary: var(--color-neutral-200);
    --primary-foreground: black;
  }
  .primary-neutral-300 {
    --primary: var(--color-neutral-300);
    --primary-foreground: black;
  }
  .primary-neutral-400 {
    --primary: var(--color-neutral-400);
    --primary-foreground: black;
  }
  .primary-neutral-500 {
    --primary: var(--color-neutral-500);
    --primary-foreground: white;
  }
  .primary-neutral-600 {
    --primary: var(--color-neutral-600);
    --primary-foreground: white;
  }
  .primary-neutral-700 {
    --primary: var(--color-neutral-700);
    --primary-foreground: white;
  }
  .primary-neutral-800 {
    --primary: var(--color-neutral-800);
    --primary-foreground: white;
  }
  .primary-neutral-900 {
    --primary: var(--color-neutral-900);
    --primary-foreground: white;
  }

  .primary-stone-100,
  .dark.primary-stone-900 {
    --primary: var(--color-stone-100);
    --primary-foreground: black;
  }
  .primary-stone-200,
  .dark.primary-stone-800 {
    --primary: var(--color-stone-200);
    --primary-foreground: black;
  }
  .primary-stone-300 {
    --primary: var(--color-stone-300);
    --primary-foreground: black;
  }
  .primary-stone-400 {
    --primary: var(--color-stone-400);
    --primary-foreground: black;
  }
  .primary-stone-500 {
    --primary: var(--color-stone-500);
    --primary-foreground: white;
  }
  .primary-stone-600 {
    --primary: var(--color-stone-600);
    --primary-foreground: white;
  }
  .primary-stone-700 {
    --primary: var(--color-stone-700);
    --primary-foreground: white;
  }
  .primary-stone-800 {
    --primary: var(--color-stone-800);
    --primary-foreground: white;
  }
  .primary-stone-900 {
    --primary: var(--color-stone-900);
    --primary-foreground: white;
  }

  .primary-red-100 {
    --primary: var(--color-red-100);
    --primary-foreground: black;
  }
  .primary-red-200 {
    --primary: var(--color-red-200);
    --primary-foreground: black;
  }
  .primary-red-300 {
    --primary: var(--color-red-300);
    --primary-foreground: black;
  }
  .primary-red-400 {
    --primary: var(--color-red-400);
    --primary-foreground: black;
  }
  .primary-red-500 {
    --primary: var(--color-red-500);
    --primary-foreground: white;
  }
  .primary-red-600 {
    --primary: var(--color-red-600);
    --primary-foreground: white;
  }
  .primary-red-700 {
    --primary: var(--color-red-700);
    --primary-foreground: white;
  }
  .primary-red-800 {
    --primary: var(--color-red-800);
    --primary-foreground: white;
  }
  .primary-red-900 {
    --primary: var(--color-red-900);
    --primary-foreground: white;
  }

  .primary-orange-100 {
    --primary: var(--color-orange-100);
    --primary-foreground: black;
  }
  .primary-orange-200 {
    --primary: var(--color-orange-200);
    --primary-foreground: black;
  }
  .primary-orange-300 {
    --primary: var(--color-orange-300);
    --primary-foreground: black;
  }
  .primary-orange-400 {
    --primary: var(--color-orange-400);
    --primary-foreground: black;
  }
  .primary-orange-500 {
    --primary: var(--color-orange-500);
    --primary-foreground: black;
  }
  .primary-orange-600 {
    --primary: var(--color-orange-600);
    --primary-foreground: white;
  }
  .primary-orange-700 {
    --primary: var(--color-orange-700);
    --primary-foreground: white;
  }
  .primary-orange-800 {
    --primary: var(--color-orange-800);
    --primary-foreground: white;
  }
  .primary-orange-900 {
    --primary: var(--color-orange-900);
    --primary-foreground: white;
  }

  .primary-amber-100 {
    --primary: var(--color-amber-100);
    --primary-foreground: black;
  }
  .primary-amber-200 {
    --primary: var(--color-amber-200);
    --primary-foreground: black;
  }
  .primary-amber-300 {
    --primary: var(--color-amber-300);
    --primary-foreground: black;
  }
  .primary-amber-400 {
    --primary: var(--color-amber-400);
    --primary-foreground: black;
  }
  .primary-amber-500 {
    --primary: var(--color-amber-500);
    --primary-foreground: black;
  }
  .primary-amber-600 {
    --primary: var(--color-amber-600);
    --primary-foreground: white;
  }
  .primary-amber-700 {
    --primary: var(--color-amber-700);
    --primary-foreground: white;
  }
  .primary-amber-800 {
    --primary: var(--color-amber-800);
    --primary-foreground: white;
  }
  .primary-amber-900 {
    --primary: var(--color-amber-900);
    --primary-foreground: white;
  }

  .primary-yellow-100 {
    --primary: var(--color-yellow-100);
    --primary-foreground: black;
  }
  .primary-yellow-200 {
    --primary: var(--color-yellow-200);
    --primary-foreground: black;
  }
  .primary-yellow-300 {
    --primary: var(--color-yellow-300);
    --primary-foreground: black;
  }
  .primary-yellow-400 {
    --primary: var(--color-yellow-400);
    --primary-foreground: black;
  }
  .primary-yellow-500 {
    --primary: var(--color-yellow-500);
    --primary-foreground: black;
  }
  .primary-yellow-600 {
    --primary: var(--color-yellow-600);
    --primary-foreground: white;
  }
  .primary-yellow-700 {
    --primary: var(--color-yellow-700);
    --primary-foreground: white;
  }
  .primary-yellow-800 {
    --primary: var(--color-yellow-800);
    --primary-foreground: white;
  }
  .primary-yellow-900 {
    --primary: var(--color-yellow-900);
    --primary-foreground: white;
  }

  .primary-lime-100 {
    --primary: var(--color-lime-100);
    --primary-foreground: black;
  }
  .primary-lime-200 {
    --primary: var(--color-lime-200);
    --primary-foreground: black;
  }
  .primary-lime-300 {
    --primary: var(--color-lime-300);
    --primary-foreground: black;
  }
  .primary-lime-400 {
    --primary: var(--color-lime-400);
    --primary-foreground: black;
  }
  .primary-lime-500 {
    --primary: var(--color-lime-500);
    --primary-foreground: black;
  }
  .primary-lime-600 {
    --primary: var(--color-lime-600);
    --primary-foreground: white;
  }
  .primary-lime-700 {
    --primary: var(--color-lime-700);
    --primary-foreground: white;
  }
  .primary-lime-800 {
    --primary: var(--color-lime-800);
    --primary-foreground: white;
  }
  .primary-lime-900 {
    --primary: var(--color-lime-900);
    --primary-foreground: white;
  }

  .primary-green-100 {
    --primary: var(--color-green-100);
    --primary-foreground: black;
  }
  .primary-green-200 {
    --primary: var(--color-green-200);
    --primary-foreground: black;
  }
  .primary-green-300 {
    --primary: var(--color-green-300);
    --primary-foreground: black;
  }
  .primary-green-400 {
    --primary: var(--color-green-400);
    --primary-foreground: black;
  }
  .primary-green-500 {
    --primary: var(--color-green-500);
    --primary-foreground: black;
  }
  .primary-green-600 {
    --primary: var(--color-green-600);
    --primary-foreground: white;
  }
  .primary-green-700 {
    --primary: var(--color-green-700);
    --primary-foreground: white;
  }
  .primary-green-800 {
    --primary: var(--color-green-800);
    --primary-foreground: white;
  }
  .primary-green-900 {
    --primary: var(--color-green-900);
    --primary-foreground: white;
  }

  .primary-emerald-100 {
    --primary: var(--color-emerald-100);
    --primary-foreground: black;
  }
  .primary-emerald-200 {
    --primary: var(--color-emerald-200);
    --primary-foreground: black;
  }
  .primary-emerald-300 {
    --primary: var(--color-emerald-300);
    --primary-foreground: black;
  }
  .primary-emerald-400 {
    --primary: var(--color-emerald-400);
    --primary-foreground: black;
  }
  .primary-emerald-500 {
    --primary: var(--color-emerald-500);
    --primary-foreground: black;
  }
  .primary-emerald-600 {
    --primary: var(--color-emerald-600);
    --primary-foreground: white;
  }
  .primary-emerald-700 {
    --primary: var(--color-emerald-700);
    --primary-foreground: white;
  }
  .primary-emerald-800 {
    --primary: var(--color-emerald-800);
    --primary-foreground: white;
  }
  .primary-emerald-900 {
    --primary: var(--color-emerald-900);
    --primary-foreground: white;
  }

  .primary-teal-100 {
    --primary: var(--color-teal-100);
    --primary-foreground: black;
  }
  .primary-teal-200 {
    --primary: var(--color-teal-200);
    --primary-foreground: black;
  }
  .primary-teal-300 {
    --primary: var(--color-teal-300);
    --primary-foreground: black;
  }
  .primary-teal-400 {
    --primary: var(--color-teal-400);
    --primary-foreground: black;
  }
  .primary-teal-500 {
    --primary: var(--color-teal-500);
    --primary-foreground: black;
  }
  .primary-teal-600 {
    --primary: var(--color-teal-600);
    --primary-foreground: white;
  }
  .primary-teal-700 {
    --primary: var(--color-teal-700);
    --primary-foreground: white;
  }
  .primary-teal-800 {
    --primary: var(--color-teal-800);
    --primary-foreground: white;
  }
  .primary-teal-900 {
    --primary: var(--color-teal-900);
    --primary-foreground: white;
  }

  .primary-cyan-100 {
    --primary: var(--color-cyan-100);
    --primary-foreground: black;
  }
  .primary-cyan-200 {
    --primary: var(--color-cyan-200);
    --primary-foreground: black;
  }
  .primary-cyan-300 {
    --primary: var(--color-cyan-300);
    --primary-foreground: black;
  }
  .primary-cyan-400 {
    --primary: var(--color-cyan-400);
    --primary-foreground: black;
  }
  .primary-cyan-500 {
    --primary: var(--color-cyan-500);
    --primary-foreground: black;
  }
  .primary-cyan-600 {
    --primary: var(--color-cyan-600);
    --primary-foreground: white;
  }
  .primary-cyan-700 {
    --primary: var(--color-cyan-700);
    --primary-foreground: white;
  }
  .primary-cyan-800 {
    --primary: var(--color-cyan-800);
    --primary-foreground: white;
  }
  .primary-cyan-900 {
    --primary: var(--color-cyan-900);
    --primary-foreground: white;
  }

  .primary-sky-100 {
    --primary: var(--color-sky-100);
    --primary-foreground: black;
  }
  .primary-sky-200 {
    --primary: var(--color-sky-200);
    --primary-foreground: black;
  }
  .primary-sky-300 {
    --primary: var(--color-sky-300);
    --primary-foreground: black;
  }
  .primary-sky-400 {
    --primary: var(--color-sky-400);
    --primary-foreground: black;
  }
  .primary-sky-500 {
    --primary: var(--color-sky-500);
    --primary-foreground: black;
  }
  .primary-sky-600 {
    --primary: var(--color-sky-600);
    --primary-foreground: white;
  }
  .primary-sky-700 {
    --primary: var(--color-sky-700);
    --primary-foreground: white;
  }
  .primary-sky-800 {
    --primary: var(--color-sky-800);
    --primary-foreground: white;
  }
  .primary-sky-900 {
    --primary: var(--color-sky-900);
    --primary-foreground: white;
  }

  .primary-blue-100 {
    --primary: var(--color-blue-100);
    --primary-foreground: black;
  }
  .primary-blue-200 {
    --primary: var(--color-blue-200);
    --primary-foreground: black;
  }
  .primary-blue-300 {
    --primary: var(--color-blue-300);
    --primary-foreground: black;
  }
  .primary-blue-400 {
    --primary: var(--color-blue-400);
    --primary-foreground: black;
  }
  .primary-blue-500 {
    --primary: var(--color-blue-500);
    --primary-foreground: white;
  }
  .primary-blue-600 {
    --primary: var(--color-blue-600);
    --primary-foreground: white;
  }
  .primary-blue-700 {
    --primary: var(--color-blue-700);
    --primary-foreground: white;
  }
  .primary-blue-800 {
    --primary: var(--color-blue-800);
    --primary-foreground: white;
  }
  .primary-blue-900 {
    --primary: var(--color-blue-900);
    --primary-foreground: white;
  }

  .primary-indigo-100 {
    --primary: var(--color-indigo-100);
    --primary-foreground: black;
  }
  .primary-indigo-200 {
    --primary: var(--color-indigo-200);
    --primary-foreground: black;
  }
  .primary-indigo-300 {
    --primary: var(--color-indigo-300);
    --primary-foreground: black;
  }
  .primary-indigo-400 {
    --primary: var(--color-indigo-400);
    --primary-foreground: black;
  }
  .primary-indigo-500 {
    --primary: var(--color-indigo-500);
    --primary-foreground: white;
  }
  .primary-indigo-600 {
    --primary: var(--color-indigo-600);
    --primary-foreground: white;
  }
  .primary-indigo-700 {
    --primary: var(--color-indigo-700);
    --primary-foreground: white;
  }
  .primary-indigo-800 {
    --primary: var(--color-indigo-800);
    --primary-foreground: white;
  }
  .primary-indigo-900 {
    --primary: var(--color-indigo-900);
    --primary-foreground: white;
  }

  .primary-violet-100 {
    --primary: var(--color-violet-100);
    --primary-foreground: black;
  }
  .primary-violet-200 {
    --primary: var(--color-violet-200);
    --primary-foreground: black;
  }
  .primary-violet-300 {
    --primary: var(--color-violet-300);
    --primary-foreground: black;
  }
  .primary-violet-400 {
    --primary: var(--color-violet-400);
    --primary-foreground: black;
  }
  .primary-violet-500 {
    --primary: var(--color-violet-500);
    --primary-foreground: white;
  }
  .primary-violet-600 {
    --primary: var(--color-violet-600);
    --primary-foreground: white;
  }
  .primary-violet-700 {
    --primary: var(--color-violet-700);
    --primary-foreground: white;
  }
  .primary-violet-800 {
    --primary: var(--color-violet-800);
    --primary-foreground: white;
  }
  .primary-violet-900 {
    --primary: var(--color-violet-900);
    --primary-foreground: white;
  }

  .primary-purple-100 {
    --primary: var(--color-purple-100);
    --primary-foreground: black;
  }
  .primary-purple-200 {
    --primary: var(--color-purple-200);
    --primary-foreground: black;
  }
  .primary-purple-300 {
    --primary: var(--color-purple-300);
    --primary-foreground: black;
  }
  .primary-purple-400 {
    --primary: var(--color-purple-400);
    --primary-foreground: black;
  }
  .primary-purple-500 {
    --primary: var(--color-purple-500);
    --primary-foreground: white;
  }
  .primary-purple-600 {
    --primary: var(--color-purple-600);
    --primary-foreground: white;
  }
  .primary-purple-700 {
    --primary: var(--color-purple-700);
    --primary-foreground: white;
  }
  .primary-purple-800 {
    --primary: var(--color-purple-800);
    --primary-foreground: white;
  }
  .primary-purple-900 {
    --primary: var(--color-purple-900);
    --primary-foreground: white;
  }

  .primary-fuchsia-100 {
    --primary: var(--color-fuchsia-100);
    --primary-foreground: black;
  }
  .primary-fuchsia-200 {
    --primary: var(--color-fuchsia-200);
    --primary-foreground: black;
  }
  .primary-fuchsia-300 {
    --primary: var(--color-fuchsia-300);
    --primary-foreground: black;
  }
  .primary-fuchsia-400 {
    --primary: var(--color-fuchsia-400);
    --primary-foreground: black;
  }
  .primary-fuchsia-500 {
    --primary: var(--color-fuchsia-500);
    --primary-foreground: white;
  }
  .primary-fuchsia-600 {
    --primary: var(--color-fuchsia-600);
    --primary-foreground: white;
  }
  .primary-fuchsia-700 {
    --primary: var(--color-fuchsia-700);
    --primary-foreground: white;
  }
  .primary-fuchsia-800 {
    --primary: var(--color-fuchsia-800);
    --primary-foreground: white;
  }
  .primary-fuchsia-900 {
    --primary: var(--color-fuchsia-900);
    --primary-foreground: white;
  }

  .primary-pink-100 {
    --primary: var(--color-pink-100);
    --primary-foreground: black;
  }
  .primary-pink-200 {
    --primary: var(--color-pink-200);
    --primary-foreground: black;
  }
  .primary-pink-300 {
    --primary: var(--color-pink-300);
    --primary-foreground: black;
  }
  .primary-pink-400 {
    --primary: var(--color-pink-400);
    --primary-foreground: black;
  }
  .primary-pink-500 {
    --primary: var(--color-pink-500);
    --primary-foreground: white;
  }
  .primary-pink-600 {
    --primary: var(--color-pink-600);
    --primary-foreground: white;
  }
  .primary-pink-700 {
    --primary: var(--color-pink-700);
    --primary-foreground: white;
  }
  .primary-pink-800 {
    --primary: var(--color-pink-800);
    --primary-foreground: white;
  }
  .primary-pink-900 {
    --primary: var(--color-pink-900);
    --primary-foreground: white;
  }

  .primary-rose-100 {
    --primary: var(--color-rose-100);
    --primary-foreground: black;
  }
  .primary-rose-200 {
    --primary: var(--color-rose-200);
    --primary-foreground: black;
  }
  .primary-rose-300 {
    --primary: var(--color-rose-300);
    --primary-foreground: black;
  }
  .primary-rose-400 {
    --primary: var(--color-rose-400);
    --primary-foreground: black;
  }
  .primary-rose-500 {
    --primary: var(--color-rose-500);
    --primary-foreground: white;
  }
  .primary-rose-600 {
    --primary: var(--color-rose-600);
    --primary-foreground: white;
  }
  .primary-rose-700 {
    --primary: var(--color-rose-700);
    --primary-foreground: white;
  }
  .primary-rose-800 {
    --primary: var(--color-rose-800);
    --primary-foreground: white;
  }
  .primary-rose-900 {
    --primary: var(--color-rose-900);
    --primary-foreground: white;
  }
  /* CSS PARSER: END - DO NOT REMOVE */
}

/* DOCS */
@layer base {
  p code {
    @apply rounded-sm border-b-2 bg-accent px-2 py-0.5;
  }
  pre code {
    @apply whitespace-pre-wrap;
  }

  *::-webkit-scrollbar {
    background-color: transparent;
    width: 1rem;
    height: 1rem;
  }

  *::-webkit-scrollbar-thumb {
    /* Thumb color */
    background-color: hsla(var(--foreground) / 0.25);
    border-radius: 0.4rem;
    background-clip: padding-box;
    border-left: 0.3rem solid transparent;
    border-right: 0.3rem solid transparent;
  }

  .navigation-docs::-webkit-scrollbar-thumb {
    background-color: hsla(var(--foreground) / 0.1);
  }

  .dark .navigation-docs::-webkit-scrollbar-thumb {
    background-color: hsla(var(--foreground) / 0.2);
  }

  *::-webkit-scrollbar-corner {
    background: transparent;
  }

  *::-webkit-scrollbar-track {
    background: transparent;
    border-left: 0;
  }

  .toc-scrollbar::-webkit-scrollbar-track,
  .dark .toc-scrollbar::-webkit-scrollbar-track {
    border-color: transparent;
  }

  .toc-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
  }

  .toc-scrollbar:hover.toc-scrollbar::-webkit-scrollbar-thumb {
    background-color: hsla(var(--foreground) / 0.15);
  }

  .dark *::-webkit-scrollbar-track {
    background: transparent;
    border-left: 0;
  }

  .code-example *::-webkit-scrollbar-track {
    background: transparent;
    border: 0px;
  }

  .code-example *::-webkit-scrollbar-thumb {
    background-color: var(--qwikui-slate-600);
    border-radius: 0.5rem;
    background-clip: padding-box;
  }

  /* no horizontal overflow on code snippets */
  .tab-size pre {
    white-space: pre-wrap;
    background: transparent !important;
  }

  .note-link a {
    border-bottom: 1px solid var(--qwikui-slate-950) !important;
  }

  .dark .note-link a {
    border-bottom: 1px solid white !important;
  }

  .gif-container {
    border-radius: var(--border-radius);
  }
}

@utility accordion-animation-1 {
  &[data-open] {
    animation: 500ms cubic-bezier(0.87, 0, 0.13, 1) 0s 1 normal forwards accordion-open;
  }

  &[data-closed] {
    animation: 500ms cubic-bezier(0.87, 0, 0.13, 1) 0s 1 normal forwards accordion-close;
  }
}
`;export{$d as e,Ld as g};
