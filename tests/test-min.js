/*!banner*/
function Nop(){}
!function(d,g){function h(a,e,c){a[e]||(a[e]=function(){return(a[e]=new Function("a,b,c,d",c)).apply(this,arguments)})}function f(a,e,c){var b=k.shift()||new XMLHttpRequest;b.open(a,e,!0!==c);!0!==c&&(b.onreadystatechange=function(){4==b.readyState&&(a=b.status,c&&c.call(b,(200>a||299<a)&&a,b.responseText),b.onreadystatechange=c=Nop,k.push(b))});return b}function l(a,e){"string"==typeof a&&(a=[a]);for(var c=a.length,b=c,d=[];b--;)!function(b){f("GET",a[b],function(a,f){d[b]=f;--c||(execScript(d.join("/**/;")),
e&&e(),d=null)}).send()}(b)}var k=[];h(d,"XMLHttpRequest","return new ActiveXObject('MSXML2.XMLHTTP')");!d.execScript&&Function("d,Date","return(1,eval)('(Date)')===d")(Date,1)&&(d.execScript=eval);h(d,"execScript","d=document;b=d.body;c=d.createElement('script');c.text=a;b.insertBefore(c,b.firstChild)");Function.prototype.bind||g.unshift("up.js");l(g);f.load=l;d.xhr=f}(this,[]);var abc=0;"toggle";var ABC=0;"toggle2";var ab=1;
//# sourceMappingURL=tests/test-min.js.map
