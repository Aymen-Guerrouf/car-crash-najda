import type { Flag, Language } from '../types';

// Pre-written, offline first-aid steps (plan §8.5). Basic guidance only: have it reviewed against an
// official first-aid source (Croissant-Rouge / Red Cross) before the demo.
export interface FirstAidSet {
  id: string;
  title: Record<Language, string>;
  steps: Record<Language, string[]>;
}

const SETS: { when: (flags: Flag[]) => boolean; set: FirstAidSet }[] = [
  {
    when: (f) => f.includes('NOT_BREATHING'),
    set: {
      id: 'not-breathing',
      title: { fr: 'Ne respire pas', ar: 'لا يتنفس' },
      steps: {
        fr: ['Appelez le 14 maintenant.', 'Posez le talon de la main au centre de la poitrine.', 'Poussez fort et vite, environ 2 fois par seconde.', 'Continuez sans arrêt jusqu’à l’arrivée des secours.'],
        ar: ['اتصل بـ 14 الآن.', 'ضع كعب يدك في وسط الصدر.', 'اضغط بقوة وسرعة، حوالي ضغطتين في الثانية.', 'استمر دون توقف حتى وصول النجدة.'],
      },
    },
  },
  {
    when: (f) => f.includes('BLEEDING') || f.includes('CHECK_BLEEDING'),
    set: {
      id: 'bleeding',
      title: { fr: 'Saignement', ar: 'نزيف' },
      steps: {
        fr: ['Appuyez fermement sur la plaie avec un tissu propre.', 'N’enlevez pas le tissu imbibé : ajoutez-en un autre dessus.', 'Continuez à appuyer jusqu’à l’arrivée des secours.'],
        ar: ['اضغط بقوة على الجرح بقطعة قماش نظيفة.', 'لا تُزل القماش المبلل، بل ضع قماشًا آخر فوقه.', 'استمر في الضغط حتى وصول النجدة.'],
      },
    },
  },
  {
    when: (f) => f.includes('CANNOT_MOVE') || f.includes('HEAD'),
    set: {
      id: 'spine',
      title: { fr: 'Tête, cou ou dos', ar: 'الرأس أو الرقبة أو الظهر' },
      steps: {
        fr: ['Ne déplacez pas la personne.', 'Gardez sa tête et son cou immobiles.', 'Parlez-lui pour la rassurer.'],
        ar: ['لا تحرّك المصاب.', 'أبقِ رأسه ورقبته ثابتين.', 'تحدث إليه لطمأنته.'],
      },
    },
  },
  {
    when: (f) => f.includes('UNRESPONSIVE'),
    set: {
      id: 'unresponsive',
      title: { fr: 'Ne répond pas', ar: 'لا يستجيب' },
      steps: {
        fr: ['Vérifiez qu’elle respire.', 'Ne bougez pas le cou sauf danger immédiat.', 'Si besoin de la déplacer : position latérale de sécurité.'],
        ar: ['تحقق من أنه يتنفس.', 'لا تحرّك الرقبة إلا عند الخطر المباشر.', 'إذا لزم تحريكه: ضعه على جنبه (وضعية الإفاقة).'],
      },
    },
  },
  {
    when: (f) => f.includes('FIRE') || f.includes('SMOKE'),
    set: {
      id: 'fire',
      title: { fr: 'Feu ou fumée', ar: 'نار أو دخان' },
      steps: {
        fr: ['Restez à distance du véhicule.', 'Ne déplacez la personne que si le feu la menace.'],
        ar: ['ابتعد عن السيارة.', 'لا تحرّك المصاب إلا إذا كانت النار تهدده.'],
      },
    },
  },
];

const DEFAULT_SET: FirstAidSet = {
  id: 'default',
  title: { fr: 'Les bons réflexes', ar: 'التصرفات الصحيحة' },
  steps: {
    fr: ['Allumez les feux de détresse.', 'Restez en dehors de la route.', 'Rassurez la personne.', 'Ne donnez ni à boire ni à manger.'],
    ar: ['شغّل أضواء التحذير.', 'ابقَ خارج الطريق.', 'طمئن المصاب.', 'لا تعطه ماءً ولا طعامًا.'],
  },
};

/** Matching sets in priority order, always ending with the generic reflexes. */
export function firstAidFor(flags: Flag[]): FirstAidSet[] {
  const matched = SETS.filter((s) => s.when(flags)).map((s) => s.set);
  return [...matched, DEFAULT_SET];
}
