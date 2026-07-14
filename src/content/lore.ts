/** Lore tablets scattered through the World. Ids match world-data tablet spots. */
import { pick } from '../i18n';

export interface Tablet {
  id: string;
  title: string;
  text: string;
}

const TABLETS_EN: Record<string, Tablet> = {
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
    text: 'A golden idol watches over every camp that earned it. Place it proudly. The swamp swallows the careless, the ruins reward the patient, and the jungle remembers every fire and wall you leave behind.',
  },
  t5: {
    id: 't5',
    title: 'Tablet of the Seal',
    text: 'We could not slay what slumbers in the arena, so we walled it behind a debt: wood, stone, thread and sweetness, given freely and together. When the jungle has been repaid in full, the Seal will open — and whoever dares may wake the Guardian with an Offering upon its altar. Its scales are the only key to the black rock and the ancient wood.',
  },
  t6: {
    id: 't6',
    title: 'Tablet of the Frontier',
    text: 'Those who feared the crowded heart walked east until the paths ran out, and south until the sea. They found black rock and ancient wood among these overgrown stones, and a coast where the fish run thick. Climb the high crags and the whole frontier lays itself bare. The jungle is wider than any one camp — go and see it.',
  },
  t7: {
    id: 't7',
    title: 'Tablet of the Tide',
    text: 'When the coast drowned, the sea did not take the reeds — it only hid them, and gives them back twice a turning. The Mire Warden guards the low water; wake it at the megalith on the Mangrove Coast, and its fall unlocks this drowned realm forever. Learn the tide: wade when the water ebbs and cut the salt-reed exposed, temper it in the Brine Kiln, and the tideglass will carry the sea in your stride. The tide keeps no clock but its own — come back for it.',
  },
  t8: {
    id: 't8',
    title: 'Tablet of the Hushdark',
    text: 'Below the Cavern Mouth the world falls silent, and silence here has a memory. The Echo Warden hoards it; wake it at the maw, and its fall opens the Hushdark forever. In this dark your own steps linger — walk, and a shade of you walks the same path again and again, twenty breaths without end. The old vaults will not answer one traveller: lay the shades of your absent kin upon the pedestals together, and when they all stand as one the stone remembers enough to open. Cut the echo crystal, ring it in the Chime Kiln, and hushsteel will still the din around your brow.',
  },
  t9: {
    id: 't9',
    title: 'Tablet of the Deep Vault',
    text: 'Deeper still the Hushdark keeps what the first vault only hinted: that a shade, once laid, outlasts the one who cast it. The old masters did not hoard this place — they left themselves in it, so no traveller after them would walk it alone. Open the deep court, and the stone offers you the same. Leave your shade upon the memorial, named, and walk on: those who come after will find you waiting, and know the way is passable.',
  },
  t10: {
    id: 't10',
    title: 'Tablet of the Season',
    text: 'High on the terraced hillsides the jungle turns to field, and the field keeps its own season. The Verdant Warden watches the ripening; wake it at the altar on the terraced hillside, and its fall opens the Green Terraces forever. Learn the cultivation: wildgrain ripens by no hand but the sun’s, each bed golden in its own turn — walk the field, and reap only where the grain stands ripe. Ret it into verdant fibre at the Verdant Loom, and weave the cuirass that lets every strike flow like wind through grass. The season keeps no clock but its own — come back when the field has turned again.',
  },
};

const TABLETS_DE: Record<string, Tablet> = {
  t0: {
    id: 't0',
    title: 'Die Erste Steintafel',
    text: 'Wir kamen in diesen Dschungel mit nichts als unseren Händen. Die Bäume gaben Holz, die Felsen gaben Stein — und der Dschungel heilte stets hinter uns. Was du nimmst, kehrt zurück. Was du baust, bleibt bestehen.',
  },
  t1: {
    id: 't1',
    title: 'Steintafel des Hains',
    text: 'Westlich der großen Furt liegt ein Hain, der sich vor hastigen Augen verbirgt. Sein Rankentor weicht weder Klinge noch Feuer. Bring dem Dschungel seine eigenen Gaben: zwei seiner Süße, zwei seiner Fäden — und lege sie auf den Altar.',
  },
  t2: {
    id: 't2',
    title: 'Steintafel der Wasserfälle',
    text: 'Die Wasserfälle donnern, seit die erste Hütte stand. Lausche genau in der Dämmerung: Das Wasser spricht lauter, wenn das Licht erstirbt. Jene, die die Ruinen bauten, badeten hier vor jeder Ernte.',
  },
  t3: {
    id: 't3',
    title: 'Steintafel des Vergrabenen',
    text: 'Die Alten vergruben ihre Schätze, wo keine Karte sie ganz zeigt. Zerrissene Fetzen treiben im Wind zurück, wenn im Dschungel gearbeitet wird — sammle drei, und die Erde selbst wird die Stelle markieren. Grabe, wo das ✕ steht.',
  },
  t4: {
    id: 't4',
    title: 'Die Letzte Steintafel',
    text: 'Ein goldenes Götzenbild wacht über jedes Lager, das es sich verdient hat. Stell es voller Stolz auf. Der Sumpf verschlingt die Achtlosen, die Ruinen belohnen die Geduldigen, und der Dschungel erinnert sich an jedes Feuer und jede Wand, die du zurücklässt.',
  },
  t5: {
    id: 't5',
    title: 'Steintafel des Siegels',
    text: 'Wir konnten nicht erschlagen, was in der Arena schlummert, also mauerten wir es hinter einer Schuld ein: Holz, Stein, Faden und Süße, frei und gemeinsam gegeben. Wenn der Dschungel voll entlohnt ist, öffnet sich das Siegel — und wer es wagt, mag den Wächter mit einer Opfergabe auf seinem Altar wecken. Seine Schuppen sind der einzige Schlüssel zum schwarzen Gestein und zum uralten Holz.',
  },
  t6: {
    id: 't6',
    title: 'Steintafel der Grenzlande',
    text: 'Jene, die das überfüllte Herz mieden, gingen ostwärts, bis die Pfade endeten, und südwärts bis zum Meer. Sie fanden schwarzes Gestein und uraltes Holz zwischen diesen überwucherten Steinen und eine Küste, an der die Fische dicht ziehen. Erklimme die hohen Klippen, und die ganzen Grenzlande liegen offen vor dir. Der Dschungel ist weiter als jedes einzelne Lager — geh und sieh ihn dir an.',
  },
  t7: {
    id: 't7',
    title: 'Steintafel der Gezeiten',
    text: 'Als die Küste ertrank, nahm das Meer die Riede nicht — es verbarg sie nur und gibt sie bei jeder Wende zweimal zurück. Der Moorwächter hütet das niedrige Wasser; weck ihn am Megalithen an der Mangrovenküste, und sein Fall öffnet dieses ertrunkene Land für immer. Lerne die Gezeit: wate, wenn das Wasser ebbt, und schneide das freiliegende Salzried, härte es im Sole-Ofen, und das Gezeitenglas trägt das Meer in deinem Schritt. Die Gezeit kennt keine Uhr als ihre eigene — komm für sie wieder.',
  },
  t8: {
    id: 't8',
    title: 'Steintafel der Grabesstille',
    text: 'Unter dem Höhlenschlund verstummt die Welt, und die Stille hat hier ein Gedächtnis. Der Echowächter hütet sie; weck ihn am Schlund, und sein Fall öffnet die Grabesstille für immer. In dieser Dunkelheit verweilen deine eigenen Schritte — geh, und ein Schatten deiner selbst geht denselben Pfad wieder und wieder, zwanzig Atemzüge ohne Ende. Die alten Gewölbe antworten keinem einzelnen Wanderer: lege die Schatten deiner abwesenden Gefährten gemeinsam auf die Podeste, und wenn sie alle wie einer stehen, erinnert sich der Stein genug, um sich zu öffnen. Schneide den Echokristall, läutere ihn im Klang-Ofen, und Klangstahl beruhigt das Getöse um deine Stirn.',
  },
  t9: {
    id: 't9',
    title: 'Steintafel des Tiefen Gewölbes',
    text: 'Tiefer noch hütet die Grabesstille, was das erste Gewölbe nur andeutete: dass ein Schatten, einmal gelegt, den überdauert, der ihn warf. Die alten Meister horteten diesen Ort nicht — sie ließen sich selbst darin zurück, damit kein Wanderer nach ihnen ihn allein ginge. Öffne den tiefen Hof, und der Stein bietet dir dasselbe. Lege deinen Schatten, benannt, auf das Mahnmal und geh weiter: die nach dir kommen, werden dich wartend finden und wissen, dass der Weg begehbar ist.',
  },
  t10: {
    id: 't10',
    title: 'Steintafel der Ernte',
    text: 'Hoch auf den terrassierten Hängen wird der Dschungel zum Feld, und das Feld hält seine eigene Jahreszeit. Der Grünwächter wacht über das Reifen; weck ihn am Altar am terrassierten Hang, und sein Fall öffnet die Grünen Terrassen für immer. Lerne den Anbau: Wildkorn reift durch keine Hand als die der Sonne, jede Bank golden zu ihrer eigenen Wende — geh das Feld ab und ernte nur, wo das Korn reif steht. Röste es am Grünwebstuhl zu Grünfaser und webe den Kürass, der jeden Schlag wie Wind durch Gras fließen lässt. Die Jahreszeit kennt keine Uhr als ihre eigene — komm wieder, wenn das Feld sich erneut gewendet hat.',
  },
};

/** Lore tablets in the session's language (ids match world-data tablet spots). */
export const TABLETS: Record<string, Tablet> = pick(TABLETS_EN, TABLETS_DE);

/** Intro story — shown once per Player on first join, re-readable at the Welcome Stone. */
export const INTRO_TITLE = pick('The Jungle Remembers', 'Der Dschungel erinnert sich');
export const INTRO_TEXT = pick(
  `The jungle remembers. Whatever you take, it returns; whatever you build, it remains.

You and your friends share one world. Gather wood, stone, fiber and fruit; craft tools; build a camp that outlasts you.

But deep in the Ruins something older sleeps. The ancients sealed it behind a wall of offerings — bring the jungle's gifts to the Seal, all of you together, and it will open.

Beyond the Guardian's slumber lie the black rock no pickaxe can break and the ancient hardwood no axe can cut. Earn its scales. Master the jungle.`,
  `Der Dschungel erinnert sich. Was du nimmst, kehrt zurück; was du baust, bleibt bestehen.

Du und deine Freunde teilt euch eine Welt. Sammelt Holz, Stein, Fasern und Frucht; stellt Werkzeuge her; baut ein Lager, das euch überdauert.

Doch tief in den Ruinen schläft etwas Älteres. Die Alten versiegelten es hinter einer Mauer aus Opfergaben — bringt die Gaben des Dschungels zum Siegel, ihr alle gemeinsam, und es wird sich öffnen.

Jenseits des Schlummers des Wächters liegen das schwarze Gestein, das keine Spitzhacke bricht, und das uralte Hartholz, das keine Axt fällt. Verdiene dir seine Schuppen. Meistere den Dschungel.`,
);
