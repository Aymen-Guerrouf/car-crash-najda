"""Log-mel features, written in plain numpy from an exact spec so the TypeScript port can reproduce it bit for bit
(within float tolerance). Do NOT swap this for librosa/torchaudio: the app cannot run those.

SPEC (every number here is part of the contract; `voice_parity_vectors.json` pins it):
  input    : 16000 float samples in [-1, 1] (1.0 s, 16 kHz mono). Shorter -> centred zero pad, longer -> loudest second.
  frames   : window 400, hop 160, NO centre padding  ->  1 + (16000 - 400) // 160 = 98 frames
  window   : periodic Hann, w[n] = 0.5 - 0.5 * cos(2*pi*n / 400)
  spectrum : real FFT of the windowed frame zero-padded to 512, power |X|^2  (257 bins), no pre-emphasis
  mel      : 40 triangular filters, HTK scale mel = 2595*log10(1 + f/700), edges 20 Hz .. 7600 Hz, no area normalisation
  log      : ln(mel_energy + 1e-8)   (1e-6 broke gain invariance for signals below ~0.5% rms)
  norm     : per clip, x = (x - mean(x)) / (std(x) + 1e-5) over the whole 40x98 matrix (this also cancels device gain)
  output   : float32 [40, 98]  (mel band, frame)
"""

import numpy as np

SAMPLE_RATE = 16000
CLIP_SAMPLES = 16000
WIN = 400
HOP = 160
N_FFT = 512
N_MELS = 40
F_MIN = 20.0
F_MAX = 7600.0
LOG_EPS = 1e-8      # below 16-bit quantisation noise (~5e-8 mel energy) but above float noise; 1e-6 distorted quiet mics
NORM_EPS = 1e-5
N_FRAMES = 1 + (CLIP_SAMPLES - WIN) // HOP     # 98

SPEC = {"sample_rate": SAMPLE_RATE, "clip_samples": CLIP_SAMPLES, "win": WIN, "hop": HOP, "n_fft": N_FFT, "n_mels": N_MELS,
        "f_min": F_MIN, "f_max": F_MAX, "log_eps": LOG_EPS, "norm_eps": NORM_EPS, "n_frames": N_FRAMES,
        "window": "hann_periodic", "mel_scale": "htk", "filter_norm": "none", "pre_emphasis": 0.0}


def hz_to_mel(f):
    return 2595.0 * np.log10(1.0 + np.asarray(f, dtype=np.float64) / 700.0)


def mel_to_hz(m):
    return 700.0 * (10.0 ** (np.asarray(m, dtype=np.float64) / 2595.0) - 1.0)


def hann_periodic(n: int = WIN) -> np.ndarray:
    return (0.5 - 0.5 * np.cos(2.0 * np.pi * np.arange(n) / n)).astype(np.float64)


def mel_filterbank() -> np.ndarray:
    """[N_MELS, N_FFT//2 + 1] triangular filters (HTK mel, edges F_MIN..F_MAX, peak 1.0)."""
    mel_points = np.linspace(hz_to_mel(F_MIN), hz_to_mel(F_MAX), N_MELS + 2)
    hz_points = mel_to_hz(mel_points)
    fft_freqs = np.arange(N_FFT // 2 + 1) * (SAMPLE_RATE / N_FFT)
    bank = np.zeros((N_MELS, N_FFT // 2 + 1), dtype=np.float64)
    for m in range(N_MELS):
        left, centre, right = hz_points[m], hz_points[m + 1], hz_points[m + 2]
        up = (fft_freqs - left) / (centre - left)
        down = (right - fft_freqs) / (right - centre)
        bank[m] = np.maximum(0.0, np.minimum(up, down))
    return bank


_WINDOW = hann_periodic()
_BANK = mel_filterbank()


def fix_length(x: np.ndarray) -> np.ndarray:
    """Exactly CLIP_SAMPLES: pad (centred) or take the loudest second (same rule as the recording page)."""
    x = np.asarray(x, dtype=np.float32)
    if len(x) == CLIP_SAMPLES:
        return x
    if len(x) < CLIP_SAMPLES:
        out = np.zeros(CLIP_SAMPLES, dtype=np.float32)
        start = (CLIP_SAMPLES - len(x)) // 2
        out[start:start + len(x)] = x
        return out
    sq = np.concatenate(([0.0], np.cumsum(x.astype(np.float64) ** 2)))
    starts = np.arange(0, len(x) - CLIP_SAMPLES + 1, HOP)
    best = int(starts[int(np.argmax(sq[starts + CLIP_SAMPLES] - sq[starts]))])
    return x[best:best + CLIP_SAMPLES]


def log_mel(x: np.ndarray) -> np.ndarray:
    """Un-normalised log-mel [N_MELS, N_FRAMES] (float64)."""
    x = fix_length(x).astype(np.float64)
    idx = np.arange(WIN)[None, :] + HOP * np.arange(N_FRAMES)[:, None]        # [frames, WIN]
    frames = x[idx] * _WINDOW
    spectrum = np.fft.rfft(frames, n=N_FFT, axis=1)
    power = spectrum.real ** 2 + spectrum.imag ** 2                           # [frames, 257]
    mel = power @ _BANK.T                                                     # [frames, mels]
    return np.log(mel + LOG_EPS).T                                            # [mels, frames]


def features(x: np.ndarray) -> np.ndarray:
    """Normalised features [N_MELS, N_FRAMES] float32, the model input (add a channel axis for the CNN)."""
    m = log_mel(x)
    m = (m - m.mean()) / (m.std() + NORM_EPS)
    return m.astype(np.float32)
