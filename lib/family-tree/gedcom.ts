// A small, dependency-free GEDCOM parser.
//
// GEDCOM is a line-oriented format where every line is:
//     level [@xref@] TAG [value]
// Hierarchy is expressed purely by the leading level number. CONC/CONT lines
// continue the value of the line one level up (CONC = no separator, CONT =
// newline). We build a node tree from the levels, then walk INDI, FAM, SOUR and
// REPO records.
//
// The goal here is to lose nothing: each person keeps their full raw subtree
// (every tag, including custom ones), every event/attribute becomes a timeline
// row, and the source bibliography + citations are captured.

export interface GedcomJson {
  tag: string;
  value: string;
  children: GedcomJson[];
}

export interface Citation {
  source_xref: string | null;
  page: string | null;
  text: string | null;
}

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
  // Everything, preserved verbatim, plus the person's direct source citations.
  raw: GedcomJson | null;
  citations: Citation[];
}

export interface ParsedEvent {
  owner_xref: string;
  related_xref: string | null;
  tag: string;
  type: string;
  label: string;
  date: string | null;
  place: string | null;
  value: string | null;
  note: string | null;
  sources: Citation[];
  raw: GedcomJson | null;
  position: number;
}

export interface ParsedSource {
  xref: string;
  title: string | null;
  author: string | null;
  publication: string | null;
  repository: string | null;
  text: string | null;
  raw: GedcomJson | null;
}

export interface ParsedMedia {
  owner_xref: string;
  file: string;   // a filename, path, or URL referenced by the GEDCOM
  form: string | null;
  title: string | null;
}

export type ParentType = 'adopted' | 'step' | 'foster' | null;

export interface ParsedRelationship {
  type: 'parent' | 'spouse';
  // 'parent': from_xref = parent, to_xref = child.
  // 'spouse': partners (unordered).
  from_xref: string;
  to_xref: string;
  parent_type?: ParentType;
}

// Map Ancestry's _FREL/_MREL (or standard PEDI) values to a parent-link type.
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
  events: ParsedEvent[];
  sources: ParsedSource[];
  media: ParsedMedia[];
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

// Serialize a node's whole subtree to plain JSON so nothing is ever lost.
function serialize(node: GNode): GedcomJson {
  return {
    tag: node.tag,
    value: node.value ?? '',
    children: node.children.map(serialize),
  };
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

// Pull the source citations (SOUR child nodes) off any record or event.
function parseCitations(node: GNode): Citation[] {
  return allChildren(node, 'SOUR').map((s) => {
    const data = firstChild(s, 'DATA');
    const text = clean(firstChild(s, 'TEXT')?.value) ?? clean(data ? firstChild(data, 'TEXT')?.value : null);
    return {
      // An inline @S1@ pointer lives in the value; otherwise it's an embedded note.
      source_xref: /^@.+@$/.test(s.value.trim()) ? normXref(s.value) : null,
      page: clean(firstChild(s, 'PAGE')?.value),
      text,
    };
  });
}

// Human labels for the common event/attribute tags. Anything not here falls
// back to a humanized version of the raw tag (so custom tags still read well).
const EVENT_LABELS: Record<string, string> = {
  BIRT: 'Birth', CHR: 'Christening', BAPM: 'Baptism', BLES: 'Blessing',
  CONF: 'Confirmation', FCOM: 'First Communion', ORDN: 'Ordination',
  BARM: 'Bar Mitzvah', BASM: 'Bat Mitzvah',
  DEAT: 'Death', BURI: 'Burial', CREM: 'Cremation', PROB: 'Probate', WILL: 'Will',
  ADOP: 'Adoption', GRAD: 'Graduation', RETI: 'Retirement',
  MARR: 'Marriage', MARB: 'Marriage Banns', MARC: 'Marriage Contract',
  MARL: 'Marriage License', MARS: 'Marriage Settlement', ENGA: 'Engagement',
  DIV: 'Divorce', DIVF: 'Divorce Filed', ANUL: 'Annulment',
  RESI: 'Residence', CENS: 'Census', OCCU: 'Occupation', EDUC: 'Education',
  RELI: 'Religion', NATI: 'Nationality', IMMI: 'Immigration', EMIG: 'Emigration',
  NATU: 'Naturalization', MILI: 'Military Service', DSCR: 'Physical Description',
  PROP: 'Property', TITL: 'Title', CAST: 'Caste', IDNO: 'ID Number',
  SSN: 'Social Security Number', NCHI: 'Number of Children', NMR: 'Number of Marriages',
  EVEN: 'Event', FACT: 'Fact', BAPL: 'Baptism (LDS)', ENDL: 'Endowment (LDS)',
};

const EVENT_TYPES: Record<string, string> = {
  BIRT: 'birth', CHR: 'birth', BAPM: 'birth',
  DEAT: 'death', BURI: 'death', CREM: 'death', PROB: 'death', WILL: 'death',
  MARR: 'marriage', MARB: 'marriage', MARC: 'marriage', MARL: 'marriage',
  ENGA: 'marriage', DIV: 'divorce', ANUL: 'divorce',
  RESI: 'residence', CENS: 'census', OCCU: 'occupation', EDUC: 'education',
  IMMI: 'migration', EMIG: 'migration', NATU: 'migration', MILI: 'military',
};

// INDI child tags that are NOT life events (handled elsewhere or structural).
const INDI_NON_EVENT = new Set([
  'NAME', 'SEX', 'FAMC', 'FAMS', 'CHAN', 'SOUR', 'OBJE', 'NOTE', 'REFN',
  '_UID', 'RIN', 'RFN', 'SUBM', 'RESN', 'ANCI', 'DESI', 'ASSO', 'ALIA',
]);

// FAM child tags that ARE shared (couple) events.
const FAM_EVENT_TAGS = new Set([
  'MARR', 'MARB', 'MARC', 'MARL', 'MARS', 'ENGA', 'DIV', 'DIVF', 'ANUL',
  'CENS', 'RESI', 'EVEN', 'FACT',
]);

function humanizeTag(tag: string): string {
  if (EVENT_LABELS[tag]) return EVENT_LABELS[tag];
  const base = tag.replace(/^_/, '').toLowerCase().replace(/_/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function eventFromNode(
  node: GNode,
  ownerXref: string,
  relatedXref: string | null,
  position: number,
  keepRaw: boolean,
): ParsedEvent {
  return {
    owner_xref: ownerXref,
    related_xref: relatedXref,
    tag: node.tag,
    type: EVENT_TYPES[node.tag] ?? 'event',
    label: humanizeTag(node.tag),
    date: clean(firstChild(node, 'DATE')?.value),
    place: clean(firstChild(node, 'PLAC')?.value),
    value: clean(node.value),
    note: clean(firstChild(node, 'NOTE')?.value),
    sources: parseCitations(node),
    raw: keepRaw ? serialize(node) : null,
    position,
  };
}

function extractIndividual(node: GNode): ParsedIndividual {
  let given: string | null = null;
  let surname: string | null = null;

  const nameNode = firstChild(node, 'NAME');
  if (nameNode) {
    const parsed = parseGedcomName(nameNode.value);
    given = parsed.given;
    surname = parsed.surname;
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
    raw: serialize(node),
    citations: parseCitations(node),
  };
}

function extractIndividualEvents(node: GNode, events: ParsedEvent[]): void {
  const ownerXref = normXref(node.xref!);
  let pos = 0;
  for (const child of node.children) {
    if (INDI_NON_EVENT.has(child.tag)) continue;
    // INDI events keep no separate raw — the person's full raw_gedcom has it.
    events.push(eventFromNode(child, ownerXref, null, pos++, false));
  }
}

function extractFamily(node: GNode, out: ParsedRelationship[], events: ParsedEvent[]): void {
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
    const pedi = normalizeParentType(firstChild(childNode, 'PEDI')?.value);
    const frel = normalizeParentType(firstChild(childNode, '_FREL')?.value) ?? pedi;
    const mrel = normalizeParentType(firstChild(childNode, '_MREL')?.value) ?? pedi;
    if (husbXref) out.push({ type: 'parent', from_xref: husbXref, to_xref: kidXref, parent_type: frel });
    if (wifeXref) out.push({ type: 'parent', from_xref: wifeXref, to_xref: kidXref, parent_type: mrel });
  }

  // Shared couple events (marriage, divorce, census, …) attach to both partners.
  let pos = 0;
  for (const child of node.children) {
    if (!FAM_EVENT_TAGS.has(child.tag)) continue;
    if (husbXref) events.push(eventFromNode(child, husbXref, wifeXref, pos, true));
    if (wifeXref) events.push(eventFromNode(child, wifeXref, husbXref, pos, true));
    pos++;
  }
}

// A media object can be an inline OBJE or a top-level @M1@ OBJE record. Both
// hold one or more FILE references (a filename, path, or URL) plus FORM/TITL.
function mediaInObje(node: GNode): { file: string; form: string | null; title: string | null }[] {
  const formTop = clean(firstChild(node, 'FORM')?.value);
  const titleTop = clean(firstChild(node, 'TITL')?.value);
  const out: { file: string; form: string | null; title: string | null }[] = [];
  for (const f of allChildren(node, 'FILE')) {
    const file = clean(f.value);
    if (!file) continue;
    out.push({
      file,
      form: clean(firstChild(f, 'FORM')?.value) ?? formTop,
      title: clean(firstChild(f, 'TITL')?.value) ?? titleTop,
    });
  }
  return out;
}

function extractIndividualMedia(
  node: GNode,
  mediaRecords: Map<string, { file: string; form: string | null; title: string | null }[]>,
  out: ParsedMedia[],
): void {
  const owner = normXref(node.xref!);
  for (const obje of allChildren(node, 'OBJE')) {
    const v = obje.value.trim();
    if (/^@.+@$/.test(v)) {
      const rec = mediaRecords.get(normXref(v));
      if (rec) for (const m of rec) out.push({ owner_xref: owner, ...m });
    } else {
      for (const m of mediaInObje(obje)) out.push({ owner_xref: owner, ...m });
    }
  }
}

function extractSource(node: GNode, repoNames: Map<string, string>): ParsedSource {
  const repoNode = firstChild(node, 'REPO');
  let repository: string | null = null;
  if (repoNode) {
    const ptr = clean(repoNode.value);
    repository = (ptr && repoNames.get(normXref(ptr))) || ptr || null;
  }
  const data = firstChild(node, 'DATA');
  return {
    xref: normXref(node.xref!),
    title: clean(firstChild(node, 'TITL')?.value),
    author: clean(firstChild(node, 'AUTH')?.value),
    publication: clean(firstChild(node, 'PUBL')?.value),
    repository,
    text: clean(firstChild(node, 'TEXT')?.value) ?? clean(data ? firstChild(data, 'TEXT')?.value : null),
    raw: serialize(node),
  };
}

export function parseGedcom(text: string): ParsedGedcom {
  const warnings: string[] = [];
  const roots = buildTree(text);

  const individuals: ParsedIndividual[] = [];
  const relationships: ParsedRelationship[] = [];
  const events: ParsedEvent[] = [];
  const sources: ParsedSource[] = [];
  const media: ParsedMedia[] = [];

  // Repository names + media records first, so sources/individuals can resolve
  // their @REPO@ / @OBJE@ pointers.
  const repoNames = new Map<string, string>();
  const mediaRecords = new Map<string, { file: string; form: string | null; title: string | null }[]>();
  for (const node of roots) {
    if (node.tag === 'REPO' && node.xref) {
      const name = clean(firstChild(node, 'NAME')?.value);
      if (name) repoNames.set(normXref(node.xref), name);
    } else if (node.tag === 'OBJE' && node.xref) {
      mediaRecords.set(normXref(node.xref), mediaInObje(node));
    }
  }

  for (const node of roots) {
    if (node.tag === 'INDI' && node.xref) {
      individuals.push(extractIndividual(node));
      extractIndividualEvents(node, events);
      extractIndividualMedia(node, mediaRecords, media);
    } else if (node.tag === 'FAM') {
      extractFamily(node, relationships, events);
    } else if (node.tag === 'SOUR' && node.xref) {
      sources.push(extractSource(node, repoNames));
    }
  }

  if (individuals.length === 0) {
    warnings.push('No individuals (INDI records) were found in this file.');
  }

  // Drop edges that point at people the file never defined.
  const known = new Set(individuals.map((i) => i.xref));
  const valid = relationships.filter((r) => known.has(r.from_xref) && known.has(r.to_xref));
  if (valid.length < relationships.length) {
    warnings.push(
      `${relationships.length - valid.length} relationship link(s) referenced unknown individuals and were skipped.`,
    );
  }

  // Keep only events / media whose owner exists.
  const validEvents = events.filter((e) => known.has(e.owner_xref));
  const validMedia = media.filter((m) => known.has(m.owner_xref));

  // De-duplicate relationships.
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

  return { individuals, relationships: deduped, events: validEvents, sources, media: validMedia, warnings };
}
