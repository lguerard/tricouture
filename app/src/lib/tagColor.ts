// Tags are freeform strings (no tags table to store a color on), so we derive
// a color deterministically from the tag's text: same tag name -> same color
// everywhere, every time, with no data to maintain.
export function tagColor(tag: string): { bg: string; fg: string } {
	let hash = 0;
	for (let i = 0; i < tag.length; i++) {
		hash = (hash << 5) - hash + tag.charCodeAt(i);
		hash |= 0;
	}
	const hue = Math.abs(hash) % 360;
	return {
		bg: `hsl(${hue} 65% 92%)`,
		fg: `hsl(${hue} 55% 32%)`
	};
}

export function tagStyle(tag: string): string {
	const { bg, fg } = tagColor(tag);
	return `--tag-bg:${bg};--tag-fg:${fg}`;
}
