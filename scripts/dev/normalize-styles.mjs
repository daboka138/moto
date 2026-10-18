// Note 24 : normalise les styles écrits en dur dans src/ (lancé une fois, relançable sans risque)
//   - fontSize numérique → Type.small / body / large / title (≥ 36 = affichage, gardé)
//   - borderRadius numérique → Radius.sm / md / lg (cercles et pilules gardés)
//   - padding / margin / gap → échelle 4 / 8 / 12 / 16 / 24 / 32 (1-3 et négatifs gardés)
//   - ombres : elevation ≤ 4, shadowRadius ≤ 8, shadowOpacity ≤ 0.15
// Usage : node scripts/dev/normalize-styles.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const DRY = process.argv.includes('--dry');
const ROOT = path.resolve('src');
const SKIP = new Set([path.join(ROOT, 'constants', 'theme.tsx')]);

const SPACING = new Set([
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingHorizontal', 'paddingVertical',
  'paddingStart', 'paddingEnd', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd', 'gap', 'rowGap', 'columnGap',
]);

function typeToken(n) {
  if (n >= 36) return null;
  if (n <= 13) return 'Type.small';
  if (n <= 16) return 'Type.body';
  if (n <= 20) return 'Type.large';
  return 'Type.title';
}

function spacing(n) {
  if (n <= 3) return n;
  if (n <= 5) return 4;
  if (n <= 10) return n === 10 ? 12 : 8;
  if (n <= 13) return 12;
  if (n <= 20) return 16;
  if (n <= 27) return 24;
  if (n <= 36) return 32;
  return n;
}

function radiusToken(n) {
  if (n <= 5 || n >= 999) return null;
  if (n <= 10) return 'Radius.sm';
  if (n <= 18) return 'Radius.md';
  return 'Radius.lg';
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.tsx?$/.test(e.name) && !SKIP.has(p) ? [p] : [];
  });
}

const propName = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);
const num = (e) => (e && ts.isNumericLiteral(e) ? Number(e.text) : null);

let total = 0;
for (const file of files(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const used = new Set();

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = node.properties.filter(ts.isPropertyAssignment);
      const val = (name) => num(props.find((p) => propName(p) === name)?.initializer);
      const width = val('width');
      const height = val('height');
      const hasDims = props.some((p) => ['width', 'height', 'minHeight', 'minWidth'].includes(propName(p)));
      for (const p of props) {
        const name = propName(p);
        const n = num(p.initializer);
        if (name == null || n == null) continue;
        let rep = null;
        if (name === 'fontSize') {
          rep = typeToken(n);
          if (rep) used.add('Type');
        } else if (name === 'borderRadius' || /^border(Top|Bottom)(Left|Right)Radius$/.test(name)) {
          const dims = [width, height, val('minHeight')].filter((d) => d != null);
          const circle = dims.some((d) => n * 2 >= d - 1);
          // Rayon dont la taille n'est pas écrite ici : probablement un rond, on n'y touche pas
          const unknownRound = !dims.length && hasDims && n >= 16;
          if (!circle && !unknownRound) {
            rep = radiusToken(n);
            if (rep) used.add('Radius');
          }
        } else if (SPACING.has(name)) {
          const s = spacing(n);
          if (s !== n) rep = String(s);
        } else if (name === 'elevation' && n > 4) rep = '4';
        else if (name === 'shadowRadius' && n > 8) rep = '8';
        else if (name === 'shadowOpacity' && n > 0.15) rep = '0.15';
        if (rep) edits.push({ start: p.initializer.getStart(sf), end: p.initializer.getEnd(), text: rep });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;

  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  // Import des jetons depuis le thème
  const need = [...used];
  if (need.length) {
    const re = /import\s*\{([^}]*)\}\s*from\s*'@\/constants\/theme';/;
    const m = out.match(re);
    if (m) {
      const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      const add = need.filter((n) => !names.includes(n));
      if (add.length) out = out.replace(re, `import { ${[...names, ...add].sort((a, b) => a.localeCompare(b)).join(', ')} } from '@/constants/theme';`);
    } else {
      const imports = [...out.matchAll(/^import[\s\S]*?from\s+'[^']+';\s*$/gm)];
      const last = imports.at(-1);
      const line = `import { ${need.sort().join(', ')} } from '@/constants/theme';\n`;
      const at = last ? last.index + last[0].length + 1 : 0;
      out = out.slice(0, at) + line + out.slice(at);
    }
  }
  total += edits.length;
  console.log(`${edits.length.toString().padStart(4)}  ${path.relative(process.cwd(), file)}`);
  if (!DRY) fs.writeFileSync(file, out);
}
console.log(`${total} valeurs ${DRY ? 'à changer' : 'changées'}`);
