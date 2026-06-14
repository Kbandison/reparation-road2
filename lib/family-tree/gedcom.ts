// A small, dependency-free GEDCOM parser.
//
// GEDCOM is a line-oriented format where every line is:
//     level [@xref@] TAG [value]
// Hierarchy is expressed purely by the leading level number. CONC/CONT lines
// continue the value of the line one level up (CONC = no separator, CONT =
// newline). We build a node tree from the levels, then walk INDI and FAM
// records into flat individuals + relationship edges keyed by their @xref@.
//
// This covers the GEDCOM 5.5.1 tags that real-world exports (Ancestry,
// FamilySearch, MyHeritage, Gramps) actually use. Unknown tags are ignored.

export interface ParsedIndividual {
  xref: string;
  given_name: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'U' | null;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
  occupation: string | null;
  notes: string | null;
}

export type ParentType = 'adopted' | 'step' | 'foster' | null;

export interface ParsedRelationship {
  type: 'parent' | 'spouse';
  // 'parent': from_xref = parent, to_xref = child.
  // 'spouse': partners (unordered).
  from_xref: string;
  to_xref: string;
  // For parent edges: non-biological links (adopted/step/foster). Null means a
  // biological or unspecified ("unknown") link.
  parent_type?: ParentType;
}

// Map Ancestry's _FREL/_MREL (or standard PEDI) values to a parent-link type.
// Natural / birth / unknown / blank all read as biological (null).
function normalizeParentType(value: string | undefined | null): ParentType {
  const s = value?.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('adopt')) return 'adopted';
  if (s.includes('step')) return 'step';
  if (s.includes('foster')) return 'foster';
  return null;
}

export interface ParsedGedcom {
  individuals: ParsedIndividual[];
  relationships: ParsedRelationship[];
  warnings: string[];
}

interface GNode {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  children: GNode[];
}

// level, optional @xref@, tag, optional value (everything after one space).
const LINE_RE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;

function normXref(raw: string): string {
  return raw.trim();
}

function buildTree(text: string): GNode[] {
  const roots: GNode[] = [];
  const stack: GNode[] = []; // stack[i] holds the open node at level i
  const lines = text.split(/\r\n|\r|\n/);

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const m = raw.match(LINE_RE);
    if (!m) continue;

    const level = parseInt(m[1], 10);
    const xref = m[2] ? normXref(m[2]) : null;
    const tag = m[3].toUpperCase();
    const value = m[4] ?? '';

    // Continuation lines fold into the value of the node one level up.
    if (tag === 'CONC' || tag === 'CONT') {
      const target = stack[level - 1];
      if (target) target.value += (tag === 'CONT' ? '\n' : '') + value;
      continue;
    }

    const node: GNode = { level, xref, tag, value, children: [] };
    if (level === 0) {
      roots.push(node);
    } else {
      const parent = stack[level - 1];
      if (parent) parent.children.push(node);
    }
    stack[level] = node;
    stack.length = level + 1; // discard any deeper open nodes
  }

  return roots;
}

function firstChild(node: GNode, tag: string): GNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

function allChildren(node: GNode, tag: string): GNode[] {
  return node.children.filter((c) => c.tag === tag);
}

function clean(v: string | undefined | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

// GEDCOM names look like "John Allen /Smith/ Jr". The surname is between the
// slashes; everything else is the given name(s) + suffix.
function parseGedcomName(value: string): { given: string | null; surname: string | null } {
  const m = value.match(/\/([^/]*)\//);
  if (m) {
    const surname = clean(m[1]);
    const before = value.slice(0, m.index).trim();
    const after = value.slice((m.index ?? 0) + m[0].length).trim();
    const given = clean([before, after].filter(Boolean).join(' '));
    return { given, surname };
  }
  return { given: clean(value), surname: null };
}

function extractIndividual(node: GNode): ParsedIndividual {
  let given: string | null = null;
  let surname: string | null = null;

  const nameNode = firstChild(node, 'NAME');
  if (nameNode) {
    const parsed = parseGedcomName(nameNode.value);
    given = parsed.given;
    surname = parsed.surname;
    // Explicit GIVN/SURN subtags, when present, are authoritative.
    const givn = clean(firstChild(nameNode, 'GIVN')?.value);
    const surn = clean(firstChild(nameNode, 'SURN')?.value);
    if (givn) given = givn;
    if (surn) surname = surn;
  }

  const sexRaw = firstChild(node, 'SEX')?.value?.trim().toUpperCase();
  const sex: 'M' | 'F' | 'U' | null =
    sexRaw === 'M' ? 'M' : sexRaw === 'F' ? 'F' : sexRaw ? 'U' : null;

  const birt = firstChild(node, 'BIRT');
  const deat = firstChild(node, 'DEAT');

  return {
    xref: normXref(node.xref!),
    given_name: given,
    surname,
    sex,
    birth_date: birt ? clean(firstChild(birt, 'DATE')?.value) : null,
    birth_place: birt ? clean(firstChild(birt, 'PLAC')?.value) : null,
    death_date: deat ? clean(firstChild(deat, 'DATE')?.value) : null,
    death_place: deat ? clean(firstChild(deat, 'PLAC')?.value) : null,
    occupation: clean(firstChild(node, 'OCCU')?.value),
    notes: clean(firstChild(node, 'NOTE')?.value),
  };
}

function extractFamily(node: GNode, out: ParsedRelationship[]): void {
  const husb = clean(firstChild(node, 'HUSB')?.value);
  const wife = clean(firstChild(node, 'WIFE')?.value);
  const husbXref = husb ? normXref(husb) : null;
  const wifeXref = wife ? normXref(wife) : null;

  if (husbXref && wifeXref) {
    out.push({ type: 'spouse', from_xref: husbXref, to_xref: wifeXref });
  }

  for (const childNode of allChildren(node, 'CHIL')) {
    const kid = clean(childNode.value);
    if (!kid) continue;
    const kidXref = normXref(kid);
    // _FREL / _MREL qualify the child's link to father / mother; PEDI is the
    // standard fallback applied to both.
    const pedi = normalizeParentType(firstChild(childNode, 'PEDI')?.value);
    const frel = normalizeParentType(firstChild(childNode, '_FREL')?.value) ?? pedi;
    const mrel = normalizeParentType(firstChild(childNode, '_MREL')?.value) ?? pedi;
    if (husbXref) out.push({ type: 'parent', from_xref: husbXref, to_xref: kidXref, parent_type: frel });
    if (wifeXref) out.push({ type: 'parent', from_xref: wifeXref, to_xref: kidXref, parent_type: mrel });
  }
}

export function parseGedcom(text: string): ParsedGedcom {
  const warnings: string[] = [];
  const roots = buildTree(text);

  const individuals: ParsedIndividual[] = [];
  const relationships: ParsedRelationship[] = [];

  for (const node of roots) {
    if (node.tag === 'INDI' && node.xref) {
      individuals.push(extractIndividual(node));
    } else if (node.tag === 'FAM') {
      extractFamily(node, relationships);
    }
  }

  if (individuals.length === 0) {
    warnings.push('No individuals (INDI records) were found in this file.');
  }

  // Drop edges that point at people the file never defined.
  const known = new Set(individuals.map((i) => i.xref));
  const valid = relationships.filter(
    (r) => known.has(r.from_xref) && known.has(r.to_xref)
  );
  if (valid.length < relationships.length) {
    warnings.push(
      `${relationships.length - valid.length} relationship link(s) referenced unknown individuals and were skipped.`
    );
  }

  // De-duplicate (a spouse pair appears once; a child of two parents yields two
  // parent edges, which is intentional and kept).
  const seen = new Set<string>();
  const deduped = valid.filter((r) => {
    const key =
      r.type === 'spouse'
        ? `spouse:${[r.from_xref, r.to_xref].sort().join('|')}`
        : `parent:${r.from_xref}->${r.to_xref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { individuals, relationships: deduped, warnings };
}
