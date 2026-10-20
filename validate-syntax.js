/**
 * Pre-Push Syntax Validator for Google Apps Script
 *
 * This script checks for common syntax errors BEFORE pushing to Google Apps Script.
 * Run this before clasp push to catch errors early.
 *
 * Usage: node validate-syntax.js
 *
 * NOTE: The brace/bracket/paren counter uses simple regex-based stripping.
 * It cannot parse JS regex literals (e.g. /\d{3}-\d{2}/) so the raw counts
 * will always differ slightly for files that use regex heavily.
 * To reduce noise, only deltas larger than MISMATCH_THRESHOLD are reported.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_DIR = path.join(__dirname, 'src');
let errorCount = 0;
let warningCount = 0;

console.log('========================================');
console.log('   PRE-PUSH SYNTAX VALIDATOR');
console.log('========================================\n');

// Get all .gs and .html files
const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.gs') || f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(SRC_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Check for common issues
    checkDuplicateCommentClosers(file, lines);
    if (file.endsWith('.gs')) {
        checkSyntaxV8(file, content);
    }
    checkDuplicateFiles(file);
});

// Validate desktop files if desktop folder exists
const DESKTOP_DIR = path.join(__dirname, 'desktop');
if (fs.existsSync(DESKTOP_DIR)) {
    const indexHtmlPath = path.join(DESKTOP_DIR, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
        const html = fs.readFileSync(indexHtmlPath, 'utf8');
        const inlineScripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)];
        inlineScripts.forEach((m, idx) => {
            try {
                new Function(m[1]);
            } catch (err) {
                console.log(`❌ ERROR: desktop/index.html inline script ${idx}: ${err.message}`);
                errorCount++;
            }
        });
    }
    const jsDir = path.join(DESKTOP_DIR, 'js');
    if (fs.existsSync(jsDir)) {
        const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
        const { execSync } = require('child_process');
        jsFiles.forEach(f => {
            try {
                execSync(`node -c "${path.join(jsDir, f)}"`);
            } catch (err) {
                console.log(`❌ ERROR: desktop/js/${f} syntax check failed: ${err.message}`);
                errorCount++;
            }
        });
    }
}

console.log('\n========================================');
if (errorCount > 0) {
    console.log(`❌ VALIDATION FAILED: ${errorCount} error(s), ${warningCount} warning(s)`);
    console.log('   Fix errors above before pushing!');
    process.exit(1);
} else if (warningCount > 0) {
    console.log(`⚠️  VALIDATION PASSED with ${warningCount} warning(s)`);
    console.log('   Safe to push, but consider fixing warnings.');
    process.exit(0);
} else {
    console.log('✅ VALIDATION PASSED: No issues found');
    console.log('   Safe to push!');
    process.exit(0);
}
console.log('========================================\n');

/**
 * Check for duplicate JSDoc comment closers (the Feb 1 bug)
 */
function checkDuplicateCommentClosers(file, lines) {
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        const nextLine = lines[i + 1].trim();

        // Check for consecutive */ on separate lines
        if (line === '*/' && nextLine === '*/') {
            console.log(`❌ ERROR: ${file}:${i + 2}`);
            console.log(`   Duplicate JSDoc closing comment '*/`);
            console.log(`   Line ${i + 1}: ${lines[i]}`);
            console.log(`   Line ${i + 2}: ${lines[i + 1]}`);
            console.log('');
            errorCount++;
        }

        // Check for */ */ on same line
        if (line.includes('*/') && line.indexOf('*/') !== line.lastIndexOf('*/')) {
            console.log(`❌ ERROR: ${file}:${i + 1}`);
            console.log(`   Multiple '*/' on same line`);
            console.log(`   Line: ${lines[i]}`);
            console.log('');
            errorCount++;
        }
    }
}

/**
 * Validate JavaScript syntax using Node's V8 compiler (same engine as Google Apps Script V8).
 * Accurately catches real syntax errors (unmatched braces/parens, illegal tokens, unclosed strings)
 * without false positives from regex literals or multiline templates.
 */
function checkSyntaxV8(file, content) {
    try {
        new vm.Script(content, { filename: file });
    } catch (err) {
        console.log(`❌ ERROR: ${file}`);
        console.log(`   ${err.name}: ${err.message}`);
        console.log('');
        errorCount++;
    }
}

/**
 * Check for ES6+ syntax that Google Apps Script doesn't support
 */
function checkES6Syntax(file, lines) {
    const es6Patterns = [
        { pattern: /^\s*const\s+/, msg: 'const (use var instead)' },
        { pattern: /^\s*let\s+/, msg: 'let (use var instead)' },
        { pattern: /=>\s*{/, msg: 'arrow function (use function() instead)' },
        { pattern: /=>\s*[^{]/, msg: 'arrow function (use function() instead)' },
        { pattern: /`[^`]*\$\{/, msg: 'template literal (use string concatenation instead)' },
        { pattern: /\.\.\.[\w[]+/, msg: 'spread operator (not supported)' },
        { pattern: /class\s+\w+\s*{/, msg: 'class declaration (use function constructor instead)' },
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

        for (const { pattern, msg } of es6Patterns) {
            if (pattern.test(line)) {
                console.log(`⚠️  WARNING: ${file}:${i + 1}`);
                console.log(`   ES6+ syntax detected: ${msg}`);
                console.log(`   Line: ${line.trim().substring(0, 60)}...`);
                console.log('');
                warningCount++;
                break; // Only report first match per line
            }
        }
    }
}

/**
 * Check for duplicate .js and .gs files with same name
 */
function checkDuplicateFiles(file) {
    if (file.endsWith('.gs')) {
        const jsFile = file.replace('.gs', '.js');
        const jsPath = path.join(SRC_DIR, jsFile);
        if (fs.existsSync(jsPath)) {
            console.log(`❌ ERROR: Duplicate files found!`);
            console.log(`   ${file} AND ${jsFile} both exist`);
            console.log(`   Remove ${jsFile} (clasp only needs .gs files)`);
            console.log('');
            errorCount++;
        }
    }
}
