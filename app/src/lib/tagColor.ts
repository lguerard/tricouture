// Tags are freeform strings (no tags table to store a color on), so we derive
// a color deterministically from the tag's text: same tag name -> same color
// everywhere, every time, with no data to maintain.
//
// The hue is picked from a fixed set of evenly-spaced steps rather than a
// raw `hash % 360`: two unrelated tags can hash to hues only a few degrees
// apart (e.g. "enfant"/"homme" landed 12° apart), and at the pale, low-
// saturation lightness a tag pill uses, anything closer than ~30° reads as
// the same color. 12 steps guarantees a real, visible difference between any
// two tags that land in different hue buckets.
//
// On top of that, a second, independent slice of the same hash picks one of
// 3 lightness/saturation variants -- 36 combinations total instead of 12, so
// two tags that happen to share a hue bucket (increasingly likely as a
// pattern library's tag vocabulary grows) still usually render as visibly
// different shades rather than identical pills. Only 1-in-36 pairs now match
// exactly, down from 1-in-12.
const HUE_STEPS = 12;
const VARIANTS = [
	{ s: 65, bgL: 92, fgL: 32 }, // pastel
	{ s: 55, bgL: 84, fgL: 26 }, // deeper
	{ s: 45, bgL: 96, fgL: 40 } // softer
];

// FNV-1a: unlike a plain polynomial hash (`hash*31 + c`), this doesn't lose
// distribution once reduced mod a small number -- 31 mod 12 has order 2
// (31*31 ≡ 1 mod 12), so `(hash*31+c) % 12` collapses most inputs into a
// handful of buckets regardless of how well the hash itself is mixed.
function fnv1a(str: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function tagColor(tag: string): { bg: string; fg: string } {
	const h = fnv1a(tag);
	const hue = (h % HUE_STEPS) * (360 / HUE_STEPS);
	// Mixed-radix split of the same hash: h = HUE_STEPS * floor(h/HUE_STEPS) + (h%HUE_STEPS),
	// so the variant comes from bits the hue bucket didn't use.
	const variant = VARIANTS[Math.floor(h / HUE_STEPS) % VARIANTS.length];
	return {
		bg: `hsl(${hue} ${variant.s}% ${variant.bgL}%)`,
		fg: `hsl(${hue} ${variant.s}% ${variant.fgL}%)`
	};
}

export function tagStyle(tag: string): string {
	const { bg, fg } = tagColor(tag);
	return `--tag-bg:${bg};--tag-fg:${fg}`;
}
