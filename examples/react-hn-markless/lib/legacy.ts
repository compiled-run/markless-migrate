/** Sends an old app's hash link (`/#/story/1`) to the same page at its real path before anything renders. */
export const HASH_LINKS =
	"if(location.hash.indexOf('#/')===0)location.replace(location.hash.slice(1))";

/** The old index.html's own script: it unregistered every service worker an earlier version had installed. */
export const UNREGISTER_WORKERS =
	"if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(reg){reg.unregister()})})}";
