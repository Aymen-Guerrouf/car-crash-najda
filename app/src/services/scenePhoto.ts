import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { ApiError, uploadScenePhoto } from './api';

export type ScenePhotoStatus = 'idle' | 'uploading' | 'done' | 'failed' | 'denied';

const MAX_BYTES = 300 * 1024; // the backend refuses more

/** Pick an image from the gallery (demo: no camera) and shrink it (1024 px wide JPEG) until it fits the upload limit. */
async function pickScenePhoto(): Promise<string | 'denied' | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const shot = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (shot.canceled || !shot.assets[0]) return null;
  let uri = shot.assets[0].uri;
  for (const [width, compress] of [[1024, 0.5], [800, 0.4], [640, 0.35]] as const) {
    const small = await ImageManipulator.manipulateAsync(shot.assets[0].uri, [{ resize: { width } }], { compress, format: ImageManipulator.SaveFormat.JPEG });
    uri = small.uri;
    if (new File(uri).size <= MAX_BYTES) break;
  }
  return uri;
}

/** Choose a scene photo from the gallery and attach it to the report. The alert itself never waits for this. */
export async function sendScenePhoto(reportId: string, onStatus: (s: ScenePhotoStatus) => void): Promise<void> {
  const uri = await pickScenePhoto();
  if (uri === 'denied') return onStatus('denied');
  if (!uri) return;
  onStatus('uploading');
  try {
    await uploadScenePhoto(reportId, uri);
    onStatus('done');
  } catch (e) {
    console.warn('Scene photo upload failed', e instanceof ApiError ? `status=${e.status} code=${e.code} msg=${e.message}` : e);
    onStatus('failed');
  }
}
