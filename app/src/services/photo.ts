import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ApiError, isMockApi, uploadProfilePhoto } from './api';

export type PhotoStatus = 'idle' | 'uploading' | 'saved' | 'local' | 'failed' | 'denied';

/** Pick a square photo from the library and shrink it (600 px, JPEG 0.7) so the upload stays small and fast. */
export async function pickProfilePhoto(): Promise<string | 'denied' | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (res.canceled || !res.assets[0]) return null;
  const small = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 600 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return small.uri;
}

/** Upload to the backend (Cloudinary). Returns the hosted URL, or why it could not. */
export async function uploadPhoto(uri: string): Promise<{ url: string } | { status: 'local' | 'failed' }> {
  if (isMockApi) return { status: 'local' };
  try {
    return { url: await uploadProfilePhoto(uri) };
  } catch (e) {
    console.warn('Profile photo upload failed', e instanceof ApiError ? `status=${e.status} code=${e.code} msg=${e.message}` : e);
    return { status: 'failed' };
  }
}
