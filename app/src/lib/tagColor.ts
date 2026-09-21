// Tags are freeform strings (no tags table to store a color on), so we derive
// a color deterministically from the tag's text: same tag name -> same color
// everywhere, every time, with no data to maintain.
//
// The hue is picked from a fixed set of evenly-spaced steps rather than a
// raw `hash % 360`: two unrelated tags can hash to hues only a few degrees
// apart (e.g. "enfant"/"homme" landed 12° apart), and at the pale, low-
// saturation lightness a tag pill uses, anything closer than ~30° reads as
// the same color. 12 steps guarantees a real, visible difference between any
// two tags that don't land in the exact same bucket; past 12 distinct tags,
// buckets repeat -- an acceptable tradeoff since tags stay distinguishable
// by their label either way.
const HUE_STEPS = 12;

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
	const hue = (fnv1a(tag) % HUE_STEPS) * (360 / HUE_STEPS);
	return {
		bg: `hsl(${hue} 65% 92%)`,
		fg: `hsl(${hue} 55% 32%)`
	};
}

export function tagStyle(tag: string): string {
	const { bg, fg } = tagColor(tag);
	return `--tag-bg:${bg};--tag-fg:${fg}`;
}
