// Tags are freeform strings (no tags table to store a color on), so colors
// are assigned rather than stored: given the full set of tags currently in
// use (assignTagColors, called server-side from the tag list every page
// that shows tag pills already has to fetch), each DISTINCT tag gets the
// palette entry at its own position in a stable alphabetical order --
// deterministic and collision-free as long as there are no more than
// PALETTE.length distinct tags in use, not just "probably fine".
//
// A hash of each tag's own text in isolation (the previous approach) can't
// give that guarantee at any practical palette size: by the birthday
// paradox, independently-hashed tags collide far sooner than the palette
// size suggests -- 8 tags already collide ~57% of the time even across 36
// buckets, 95% of the time across 12. Position-based assignment sidesteps
// the paradox entirely: it isn't leaving 36 dice rolls to chance, it's
// dealing 36 distinct cards.
//
// Colors are hand-picked hex pairs rather than a computed hsl() formula, so
// they actually sit in the site's own palette instead of cycling through
// arbitrary saturated hues that can clash with it: the "soft" row below uses
// the exact same recipe (32% saturation, 91% lightness) as --accent-soft
// (#efe6f3, itself ~32%/93%), and its violet entry lands within a couple of
// hex digits of --accent/--accent-soft -- these tag colors are that same
// design system extended across the hue wheel, not a separate one.
const PALETTE: { bg: string; fg: string }[] = [
	// -- soft row (matches --accent-soft's own recipe) --
	{ bg: '#ece1ef', fg: '#7e3597' }, // violet
	{ bg: '#efe1ee', fg: '#97358f' }, // magenta
	{ bg: '#efe1e9', fg: '#97356e' }, // rose
	{ bg: '#efe1e4', fg: '#97354e' }, // corail
	{ bg: '#efe2e1', fg: '#973d35' }, // rouge
	{ bg: '#efe7e1', fg: '#975e35' }, // brique
	{ bg: '#efece1', fg: '#977e35' }, // orange
	{ bg: '#eeefe1', fg: '#8f9735' }, // ambre
	{ bg: '#e9efe1', fg: '#6e9735' }, // olive
	{ bg: '#e4efe1', fg: '#4e9735' }, // vert
	{ bg: '#e1efe2', fg: '#35973d' }, // sauge
	{ bg: '#e1efe7', fg: '#35975e' }, // menthe
	{ bg: '#e1efec', fg: '#35977e' }, // émeraude
	{ bg: '#e1eeef', fg: '#358f97' }, // sarcelle
	{ bg: '#e1e9ef', fg: '#356e97' }, // cyan
	{ bg: '#e1e4ef', fg: '#354e97' }, // bleu
	{ bg: '#e2e1ef', fg: '#3d3597' }, // indigo
	{ bg: '#e7e1ef', fg: '#5e3597' }, // perse
	// -- deep row (same 18 hues, richer) --
	{ bg: '#dec6e7', fg: '#68257e' }, // violet
	{ bg: '#e7c6e4', fg: '#7e2577' }, // magenta
	{ bg: '#e7c6d9', fg: '#7e2559' }, // rose
	{ bg: '#e7c6ce', fg: '#7e253b' }, // corail
	{ bg: '#e7c9c6', fg: '#7e2c25' }, // rouge
	{ bg: '#e7d3c6', fg: '#7e4a25' }, // brique
	{ bg: '#e7dec6', fg: '#7e6825' }, // orange
	{ bg: '#e4e7c6', fg: '#777e25' }, // ambre
	{ bg: '#d9e7c6', fg: '#597e25' }, // olive
	{ bg: '#cee7c6', fg: '#3b7e25' }, // vert
	{ bg: '#c6e7c9', fg: '#257e2c' }, // sauge
	{ bg: '#c6e7d3', fg: '#257e4a' }, // menthe
	{ bg: '#c6e7de', fg: '#257e68' }, // émeraude
	{ bg: '#c6e4e7', fg: '#25777e' }, // sarcelle
	{ bg: '#c6d9e7', fg: '#25597e' }, // cyan
	{ bg: '#c6cee7', fg: '#253b7e' }, // bleu
	{ bg: '#c9c6e7', fg: '#2c257e' }, // indigo
	{ bg: '#d3c6e7', fg: '#4a257e' } // perse
];

type TagColor = { bg: string; fg: string };

// The real assignment: given every distinct tag currently in use (a page
// fetches this once, server-side -- see $lib/server/patternTags.ts), each
// gets the palette entry at its own index in a stable alphabetical order.
// Two different tags never land on the same entry unless there are more
// distinct tags than PALETTE.length (36) -- at that point they repeat, the
// one tradeoff any finite palette has, but that's 36 distinct concepts in a
// personal pattern library, not 8.
export function assignTagColors(tags: Iterable<string>): Map<string, TagColor> {
	const unique = [...new Set(tags)].sort((a, b) => a.localeCompare(b));
	const map = new Map<string, TagColor>();
	unique.forEach((tag, i) => map.set(tag, PALETTE[i % PALETTE.length]));
	return map;
}

// FNV-1a, used only as the fallback below for a tag that isn't in a
// precomputed assignTagColors() map (there shouldn't be one in normal use --
// every page that renders tag pills fetches the full set first -- but a
// missing entry should still get *a* color rather than none). Unlike a plain
// polynomial hash (`hash*31 + c`), this doesn't lose distribution once
// reduced mod a small number -- 31 mod 18 has order 6 (31^6 ≡ 1 mod 18), so
// `(hash*31+c) % 18` collapses most inputs into a handful of buckets
// regardless of how well the hash itself is mixed.
function fnv1a(str: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function tagStyle(tag: string, colors?: Map<string, TagColor>): string {
	const { bg, fg } = colors?.get(tag) ?? PALETTE[fnv1a(tag) % PALETTE.length];
	return `--tag-bg:${bg};--tag-fg:${fg}`;
}
