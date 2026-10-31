# Nadjda — First-aid instructions (source for the UI/illustration design)

Source of truth in code: `app/src/content/firstAid.ts`. Each **set** is a swipeable carousel of **step cards**.
The screen shows the sets that match the report's flags (priority order below), then always the generic set last.
All text is offline (bundled in the app). Languages: French (LTR) and Arabic (RTL) — every card must work in both.

> Medical content is basic guidance. Have it reviewed against an official first-aid source
> (Croissant-Rouge algérien / Red Cross) before the demo.

## Card anatomy (current app)

- Big number badge (black circle, white digit) + "Étape 2 sur 4" caption
- One large illustration (128–156 px, in a soft round/arch container)
- One instruction, 1 sentence, large type (Montserrat 800 FR / IBM Plex Sans Arabic bold AR)
- "Lire à voix haute" button (text to speech) · pager dots · swipe between cards
- Tokens: bg `#F4F0EF`, card `#FFFFFF`, ink `#111111`, muted `#55504E`, soft grey `#EAE5E3`,
  red `#D0021B`, yellow `#F4B400`, green `#16804A`, blue `#2457E6`; radius 24 / pill 999; flat 3D-style illustrations

---

## 1. `not-breathing` — Ne respire pas · لا يتنفس
Trigger flag: `NOT_BREATHING` (priority 1)

| # | Français | العربية | Illustration brief |
|---|---|---|---|
| 1 | Appelez le 14 maintenant. | اتصل بـ 14 الآن. | Hand holding a phone, big "14" on the screen, red call button |
| 2 | Posez le talon de la main au centre de la poitrine. | ضع كعب يدك في وسط الصدر. | Top view of a person lying on their back, one hand (heel of the palm) on the centre of the chest, target mark |
| 3 | Poussez fort et vite, environ 2 fois par seconde. | اضغط بقوة وسرعة، حوالي ضغطتين في الثانية. | Straight arms pushing down on the chest, arrows up/down, rhythm pulse (heart / metronome) |
| 4 | Continuez sans arrêt jusqu'à l'arrivée des secours. | استمر دون توقف حتى وصول النجدة. | Continued compressions + ambulance arriving in the background |

## 2. `bleeding` — Saignement · نزيف
Trigger flags: `BLEEDING` or `CHECK_BLEEDING` (priority 2)

| # | Français | العربية | Illustration brief |
|---|---|---|---|
| 1 | Appuyez fermement sur la plaie avec un tissu propre. | اضغط بقوة على الجرح بقطعة قماش نظيفة. | Hand pressing a clean cloth on an arm wound, downward arrow |
| 2 | N'enlevez pas le tissu imbibé : ajoutez-en un autre dessus. | لا تُزل القماش المبلل، بل ضع قماشًا آخر فوقه. | Stack of two cloths on the wound, the first one stained red, a "+" and a "no removal" cue |
| 3 | Continuez à appuyer jusqu'à l'arrivée des secours. | استمر في الضغط حتى وصول النجدة. | Steady pressure, clock/timer, ambulance in the distance |

## 3. `spine` — Tête, cou ou dos · الرأس أو الرقبة أو الظهر
Trigger flags: `CANNOT_MOVE` or `HEAD` (priority 3)

| # | Français | العربية | Illustration brief |
|---|---|---|---|
| 1 | Ne déplacez pas la personne. | لا تحرّك المصاب. | Person lying down, big "do not move" sign (crossed arrows) |
| 2 | Gardez sa tête et son cou immobiles. | أبقِ رأسه ورقبته ثابتين. | Two hands holding the head steady on both sides, neck line highlighted |
| 3 | Parlez-lui pour la rassurer. | تحدث إليه لطمأنته. | Speech bubble with a reassuring heart/check next to the person |

## 4. `unresponsive` — Ne répond pas · لا يستجيب
Trigger flag: `UNRESPONSIVE` (priority 4)

| # | Français | العربية | Illustration brief |
|---|---|---|---|
| 1 | Vérifiez qu'elle respire. | تحقق من أنه يتنفس. | Face close to the mouth/chest: look, listen, feel (eye, ear, chest rise) |
| 2 | Ne bougez pas le cou sauf danger immédiat. | لا تحرّك الرقبة إلا عند الخطر المباشر. | Neck highlighted with a "stop / do not move" cue, small danger exception icon |
| 3 | Si besoin de la déplacer : position latérale de sécurité. | إذا لزم تحريكه: ضعه على جنبه (وضعية الإفاقة). | Person lying on their side, top arm and leg bent (recovery position) |

## 5. `fire` — Feu ou fumée · نار أو دخان
Trigger flags: `FIRE` or `SMOKE` (priority 5)

| # | Français | العربية | Illustration brief |
|---|---|---|---|
| 1 | Restez à distance du véhicule. | ابتعد عن السيارة. | Burning/smoking car, person walking away, distance arrow |
| 2 | Ne déplacez la personne que si le feu la menace. | لا تحرّك المصاب إلا إذا كانت النار تهدده. | Person near flames being pulled to safety — shown as the exception, not the rule |

## 6. `default` — Les bons réflexes · التصرفات الصحيحة
Always shown last (and alone when no flag matches)

| # | Français | العربية | Illustration brief |
|---|---|---|---|
| 1 | Allumez les feux de détresse. | شغّل أضواء التحذير. | Car rear with orange hazard lights on, warning triangle |
| 2 | Restez en dehors de la route. | ابقَ خارج الطريق. | Person standing on the verge / behind the guardrail, road with a car |
| 3 | Rassurez la personne. | طمئن المصاب. | Two people, one with a hand on the other's shoulder, calm speech bubble |
| 4 | Ne donnez ni à boire ni à manger. | لا تعطه ماءً ولا طعامًا. | Water bottle and food crossed out |

---

**Totals:** 6 sets, 19 step cards, 2 languages = 38 texts. Scene ids used by the code (`FirstAidArt.tsx`):
`not-breathing:0-3`, `bleeding:0-2`, `spine:0-2`, `unresponsive:0-2`, `fire:0-1`, `default:0-3`.

## Prompt starter for an image/UI generator

> Modern, calm mobile emergency app card. Warm off-white background (#F4F0EF), white rounded card (radius 24), black number
> badge, large soft 3D flat illustration of: <ILLUSTRATION BRIEF>. Below it, the instruction "<TEXT>" in bold Montserrat
> (or IBM Plex Sans Arabic for RTL), a black pill button "Lire à voix haute", pager dots. High contrast, no clutter, readable
> in bright sunlight, one idea per card. Red (#D0021B) only for urgency.
