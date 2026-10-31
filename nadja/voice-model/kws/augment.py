"""Training-time augmentation, plain numpy (reproducible from a seed). Applied to the WAVEFORM before features,
except SpecAugment. Order: speed -> shift -> reverb -> band-limit -> noise at a random SNR."""

import numpy as np

from . import features as F

SR = F.SAMPLE_RATE


def speed(x, rng, lo=0.9, hi=1.1):
    factor = rng.uniform(lo, hi)
    idx = np.arange(0, len(x) - 1, factor)
    return np.interp(idx, np.arange(len(x)), x).astype(np.float32)


def time_stretch(x, rate, n_fft=512, hop=128):
    """Phase-vocoder time stretch: rate > 1 = faster/shorter, pitch unchanged. Output length ~ len(x) / rate."""
    x = np.asarray(x, dtype=np.float64)
    if len(x) < n_fft * 2:
        return x.astype(np.float32)
    window = np.hanning(n_fft)
    n_frames = 1 + (len(x) - n_fft) // hop
    stft = np.stack([np.fft.rfft(window * x[i * hop: i * hop + n_fft]) for i in range(n_frames)], axis=1)
    steps = np.arange(0, n_frames - 1, rate)
    expected = np.linspace(0, np.pi * hop, n_fft // 2 + 1)            # phase advance of each bin per hop
    phase = np.angle(stft[:, 0])
    out = np.zeros(int(len(steps) * hop + n_fft))
    for k, t in enumerate(steps):
        i, frac = int(t), t - int(t)
        a, b = stft[:, i], stft[:, i + 1]
        mag = (1 - frac) * np.abs(a) + frac * np.abs(b)
        out[k * hop: k * hop + n_fft] += window * np.fft.irfft(mag * np.exp(1j * phase), n_fft)
        delta = np.angle(b) - np.angle(a) - expected
        phase += expected + delta - 2 * np.pi * np.round(delta / (2 * np.pi))
    out /= (n_fft / (2 * hop)) * 0.5 * 1.5 + 1e-9                    # hann^2 overlap-add normalisation (approx.)
    return out.astype(np.float32)


def voice_shift(x, rng, max_semitones=4.0):
    """A different 'speaker' from the same words: scale pitch AND formants by 2^(st/12) (vocal-tract length), keeping the
    duration. Real accent, pronunciation and microphone are preserved, only the voice character changes."""
    r = 2.0 ** (rng.uniform(-max_semitones, max_semitones) / 12.0)
    stretched = time_stretch(x, 1.0 / r)                              # r > 1: longer by r
    idx = np.arange(0, len(stretched) - 1, r)                         # read faster by r -> pitch/formants x r
    shifted = np.interp(idx, np.arange(len(stretched)), stretched).astype(np.float32)
    peak_in, peak_out = float(np.max(np.abs(x))), float(np.max(np.abs(shifted)) + 1e-9)
    return shifted * (peak_in / peak_out)


def shift(x, rng, max_s=0.1):
    n = int(rng.integers(-int(max_s * SR), int(max_s * SR) + 1))
    out = np.zeros_like(x)
    if n >= 0:
        out[n:] = x[: len(x) - n]
    else:
        out[:n] = x[-n:]
    return out


def reverb(x, rng):
    length = int(rng.uniform(0.05, 0.3) * SR)
    decay = np.exp(-np.arange(length) / (length / rng.uniform(3, 8)))
    ir = rng.normal(0, 1, length) * decay
    ir[0] = 1.0
    ir /= np.abs(ir).sum()
    wet = np.convolve(x, ir)[: len(x)]
    return (wet * (np.sqrt(np.mean(x ** 2) + 1e-12) / np.sqrt(np.mean(wet ** 2) + 1e-12))).astype(np.float32)


def band_limit(x, rng):
    """Cheap phone-microphone colouring: random high-pass 50-300 Hz and low-pass 3.5-7.5 kHz (FFT mask)."""
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    spec[freqs < rng.uniform(50, 300)] *= 0.05
    spec[freqs > rng.uniform(3500, 7500)] *= 0.05
    return np.fft.irfft(spec, len(x)).astype(np.float32)


def colored_noise(n, rng, kind=None):
    kind = kind or rng.choice(["white", "pink", "brown", "hum"])
    white = rng.normal(0, 1, n)
    if kind == "white":
        return white.astype(np.float32)
    spec = np.fft.rfft(white)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    if kind == "pink":
        spec /= np.sqrt(f)
    elif kind == "brown":
        spec /= f
    else:  # "hum": engine / road rumble = brown noise + low harmonics
        spec /= f
        t = np.arange(n) / SR
        base = rng.uniform(30, 120)
        hum = sum(np.sin(2 * np.pi * base * k * t + rng.uniform(0, 6.28)) / k for k in range(1, 6))
        out = np.fft.irfft(spec, n)
        out = out / (np.std(out) + 1e-9) + 0.7 * hum / (np.std(hum) + 1e-9)
        return out.astype(np.float32)
    return np.fft.irfft(spec, n).astype(np.float32)


def mix_at_snr(x, noise, snr_db):
    sig = np.sqrt(np.mean(x ** 2)) + 1e-9
    nz = np.sqrt(np.mean(noise ** 2)) + 1e-9
    return (x + noise * (sig / nz) / (10 ** (snr_db / 20))).astype(np.float32)


def add_noise(x, rng, ambient=None, babble=None):
    """Mix colored noise, a real ambient clip, or 2-3 other-class words (babble) at a random SNR of 0-25 dB."""
    options = ["colored"] + (["ambient"] if ambient else []) + (["babble"] if babble else [])
    choice = rng.choice(options)
    if choice == "colored":
        noise, snr = colored_noise(len(x), rng), rng.uniform(0, 25)
    elif choice == "ambient":
        noise, snr = F.fix_length(ambient[int(rng.integers(len(ambient)))]), rng.uniform(0, 25)
    else:
        parts = [F.fix_length(babble[int(rng.integers(len(babble)))]) for _ in range(int(rng.integers(2, 4)))]
        noise, snr = np.sum(parts, axis=0), rng.uniform(8, 25)        # keep the target word clearly louder
    return mix_at_snr(x, noise, snr)


def waveform(x, rng, ambient=None, babble=None, voices=False):
    x = F.fix_length(x)
    if voices and rng.random() < 0.6:                    # "virtual speaker": pitch + vocal-tract length change
        x = F.fix_length(voice_shift(x, rng))
    if rng.random() < 0.5:
        x = F.fix_length(speed(x, rng))
    if rng.random() < 0.8:
        x = shift(x, rng)
    if rng.random() < 0.3:
        x = reverb(x, rng)
    if rng.random() < 0.3:
        x = band_limit(x, rng)
    if rng.random() < 0.85:
        x = add_noise(x, rng, ambient, babble)
    return x


def spec_augment(feat, rng, max_time=12, max_freq=5):
    feat = feat.copy()
    if rng.random() < 0.5:
        w = int(rng.integers(1, max_time + 1)); t0 = int(rng.integers(0, feat.shape[1] - w + 1))
        feat[:, t0:t0 + w] = 0.0
    if rng.random() < 0.5:
        w = int(rng.integers(1, max_freq + 1)); f0 = int(rng.integers(0, feat.shape[0] - w + 1))
        feat[f0:f0 + w, :] = 0.0
    return feat
