#!/usr/bin/env bash
# Scratch (owner-approved measurement): Lighthouse mobile, original against port, interleaved. <out.tsv> <runs> <old> <new> <route...>
out=$1; runs=$2; old=$3; new=$4; shift 4
export CHROME_PATH=$(node -e "console.log(require('playwright').chromium.executablePath())")
mkdir -p lh
for r in $(seq 1 $runs); do for route in "$@"; do for side in old new; do
	origin=$([ $side = old ] && echo $old || echo $new)
	f=lh/$side-$(echo $route | tr / _)-$r.json
	npx --no-install lighthouse "$origin$route" --only-categories=performance --output=json --output-path=$f --chrome-flags="--headless=new --no-sandbox" --quiet > /dev/null 2>&1
	node -e "
const a=require('./$f').audits;const n=a['network-requests']?.details?.items??[];
console.log(['$side','$route',$r,...['first-contentful-paint','largest-contentful-paint','total-blocking-time','speed-index'].map(k=>Math.round(a[k]?.numericValue??-1)),n.length].join('\t'))" >> $out
done; done; done
