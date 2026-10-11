/**
 * Given names that 18th- and 19th-century records use interchangeably: the
 * formal name, its common nicknames, and the abbreviations clerks wrote
 * ("Wm", "Jno", "Thos"). Each line is one group; any two names in a group are
 * treated as the same name. Lowercase, letters only.
 */
const GROUPS: string[] = [
  // Women
  'mary polly molly mollie mamie mae may marie maria mariah minnie',
  'martha patsy patty pattie mattie marty',
  'elizabeth betsy betsey betty bettie beth eliza liza lizzie libby bess bessie elisabeth',
  'margaret peggy maggie meg madge margery marjorie',
  'sarah sally sallie sadie sara',
  'ann anna anne annie nancy nannie hannah',
  'catherine katherine kathryn catharine katharine kate katie kitty caty cathy',
  'susan susanna susannah sukey sukie sue susie',
  'frances fanny fannie frankie',
  'rebecca becky beckie becca',
  'deborah debby debbie deb',
  'dorothy dolly dot dottie',
  'eleanor elinor ellen helen nell nellie ella',
  'caroline carolina carrie',
  'harriet harriett hattie hatty',
  'henrietta etta hettie',
  'lucinda lucy cindy',
  'matilda tilda tillie',
  'amanda mandy',
  'priscilla prissy',
  'louisa louise lulu',
  'charlotte lottie',
  'jemima mima',
  'judith judy',
  'esther hester hetty hettie',
  'virginia ginny jennie jenny',
  'phoebe phebe',
  'cecilia celia sissy',
  'lavinia vinnie',
  'clarissa clara',
  'temperance tempy',
  'philadelphia delphia',
  'parthenia thenia',
  'arabella bella',
  // Men
  'william bill billy will willie willy wm',
  'john jack johnny jno',
  'james jim jimmy jas jem',
  'robert bob bobby rob robin robt',
  'richard dick rick richd',
  'thomas tom tommy thos',
  'charles charley charlie chas',
  'george geo',
  'benjamin ben benny benj',
  'joseph joe jos',
  'edward ed eddie ned ted edw',
  'henry harry hal hank',
  'samuel sam sammy saml',
  'daniel dan danny danl',
  'nathaniel nathan nat nate',
  'alexander alex alec sandy alexr',
  'andrew andy drew',
  'abraham abe abram',
  'isaac ike',
  'jacob jake',
  'elijah eli lige',
  'ezekiel zeke',
  'solomon sol',
  'zachariah zachary zach zack',
  'moses mose',
  'lewis louis lou',
  'peter pete',
  'matthew matt',
  'michael mike mick',
  'nicholas nick',
  'patrick pat paddy',
  'stephen steven steve',
  'timothy tim',
  'lawrence laurence larry',
  'francis frank',
  'frederick fred',
  'augustus gus',
  'cornelius neil',
  'jeremiah jerry',
  'hezekiah hez',
  'washington wash',
  'jonathan jon',
  'christopher kit chris',
  'archibald archie',
  'bartholomew bart',
  'cyrus cy',
  'ebenezer eben',
  'josiah si',
  'nehemiah nehe',
];

const groupOf = new Map<string, Set<string>>();
for (const line of GROUPS) {
  const names = line.split(' ');
  const group = new Set(names);
  for (const name of names) {
    // A name in two groups (e.g. "lou") is equivalent to both.
    const existing = groupOf.get(name);
    groupOf.set(name, existing ? new Set([...existing, ...group]) : group);
  }
}

/** Every name treated as the same given name as `name` (lowercase), itself included. */
export function nameEquivalents(name: string): string[] {
  const group = groupOf.get(name.toLowerCase());
  return group ? [...group] : [name.toLowerCase()];
}

/** True when two given names are the same name (formal, nickname or clerk's abbreviation). */
export function areNameEquivalents(a: string, b: string): boolean {
  if (a === b) return true;
  return groupOf.get(a.toLowerCase())?.has(b.toLowerCase()) ?? false;
}
