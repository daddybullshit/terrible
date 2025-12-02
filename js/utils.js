const fs = require('fs');
const path = require('path');

function scanDir(dir, recursive = false, absolute = true) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (recursive) {
        results = results.concat(scanDir(filePath, true, absolute));
      }
    } else {
      results.push(absolute ? filePath : path.relative(process.cwd(), filePath));
    }
  });
  return results;
}

module.exports = { scanDir };
