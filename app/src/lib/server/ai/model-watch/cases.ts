// Golden test cases for the monthly model-watch evaluation: realistic
// extracted-pattern-text snippets (one per craft, each with some real-world
// noise — a scraped PDF header/footer, a casual spoken-style transcript)
// paired with what a correct pieces extraction should contain. Kept small
// and in French to match PIECES_SYSTEM's actual domain and audience.

export type ModelWatchCase = {
	id: string;
	craft: 'couture' | 'tricot' | 'crochet';
	description: string;
	input: string;
	expected: {
		nameKeywords: string[];
		minPieces: number;
		maxPieces: number;
		// Exactly one of these is set, matching the craft: tricot/crochet
		// pieces carry a row count, couture pieces carry a cut quantity.
		rowsPiece?: { keyword: string; rows: number; tolerance: number };
		quantityPiece?: { keyword: string; quantity: number };
	};
};

export const MODEL_WATCH_CASES: ModelWatchCase[] = [
	{
		id: 'tricot-pull',
		craft: 'tricot',
		description: 'Patron tricot propre, sans bruit.',
		input: `Pull raglan tricoté de haut en bas, taille M.

DOS : monter 90 mailles. Tricoter au point jersey. Rangs 1 à 84 : jersey. Rabattre.

DEVANT : monter 90 mailles. Identique au dos jusqu'au rang 70, puis façonner l'encolure. Total 84 rangs.

MANCHE (x2) : monter 40 mailles. Augmenter de chaque côté tous les 6 rangs. Tricoter 52 rangs au total.

COL : monter 100 mailles au point mousse, tricoter 8 rangs, rabattre.`,
		expected: {
			nameKeywords: ['dos', 'devant', 'manche', 'col'],
			minPieces: 3,
			maxPieces: 6,
			rowsPiece: { keyword: 'dos', rows: 84, tolerance: 6 }
		}
	},
	{
		id: 'couture-jupe',
		craft: 'couture',
		description: 'Patron couture façon PDF scrapé : en-tête/pied de page, mise en page bruitée.',
		input: `Patron n°42 — Jupe évasée
Burda Style — page 3/12

Pièces à couper dans le tissu principal :
- Devant jupe x1 (sur pli)
- Dos jupe x2
- Ceinture x1 (sur pli)
- Poche x4

Thermocollant : Entoilage ceinture x1

Instructions de montage page suivante...

© Burda 2023 — reproduction interdite`,
		expected: {
			nameKeywords: ['devant', 'dos', 'ceinture', 'poche'],
			minPieces: 3,
			maxPieces: 6,
			quantityPiece: { keyword: 'dos', quantity: 2 }
		}
	},
	{
		id: 'crochet-bonnet',
		craft: 'crochet',
		description: 'Patron crochet façon transcription orale : familier, hésitations.',
		input: `Alors pour ce bonnet au crochet, on va faire trois parties : le corps du bonnet, le pompon et
la bordure. Pour le corps, on monte un cercle magique et on augmente jusqu'à avoir 60 mailles,
puis on crochète tout droit pendant environ 45 tours au total. Pour la bordure, on fait 6 tours
de mailles serrées. Le pompon, pas besoin de rangs, on l'assemble à la fin.`,
		expected: {
			nameKeywords: ['corps', 'bordure', 'pompon'],
			minPieces: 2,
			maxPieces: 4,
			rowsPiece: { keyword: 'corps', rows: 45, tolerance: 8 }
		}
	}
];
