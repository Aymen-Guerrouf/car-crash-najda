import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AnswerTile } from '../components/AnswerTile';
import { AppText } from '../components/AppText';
import { Arch } from '../components/Arch';
import { LinkButton } from '../components/LinkButton';
import { ProgressBar } from '../components/ProgressBar';
import { QuestionArt } from '../components/QuestionArt';
import { Screen } from '../components/Screen';
import { QUESTIONS, SPEECH_LANG } from '../features/triage/questions';
import { useVoiceAnswer } from '../features/voice/useVoiceAnswer';
import { progress, walk, type Answer, type QuestionId } from '../features/triage/trees';
import { useDir, useT } from '../i18n/strings';
import { sendNowFlow, showFlowError } from '../services/flows';
import { advanceVictim, applyAnswer, escalateToAuto, pushReport, undoAnswer } from '../services/report';
import { useReportStore } from '../store/useReportStore';
import { colors, radius } from '../theme/tokens';

const REPEAT_MS = 15000; // no answer: ask again, slower (the microphone has had time to listen)
const GIVE_UP_MS = 30000; // still nothing: the person is not responding

function QuestionView({ question }: { question: QuestionId }) {
  const t = useT();
  const { language, row } = useDir();
  const draft = useReportStore((s) => s.draft)!;
  const active = useReportStore((s) => s.active);
  const victimTotal = useReportStore((s) => s.witness.total);
  const text = QUESTIONS[question][language];
  const prog = progress(draft.role, draft.answers);

  // The microphone stays closed while the phone is talking, or it would hear its own question
  const [speaking, setSpeaking] = useState(true);
  const speak = useCallback(
    (rate: number) => {
      Speech.stop();
      setSpeaking(true);
      const done = () => setSpeaking(false);
      Speech.speak(text, { language: SPEECH_LANG[language], rate, onDone: done, onStopped: done, onError: done });
    },
    [text, language],
  );

  const answer = useCallback(
    (v: Answer) => {
      Speech.stop();
      applyAnswer(question, v); // the report is sent once, when the questions are complete
    },
    [question],
  );

  // The person answering for themselves may not be able to use their hands: they can just say "oui" / "non"
  const handsFree = draft.role === 'VICTIM';
  const { listening } = useVoiceAnswer(handsFree && !speaking, (a) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    answer(a);
  });

  // Read the question aloud; ask again slower after 8 s; after 16 s treat it as no response
  useEffect(() => {
    speak(0.95);
    const again = setTimeout(() => speak(0.8), REPEAT_MS);
    const giveUp = setTimeout(() => {
      Speech.stop();
      const d = useReportStore.getState().draft!;
      if (d.role === 'VICTIM') {
        const auto = escalateToAuto();
        if (auto.mode === 'online') void pushReport().catch(() => {});
        router.replace('/send');
      } else {
        answer('unknown');
      }
    }, GIVE_UP_MS);
    return () => {
      clearTimeout(again);
      clearTimeout(giveUp);
      Speech.stop();
    };
  }, [speak, answer]);

  const back = () => {
    Speech.stop();
    if (!undoAnswer()) router.back();
  };

  return (
    <Screen
      scroll={false}
      footer={
        <>
          <Pressable accessibilityRole="button" onPress={() => answer('unknown')} style={styles.dontKnow}>
            <AppText variant="caption" weight="bold" color={colors.textMuted}>
              {t.dontKnow}
            </AppText>
          </Pressable>
          <LinkButton label={t.back} onPress={back} />
        </>
      }
    >
      <View style={styles.body}>
        <View style={styles.top}>
          <ProgressBar value={(prog.done + 1) / prog.total} />
          {draft.role !== 'VICTIM' && victimTotal > 1 && (
            <AppText variant="caption" weight="bold" color={colors.textMuted}>
              {t.victimOf(active + 1, victimTotal)}
            </AppText>
          )}
        </View>

        <View style={styles.art}>
          <Arch>
            <QuestionArt id={question} size={150} />
          </Arch>
        </View>

        <View style={styles.titleBlock}>
          <AppText variant="h1" weight="extrabold" center>
            {text}
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => speak(0.95)} style={[styles.repeat, { flexDirection: row }]}>
            <Ionicons name="volume-high" size={16} color={colors.textMuted} />
            <AppText variant="caption" weight="semibold" color={colors.textMuted}>
              {t.repeat}
            </AppText>
          </Pressable>
        </View>

        <View style={[styles.yesNo, { flexDirection: row }]}>
          <AnswerTile kind="yes" label={t.yes} onPress={() => answer('yes')} />
          <AnswerTile kind="no" label={t.no} onPress={() => answer('no')} />
        </View>

        {handsFree && (
          <View style={[styles.voice, { flexDirection: row, opacity: listening ? 1 : 0.5 }]}>
            <Ionicons name={listening ? 'mic' : 'mic-outline'} size={18} color={listening ? colors.triage.RED : colors.textMuted} />
            <AppText variant="caption" weight="bold" color={colors.textMuted}>
              {t.voiceHint}
            </AppText>
          </View>
        )}

        <Pressable
          accessibilityRole="link"
          onPress={() => {
            Speech.stop();
            sendNowFlow().catch((e) => showFlowError(e, t));
          }}
          style={styles.sendNow}
        >
          <AppText variant="caption" weight="semibold" color={colors.textFaint} underline>
            {t.sendNow}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

function ResultView() {
  const t = useT();
  const draft = useReportStore((s) => s.draft)!;

  useEffect(() => {
    const id = setTimeout(() => {
      if (draft.role === 'VICTIM') router.replace('/bodymap');
      else if (draft.updating) router.replace('/send'); // "Update situation": straight back to sending
      else if (advanceVictim() === 'done') router.replace('/witness/hazards');
      // 'next': the store now holds the next victim, this screen re-renders with their first question
    }, 1500);
    return () => clearTimeout(id);
  }, [draft.role, draft.updating]);

  return (
    <Screen scroll={false}>
      <View style={[styles.result, { backgroundColor: colors.triage[draft.triage] }]}>
        <Ionicons name="pulse" size={56} color={colors.onTriage[draft.triage]} />
        <AppText variant="overline" weight="bold" center color={colors.onTriage[draft.triage]}>
          {t.evaluationDone}
        </AppText>
        <AppText variant="h1" weight="extrabold" center color={colors.onTriage[draft.triage]}>
          {t.triage[draft.triage]}
        </AppText>
      </View>
    </Screen>
  );
}

export default function TriageScreen() {
  const draft = useReportStore((s) => s.draft);
  if (!draft) return <Redirect href="/" />;

  const step = walk(draft.role, draft.answers);
  return 'result' in step ? <ResultView key={draft.clientId} /> : <QuestionView key={`${draft.clientId}-${step.next}`} question={step.next} />;
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between', paddingBottom: 4 },
  top: { gap: 8 },
  art: { alignItems: 'center' },
  titleBlock: { gap: 10, alignItems: 'center' },
  repeat: { alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  yesNo: { gap: 12 },
  dontKnow: { alignSelf: 'center', paddingHorizontal: 18, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  sendNow: { alignSelf: 'center', paddingVertical: 4 },
  voice: { alignSelf: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 34, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  result: { flex: 1, margin: 20, borderRadius: radius.big, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
});
