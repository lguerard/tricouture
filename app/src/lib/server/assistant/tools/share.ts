// Tool "partager", in both the "patrons" and "projets" groups: share with
// another account of this Tricouture (read or edit), stop sharing, list who
// has access -- and, for a pattern, make it public for every account.
import type { ShareRole } from '$lib/server/access';
import {
	actions,
	ArgError,
	canSeePattern,
	done,
	id,
	NOT_FOUND,
	oneOf,
	p,
	projectAccess,
	str,
	type ToolSpec
} from '../toolkit';

const ROLES = { lecture: 'view', modification: 'edit', retirer: null } as const;

export const SHARE_TOOL: ToolSpec = {
	description:
		"Partage un patron ou un projet de la personne avec un autre compte (lecture ou modification), retire un partage, liste les partages, ou rend un patron public / privé pour tous les comptes.",
	parameters: {
		type: p('string', '"patron" ou "projet"'),
		id: p('string', "id de l'objet"),
		action: p('string', '"lecture", "modification", "retirer", "lister", "public" ou "prive"'),
		personne: p('string', 'nom ou e-mail du compte')
	},
	required: ['type', 'id', 'action'],
	async run(a, env) {
		const type = oneOf(a, 'type', ['patron', 'projet'] as const, true)!;
		const action = oneOf(a, 'action', ['lecture', 'modification', 'retirer', 'lister', 'public', 'prive'] as const, true)!;
		const act = actions(env);
		let target: { type: 'pattern' | 'project'; id: string; ownerId: string; title: string };
		if (type === 'patron') {
			const pat = await env.data.getPattern(id(a));
			if (!pat || !(await canSeePattern(env, pat))) return NOT_FOUND('Patron');
			target = { type: 'pattern', id: pat.id, ownerId: pat.ownerId, title: pat.title };
		} else {
			const prj = await env.data.getProject(id(a));
			if (!prj || !(await projectAccess(env, prj))) return NOT_FOUND('Projet');
			target = { type: 'project', id: prj.id, ownerId: prj.ownerId, title: prj.title };
		}
		if (target.ownerId !== env.uid) return { content: JSON.stringify({ erreur: 'seul·e la propriétaire peut gérer les partages' }), error: true };
		const what = target.type;
		const href = `/${target.type === 'pattern' ? 'patterns' : 'projects'}/${target.id}`;

		if (action === 'lister') return { content: JSON.stringify({ objet: target.title, partages: await act.sharesOf(target) }) };
		if (action === 'public' || action === 'prive') {
			if (target.type !== 'pattern') throw new ArgError('seul un patron peut être rendu public');
			await act.setPatternPublic(target.id, action === 'public');
			return done({ patron: target.title, public: action === 'public' }, { kind: 'updated', what, title: target.title, href });
		}
		const who = str(a, 'personne', 160, true)!;
		const person = await act.findPerson(env.uid, who);
		if (person === 'ambiguous') return { content: JSON.stringify({ erreur: `plusieurs comptes correspondent à "${who}" : précise l'e-mail` }), error: true };
		if (!person) return { content: JSON.stringify({ erreur: `aucun compte "${who}" sur ce Tricouture` }), error: true };
		await act.share(target, person, ROLES[action] as ShareRole | null);
		return done({ objet: target.title, personne: person.name, partage: action }, { kind: 'updated', what, title: target.title, href });
	}
};
