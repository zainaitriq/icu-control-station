const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// High-security obfuscation configuration
const config = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 2000,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
};

function obfuscateDirectory(dir, outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            // Skip node_modules and other unwanted directories
            if (file === 'node_modules' || file === '.git' || file === 'certs') {
                return;
            }
            
            const newOutputDir = path.join(outputDir, file);
            obfuscateDirectory(filePath, newOutputDir);
        } else if (file.endsWith('.js')) {
            console.log(`🔒 Obfuscating: ${filePath}`);
            try {
                const code = fs.readFileSync(filePath, 'utf8');
                const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, config).getObfuscatedCode();
                const outputPath = path.join(outputDir, file);
                fs.writeFileSync(outputPath, obfuscatedCode);
                console.log(`   ✅ Saved to: ${outputPath}`);
            } catch (error) {
                console.error(`   ❌ Error obfuscating ${filePath}:`, error.message);
            }
        } else {
            // Copy non-JS files as is
            const outputPath = path.join(outputDir, file);
            fs.copyFileSync(filePath, outputPath);
            console.log(`📋 Copied: ${file}`);
        }
    });
}

console.log('🏥 ICU Control Station - Code Obfuscation');
console.log('==========================================\n');

// Obfuscate backend
console.log('🔒 Obfuscating backend source files...\n');
const backendSrc = path.join(__dirname, '../backend/src');
const backendDist = path.join(__dirname, '../backend-obfuscated/src');

if (!fs.existsSync(backendSrc)) {
    console.error('❌ Backend source directory not found:', backendSrc);
    process.exit(1);
}

obfuscateDirectory(backendSrc, backendDist);

// Copy essential files
console.log('\n📋 Copying essential files...');

// Copy package.json
const packageJson = require('../backend/package.json');
// Remove dev dependencies for production
delete packageJson.devDependencies;
packageJson.scripts = {
    start: 'node src/consumer.js',
    bridge: 'node src/websocket-bridge.js'
};

fs.writeFileSync(
    path.join(__dirname, '../backend-obfuscated/package.json'),
    JSON.stringify(packageJson, null, 2)
);
console.log('✅ package.json');

// Copy .env.example if exists
const envExample = path.join(__dirname, '../backend/.env.example');
if (fs.existsSync(envExample)) {
    fs.copyFileSync(
        envExample,
        path.join(__dirname, '../backend-obfuscated/.env.example')
    );
    console.log('✅ .env.example');
}

// Create certs directory
const certsDir = path.join(__dirname, '../backend-obfuscated/certs');
if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
    console.log('✅ certs/ directory created');
}

// Create README for obfuscated version
const obfuscatedReadme = `# ICU Control Station - Production Build

This is the obfuscated production build of ICU Control Station backend.

## Installation

1. Install dependencies:
   \`\`\`bash
   npm install --production
   \`\`\`

2. Configure environment:
   \`\`\`bash
   cp .env.example .env
   nano .env
   \`\`\`

3. Add SSL certificates to \`certs/\` directory

4. Run the application:
   \`\`\`bash
   npm start        # Start consumer
   npm run bridge   # Start WebSocket bridge
   \`\`\`

## Security Notice

⚠️ This code has been obfuscated to protect intellectual property.
Do not attempt to reverse-engineer or modify the code.

© 2025 All Rights Reserved
`;

fs.writeFileSync(
    path.join(__dirname, '../backend-obfuscated/README.md'),
    obfuscatedReadme
);
console.log('✅ README.md');

console.log('\n✅ Obfuscation complete!');
console.log(`📦 Obfuscated code saved to: ${path.join(__dirname, '../backend-obfuscated')}`);
console.log('\n📝 Next steps:');
console.log('1. Test the obfuscated code');
console.log('2. Build the deployment package');
console.log('3. Deploy to client environment');