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

const SRC_DIR = path.join(__dirname, 'src');
let errorCount = 0;
let warningCount = 0;

// Only warn when the open/close count differs by more than this amount.
// Keeps false positives from regex literals silent while still catching
// genuinely unclosed blocks (which would have a much larger delta).
const MISMATCH_THRESHOLD = 5;

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
    checkUnmatchedBraces(file, content);
    checkDuplicateFiles(file);

    if (file.endsWith('.gs')) {
        checkES6Syntax(file, lines);
    }
});

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
 * Check for unmatched braces/brackets.
 * Uses simple regex stripping (block comments, line comments, quoted strings).
 * Small imbalances (≤ MISMATCH_THRESHOLD) are ignored as likely false positives
 * from JS regex literals containing quantifiers like {3} or {1,2}.
 */
function checkUnmatchedBraces(file, content) {
    // Remove strings and comments to avoid false positives
    let stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
        .replace(/\/\/.*/g, '')           // Remove line comments
        .replace(/'[^']*'/g, '')          // Remove single-quoted strings
        .replace(/"[^"]*"/g, '');         // Remove double-quoted strings

    const counts = {
        '{': 0, '}': 0,
        '[': 0, ']': 0,
        '(': 0, ')': 0
    };

    for (const char of stripped) {
        if (Object.prototype.hasOwnProperty.call(counts, char)) {
            counts[char]++;
        }
    }

    const braceDelta   = Math.abs(counts['{'] - counts['}']);
    const bracketDelta = Math.abs(counts['['] - counts[']']);
    const parenDelta   = Math.abs(counts['('] - counts[')']);

    if (braceDelta > MISMATCH_THRESHOLD) {
        console.log(`⚠️  WARNING: ${file}`);
        console.log(`   Unmatched braces: ${counts['{']} opening, ${counts['}']} closing (delta ${braceDelta})`);
        console.log('');
        warningCount++;
    }

    if (bracketDelta > MISMATCH_THRESHOLD) {
        console.log(`⚠️  WARNING: ${file}`);
        console.log(`   Unmatched brackets: ${counts['[']} opening, ${counts[']']} closing (delta ${bracketDelta})`);
        console.log('');
        warningCount++;
    }

    if (parenDelta > MISMATCH_THRESHOLD) {
        console.log(`⚠️  WARNING: ${file}`);
        console.log(`   Unmatched parentheses: ${counts['(']} opening, ${counts[')']} closing (delta ${parenDelta})`);
        console.log('');
        warningCount++;
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
