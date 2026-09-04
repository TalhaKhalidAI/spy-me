const fs = require('fs');
const { SourceMapConsumer } = require('source-map');

async function check() {
  const mapFile = fs.readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.js.map'));
  if (!mapFile) return console.log('No sourcemap found');
  
  const rawSourceMap = JSON.parse(fs.readFileSync('dist/assets/' + mapFile, 'utf8'));
  const consumer = await new SourceMapConsumer(rawSourceMap);
  
  const jsFile = mapFile.replace('.map', '');
  const jsContent = fs.readFileSync('dist/assets/' + jsFile, 'utf8');
  
  // Find "Cannot access 'Ne'" or look for Ne
  const match = jsContent.match(/(const|let|var)\s+Ne\s*=/);
  if (match) {
    const lines = jsContent.substring(0, match.index).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length;
    
    const pos = consumer.originalPositionFor({ line, column });
    console.log('Ne maps to:', pos);
  } else {
    console.log('Ne definition not found via regex.');
  }
}
check();
