/**
 * fix-encoding.js
 *
 * Fixes double-encoded UTF-8 emojis in .gs and .html files.
 * The emojis were corrupted when UTF-8 bytes were interpreted as Windows-1252,
 * producing garbled text like "ðŸ"±" instead of "📱".
 *
 * How it works:
 * 1. Read file as UTF-8 (garbled)
 * 2. Encode each character's code point as a Windows-1252 byte
 * 3. Decode the resulting bytes as UTF-8 (restored)
 */

var fs = require('fs');
var path = require('path');

// Windows-1252 to Unicode mapping for bytes 0x80-0x9F
// (These differ from Latin-1 / ISO-8859-1)
var cp1252ToUnicode = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E,
  0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6,
  0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152,
  0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C,
  0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A,
  0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178
};

// Build reverse mapping: Unicode code point -> Windows-1252 byte
var unicodeToCp1252 = {};
for (var byteVal in cp1252ToUnicode) {
  unicodeToCp1252[cp1252ToUnicode[byteVal]] = parseInt(byteVal);
}

function unicodeCharToByte(ch) {
  var cp = ch.codePointAt(0);
  // ASCII and Latin-1 supplement (0x00-0x7F, 0xA0-0xFF) map directly
  if (cp < 0x80) return cp;
  if (cp >= 0xA0 && cp <= 0xFF) return cp;
  // Check Windows-1252 special range
  if (unicodeToCp1252[cp] !== undefined) return unicodeToCp1252[cp];
  // Can't map - return null
  return null;
}

function fixDoubleEncoding(text) {
  // Try to convert the garbled text back to original UTF-8
  // Strategy: Convert character by character to bytes using CP1252,
  // then decode those bytes as UTF-8

  var bytes = [];
  var hasGarbled = false;

  for (var i = 0; i < text.length; i++) {
    var cp = text.codePointAt(i);

    // Surrogate pair - skip the second code unit
    if (cp > 0xFFFF) {
      // This is already a proper emoji (above BMP) - shouldn't happen in garbled text
      // Convert to UTF-8 bytes directly
      bytes.push((cp >> 18) | 0xF0);
      bytes.push(((cp >> 12) & 0x3F) | 0x80);
      bytes.push(((cp >> 6) & 0x3F) | 0x80);
      bytes.push((cp & 0x3F) | 0x80);
      i++; // skip second surrogate
      continue;
    }

    var byteVal = unicodeCharToByte(text[i]);
    if (byteVal !== null) {
      bytes.push(byteVal);
      if (byteVal >= 0x80) hasGarbled = true;
    } else {
      // Can't convert - this character isn't part of garbled text
      // Encode as UTF-8 directly
      if (cp < 0x800) {
        bytes.push((cp >> 6) | 0xC0);
        bytes.push((cp & 0x3F) | 0x80);
      } else {
        bytes.push((cp >> 12) | 0xE0);
        bytes.push(((cp >> 6) & 0x3F) | 0x80);
        bytes.push((cp & 0x3F) | 0x80);
      }
    }
  }

  if (!hasGarbled) return text; // No garbled content found

  // Decode the bytes as UTF-8
  var buf = Buffer.from(bytes);
  return buf.toString('utf8');
}

// Process all .gs and .html files in src/
var srcDir = path.join(__dirname, 'src');
var files = fs.readdirSync(srcDir).filter(function(f) {
  return f.endsWith('.gs') || f.endsWith('.html');
});

var fixedCount = 0;
var totalEmojisFixed = 0;

files.forEach(function(filename) {
  var filepath = path.join(srcDir, filename);
  var original = fs.readFileSync(filepath, 'utf8');

  // Quick check: does this file have garbled emoji patterns?
  // Garbled 4-byte emojis start with ð (U+00F0) followed by Ÿ (U+0178)
  // Garbled 3-byte emojis start with â (U+00E2)
  var hasGarbledEmojis = /[\u00C0-\u00F4][\u0178\u0152\u0153\u0160\u0161\u017D\u017E\u0192\u02C6\u02DC\u2013-\u203A\u2122]|[\u00C0-\u00F4][\u0080-\u00BF]/.test(original);

  if (!hasGarbledEmojis) return;

  var fixed = fixDoubleEncoding(original);

  if (fixed !== original) {
    // Count emojis restored (look for proper 4-byte emoji sequences)
    var emojiMatches = fixed.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2B50-\u2B55]|[\u23E9-\u23FA]|[\u2702-\u27B0]|[\u2934-\u2935]|[\u25AA-\u25FE]|[\u2194-\u21AA]/g);
    var emojiCount = emojiMatches ? emojiMatches.length : 0;

    fs.writeFileSync(filepath, fixed, 'utf8');
    console.log('FIXED: ' + filename + ' (' + emojiCount + ' emojis restored)');
    fixedCount++;
    totalEmojisFixed += emojiCount;
  }
});

if (fixedCount === 0) {
  console.log('No files needed emoji encoding fixes.');
} else {
  console.log('\nFixed ' + fixedCount + ' file(s), ~' + totalEmojisFixed + ' emojis restored.');
  console.log('Run .\\push.bat to deploy the fixes.');
}

