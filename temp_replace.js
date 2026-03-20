const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.jsx') || file.endsWith('.js')) results.push(file);
    }
  });
  return results;
}

const files = walk('d:/Documents/fintreelmsgitcode/fintree-lms/Frontend/src/components');
let count = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let replaced = false;
  const target = '<div className="spinner-container"><div className="spinner"></div></div>';
  
  if (content.includes('<p>Loading...</p>')) {
    content = content.split('<p>Loading...</p>').join(target);
    replaced = true;
  }
  if (content.includes('<p className="loading-text">Loading...</p>')) {
    content = content.split('<p className="loading-text">Loading...</p>').join(target);
    replaced = true;
  }
  if (content.includes('<p style={{ padding: 16 }}>Loading...</p>')) {
    content = content.split('<p style={{ padding: 16 }}>Loading...</p>').join(target);
    replaced = true;
  }
  if (content.includes('<div>Loading...</div>')) {
    content = content.split('<div>Loading...</div>').join(target);
    replaced = true;
  }

  if (replaced) {
    fs.writeFileSync(file, content);
    console.log('Updated: ' + file);
    count++;
  }
});

console.log('Total files updated: ' + count);
