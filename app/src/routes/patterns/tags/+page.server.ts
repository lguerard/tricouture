import { fail } from '@sveltejs/kit';
import { getAllVisibleTags } from '$lib/server/patternTags';
import { clearTagColorOverride, getTagColorOverrides, setTagColorOverride } from '$lib/server/tagColorOverrides';
import { assignTagColors, PALETTE_SWATCHES } from '$lib/tagColor';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;
	const allTags = await getAllVisibleTags(uid);
	const overrides = await getTagColorOverrides(uid);
	const tagColors = assignTagColors(allTags, overrides);
	return {
		allTags,
		colors: tagColors,
		overriddenTags: [...overrides.keys()],
		palette: PALETTE_SWATCHES
	};
};

export const actions: Actions = {
	// Pick a swatch (only the site's own palette is offered, so a manual
	// choice still fits the rest of the app -- not a free-form color picker).
	setColor: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const tag = String(form.get('tag') ?? '').trim();
		const bg = String(form.get('bg') ?? '');
		const fg = String(form.get('fg') ?? '');
		if (!tag) return fail(400, { error: 'tag required' });
		const isPaletteEntry = PALETTE_SWATCHES.some((s) => s.bg === bg && s.fg === fg);
		if (!isPaletteEntry) return fail(400, { error: 'invalid color' });
		await setTagColorOverride(uid, tag, { bg, fg });
		return { ok: true };
	},

	// Back to the automatic, index-based color.
	resetColor: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const tag = String(form.get('tag') ?? '').trim();
		if (!tag) return fail(400, { error: 'tag required' });
		await clearTagColorOverride(uid, tag);
		return { ok: true };
	}
};
