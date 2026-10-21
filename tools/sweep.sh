#!/bin/bash
# Load every scene headlessly and collect warnings/exceptions + a screenshot.
# usage: tools/sweep.sh <outDir> [parallelism]
OUT=${1:?outDir}; P=${2:-4}
mkdir -p "$OUT"
cd "$(dirname "$0")/.."
SCENES=$(node -e "
import('./src/formats/cnv.ts').then(({decodeText,parseDefinitions})=>{
  const d=parseDefinitions(decodeText(require('fs').readFileSync('game/DANE/Application.def')));
  console.log(d.filter(o=>o.props.get('TYPE')==='SCENE').map(o=>o.name).join('\n'));
})" 2>/dev/null)
echo "$SCENES" | xargs -P "$P" -I{} sh -c 'timeout 60 node tools/drive.ts "http://127.0.0.1:5173/?scene={}" "'"$OUT"'" wait:7000 shot:{} > "'"$OUT"'/{}.log" 2>&1'
echo "done: $(echo "$SCENES" | wc -l) scenes"
