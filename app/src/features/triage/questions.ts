import type { Language } from '../../types';
import type { QuestionId } from './trees';

// Short, yes/no-answerable questions (≤ 8 words, plan §11.13). Arabic is a draft for native review.
export const QUESTIONS: Record<QuestionId, Record<Language, string>> = {
  v_bleeding: { fr: 'Saignez-vous beaucoup ?', ar: 'هل تنزف بشدة؟' },
  v_move: { fr: 'Pouvez-vous bouger bras et jambes ?', ar: 'هل تستطيع تحريك ذراعيك وساقيك؟' },
  v_head: { fr: 'Avez-vous reçu un coup à la tête ?', ar: 'هل تعرضت لضربة في الرأس؟' },

  walk: { fr: 'La personne peut-elle marcher ?', ar: 'هل يستطيع المصاب المشي؟' },
  breathing: { fr: 'La personne respire-t-elle ?', ar: 'هل يتنفس المصاب؟' },
  airway: { fr: 'Penchez sa tête en arrière. Respire-t-elle ?', ar: 'أمِل رأسه إلى الخلف. هل يتنفس الآن؟' },
  fast: { fr: 'Respire-t-elle très vite ?', ar: 'هل يتنفس بسرعة كبيرة؟' },
  responds: { fr: 'Répond-elle quand vous parlez ?', ar: 'هل يرد عندما تتحدث إليه؟' },
  bleeding: { fr: 'Y a-t-il un saignement important ?', ar: 'هل هناك نزيف شديد؟' },
};

export const SPEECH_LANG: Record<Language, string> = { fr: 'fr-FR', ar: 'ar-SA' };
