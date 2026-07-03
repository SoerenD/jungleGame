/** Lore tablets scattered through the World. Ids match world-data tablet spots. */
export interface Tablet {
  id: string;
  title: string;
  text: string;
}

export const TABLETS: Record<string, Tablet> = {
  t0: {
    id: 't0',
    title: 'The First Tablet',
    text: 'We came to this jungle with nothing but our hands. The trees gave wood, the rocks gave stone — and the jungle always healed behind us. Whatever you take, it returns. Whatever you build, it remains.',
  },
  t1: {
    id: 't1',
    title: 'Tablet of the Grove',
    text: 'West of the great crossing lies a grove that hides from hurried eyes. Its gate of vines answers neither blade nor fire. Bring the jungle its own gifts: two of its sweetness, two of its threads — and lay them upon the altar.',
  },
  t2: {
    id: 't2',
    title: 'Tablet of the Falls',
    text: 'The falls have thundered since before the first hut rose. Listen closely at dusk: the water speaks louder when the light dies. Those who built the ruins bathed here before every harvest.',
  },
  t3: {
    id: 't3',
    title: 'Tablet of the Buried',
    text: 'The old ones buried their treasures where no map shows whole. Torn pieces drift back on the wind when the jungle is worked — gather three, and the earth itself will mark the spot. Dig where the X stands.',
  },
  t4: {
    id: 't4',
    title: 'The Last Tablet',
    text: 'A golden idol watches over every camp that earned it. Place it proudly. The swamp swallows the careless, the ruins reward the patient, and the jungle remembers every fence, fire and wall you leave behind.',
  },
  t5: {
    id: 't5',
    title: 'Tablet of the Seal',
    text: 'We could not slay what slumbers in the arena, so we walled it behind a debt: wood, stone, thread and sweetness, given freely and together. When the jungle has been repaid in full, the Seal will open — and whoever dares may wake the Guardian with an Offering upon its altar. Its scales are the only key to the black rock and the ancient wood.',
  },
};

/** Intro story — shown once per Player on first join, re-readable at the Welcome Stone. */
export const INTRO_TITLE = 'The Jungle Remembers';
export const INTRO_TEXT = `The jungle remembers. Whatever you take, it returns; whatever you build, it remains.

You and your friends share one world. Gather wood, stone, fiber and fruit; craft tools; build a camp that outlasts you.

But deep in the Ruins something older sleeps. The ancients sealed it behind a wall of offerings — bring the jungle's gifts to the Seal, all of you together, and it will open.

Beyond the Guardian's slumber lie the black rock no pickaxe can break and the ancient hardwood no axe can cut. Earn its scales. Master the jungle.`;
