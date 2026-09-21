import { fail } from '@sveltejs/kit';
import { getAllVisibleTags } from '$lib/server/patternTags';
import { clearTagColorOverride, getTagColorOverrides, setTagColorOverride } from '$lib/server/tagColorOverrides';
import { assignTagColors, PALETTE_SWATCHES, readableFg } from '$lib/tagColor';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
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
	// Any hex color -- the palette swatches are offered client-side only as
	// quick picks, never enforced here. The matching text color isn't taken
	// from the client: it's computed from the chosen background so it stays
	// readable regardless of what was submitted.
	setColor: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const tag = String(form.get('tag') ?? '').trim();
		const bg = String(form.get('bg') ?? '').trim().toLowerCase();
		if (!tag) return fail(400, { error: 'tag required' });
		if (!HEX_COLOR.test(bg)) return fail(400, { error: 'invalid color' });
		await setTagColorOverride(uid, tag, { bg, fg: readableFg(bg) });
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
