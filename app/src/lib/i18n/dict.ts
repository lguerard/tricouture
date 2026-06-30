// Translation dictionaries (fr/en). Flat dot-separated keys.
// Missing English keys fall back to French.

export type Locale = 'fr' | 'en';

export const LOCALES: { code: Locale; label: string }[] = [
	{ code: 'fr', label: 'FR' },
	{ code: 'en', label: 'EN' }
];

type Table = Record<string, string>;

export const dict: Record<Locale, Table> = {
	fr: {
		// Navigation
		'nav.dashboard': 'Tableau de bord',
		'nav.patterns': 'Patrons',
		'nav.projects': 'Projets',
		'nav.stash': 'Stock',
		'nav.calendar': 'Calendrier',
		'nav.goals': 'Objectifs',
		'nav.stats': 'Mon année',
		'nav.achievements': 'Succès',
		'nav.bins': 'Rangement',
		'nav.recipients': 'Destinataires',
		'nav.assistant': 'Assistant IA',
		'nav.gallery': 'Galerie',
		'nav.logout': 'Déconnexion',
		'common.language': 'Langue',

		// Auth
		'auth.login.subtitle': 'Connecte-toi pour accéder à tes patrons et projets.',
		'auth.email': 'Email',
		'auth.password': 'Mot de passe',
		'auth.signin': 'Se connecter',
		'auth.noAccount': 'Pas de compte ?',
		'auth.createAccount': 'Créer un compte',
		'auth.register.title': 'Créer un compte',
		'auth.register.note': 'Le premier compte créé devient administrateur.',
		'auth.displayName': 'Nom affiché',
		'auth.passwordHint': 'Mot de passe (8+ caractères)',
		'auth.create': 'Créer le compte',
		'auth.haveAccount': 'Déjà inscrit ?',

		// Dashboard
		'dash.hello': 'Bonjour {name} 👋',
		'dash.patterns': 'patrons',
		'dash.wip': 'projets en cours',
		'dash.yarns': 'laines en stock',
		'dash.recent': 'Projets récents',
		'dash.none': "Aucun projet pour l'instant.",
		'dash.create': 'Créer un projet',
		'dash.deadline': 'échéance'
	},
	en: {
		// Navigation
		'nav.dashboard': 'Dashboard',
		'nav.patterns': 'Patterns',
		'nav.projects': 'Projects',
		'nav.stash': 'Stash',
		'nav.calendar': 'Calendar',
		'nav.goals': 'Goals',
		'nav.stats': 'My year',
		'nav.achievements': 'Achievements',
		'nav.bins': 'Storage',
		'nav.recipients': 'Recipients',
		'nav.assistant': 'AI assistant',
		'nav.gallery': 'Gallery',
		'nav.logout': 'Log out',
		'common.language': 'Language',

		// Auth
		'auth.login.subtitle': 'Sign in to access your patterns and projects.',
		'auth.email': 'Email',
		'auth.password': 'Password',
		'auth.signin': 'Sign in',
		'auth.noAccount': 'No account?',
		'auth.createAccount': 'Create an account',
		'auth.register.title': 'Create an account',
		'auth.register.note': 'The first account created becomes administrator.',
		'auth.displayName': 'Display name',
		'auth.passwordHint': 'Password (8+ characters)',
		'auth.create': 'Create account',
		'auth.haveAccount': 'Already registered?',

		// Dashboard
		'dash.hello': 'Hello {name} 👋',
		'dash.patterns': 'patterns',
		'dash.wip': 'projects in progress',
		'dash.yarns': 'yarns in stash',
		'dash.recent': 'Recent projects',
		'dash.none': 'No project yet.',
		'dash.create': 'Create a project',
		'dash.deadline': 'due'
	}
};
