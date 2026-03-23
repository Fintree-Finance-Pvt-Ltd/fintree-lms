const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'Backend', 'routes', 'dashboardRoutes.js');
let content = fs.readFileSync(targetPath, 'utf8');

// List of endpoints to wrap
const endpoints = [
    { name: 'disbursal-trend', params: ['product', 'from', 'to'] },
    { name: 'repayment-trend', params: ['product', 'from', 'to'] },
    { name: 'collection-vs-due', params: ['product', 'from', 'to'] },
    { name: 'product-distribution', params: ['from', 'to'] }
];

endpoints.forEach(ep => {
    // Regex to match the route start
    const startRegex = new RegExp(`router\\.post\\("/${ep.name}",\\s*async\\s*\\(req,\\s*res\\)\\s*=>\\s*\\{`, 'g');
    
    // Replacement for start
    const startReplace = (match) => {
        let cacheKeyParts = [`'${ep.name}'`];
        ep.params.forEach(p => cacheKeyParts.push(`${p} || ''`));
        const cacheKey = `\`${ep.name}:\${${ep.params.map(p => `${p} || ''`).join('}:\${')}}\``;
        
        return `router.post("/${ep.name}", async (req, res) => {
  try {
    const { ${ep.params.join(', ')} } = req.body || {};
    const cacheKey = ${cacheKey};
    const result = await withCache(cacheKey, 300, async () => {`;
    };

    if (startRegex.test(content)) {
        content = content.replace(startRegex, startReplace);
        
        // Now find the corresponding end and replace res.json with return
        // This is tricky because of nested blocks, but for these simple union routes, 
        // they usually end with res.json(rows) or similar.
        
        const resJsonRegex = new RegExp(`res\\.json\\(rows\\);[\\s\\S]*?\\}\\s*catch`, 'm');
        if (resJsonRegex.test(content)) {
            content = content.replace(resJsonRegex, (match) => {
                return `return rows;\n    });\n    res.json(result);\n  } catch`;
            });
        }
        
        // Special case for product-distribution which has a bit more logic
        if (ep.name === 'product-distribution') {
             const pdResRegex = /res\.json\([\s\S]*?Object\.entries\(productMap\)[\s\S]*?\}\);/;
             if (pdResRegex.test(content)) {
                 content = content.replace(pdResRegex, (match) => {
                     return `return Object.entries(productMap).map(([product, value]) => ({ product, value }));\n    });\n    res.json(result);`;
                 });
             }
        }
    }
});

// Remove some redundant try { const { ... } = req.body || {}; } that might have been duplicated by the replacement
const doubleTryRegex = /try \{\s*const \{ product, from, to \} = req\.body \|\| \{\};\s*try \{\s*const \{ product, from, to \} = req\.body \|\| \{\};/g;
content = content.replace(doubleTryRegex, 'try {\n    const { product, from, to } = req.body || {};');

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully updated all dashboard chart routes.');
