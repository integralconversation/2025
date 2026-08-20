#!/usr/bin/env node
/**
 * trim-whitespace.js
 *
 * Removes leading/trailing whitespace and newlines from inside HTML
 * elements that contain ONLY text (no nested tags). This fixes the
 * "extra gap" layout bug in Webflow exports caused by whitespace
 * next to inline-block elements.
 *
 * It skips <script>, <style>, <pre>, and <textarea> blocks so code
 * and preformatted text are not touched.
 *
 * USAGE:
 *   node trim-whitespace.js <folder>
 *
 * EXAMPLE:
 *   node trim-whitespace.js ./exported-site
 *
 * By default it edits files in place. Make a backup copy of your
 * project folder first, or use --dry-run to preview changes.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetDir = args.find(a => !a.startsWith('--')) || '.';

// Tags whose inner content must never be touched.
const SKIP_TAGS = ['script', 'style', 'pre', 'textarea'];

// Matches: <tag ...>  WHITESPACE  TEXT  WHITESPACE  </tag>
// Text must not contain "<" or ">", so nested tags are never matched.
const TRIM_PATTERN = /(<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>)([ \t\r\n]+)([^<>]*?[^\s<>][^<>]*?)([ \t\r\n]+)(<\/\2>)/g;

function collapseInner(text) {
  // Collapse internal newlines/indentation runs to a single space,
  // then trim the outer edges.
  return text.replace(/[ \t\r\n]+/g, ' ').trim();
}

function splitProtected(html) {
  // Split the file into segments, marking script/style/pre/textarea
  // blocks as "protected" so they are skipped.
  const pattern = new RegExp(
    `(<(${SKIP_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\2>)`,
    'gi'
  );
  const segments = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: html.slice(lastIndex, match.index), protected: false });
    }
    segments.push({ text: match[0], protected: true });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < html.length) {
    segments.push({ text: html.slice(lastIndex), protected: false });
  }
  return segments;
}

function trimFile(html) {
  const segments = splitProtected(html);
  let changed = false;
  const out = segments.map(seg => {
    if (seg.protected) return seg.text;
    const newText = seg.text.replace(TRIM_PATTERN, (m, open, tag, ws1, text, ws2, close) => {
      changed = true;
      return open + collapseInner(text) + close;
    });
    return newText;
  });
  return { result: out.join(''), changed };
}

function findHtmlFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      results = results.concat(findHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

function main() {
  const absDir = path.resolve(targetDir);
  if (!fs.existsSync(absDir)) {
    console.error(`Folder not found: ${absDir}`);
    process.exit(1);
  }

  const files = findHtmlFiles(absDir);
  if (files.length === 0) {
    console.log('No .html files found.');
    return;
  }

  console.log(`Found ${files.length} .html file(s).${dryRun ? ' (dry run — no files will be changed)' : ''}\n`);

  let changedCount = 0;
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const { result, changed } = trimFile(original);
    if (changed) {
      changedCount++;
      console.log(`Fixed: ${path.relative(absDir, file)}`);
      if (!dryRun) {
        fs.writeFileSync(file, result, 'utf8');
      }
    }
  }

  console.log(`\nDone. ${changedCount} of ${files.length} file(s) ${dryRun ? 'would be' : 'were'} changed.`);
}

main();
