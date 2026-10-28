"""DWT-based codec (JPEG2000-style compression) using a multi-level Mallat
2D wavelet decomposition (via PyWavelets).
"""

from collections import OrderedDict

import numpy as np
import pywt

SUPPORTED_WAVELETS = ("haar", "db2", "db4", "db8", "db12", "bior4.4")

# 'periodization' keeps subband sizes at exactly ceil(N / 2**level) with no
# boundary growth, which is what makes build_subband_canvas() tile cleanly.
_MODE = "periodization"


def encode(image: np.ndarray, wavelet: str = "db4", level: int = 3) -> list:
    """Multi-level 2D Mallat DWT decomposition.

    Returns pywt's wavedec2 coefficient list:
    [cA_n, (cH_n, cV_n, cD_n), ..., (cH_1, cV_1, cD_1)].
    """
    if wavelet not in SUPPORTED_WAVELETS:
        raise ValueError(f"Unsupported wavelet '{wavelet}'. Choose from {SUPPORTED_WAVELETS}.")
    return pywt.wavedec2(image.astype(np.float64), wavelet=wavelet, level=level, mode=_MODE)


def decode(coeffs: list, wavelet: str = "db4") -> np.ndarray:
    """Reconstruct an image from wavedec2-format coefficients."""
    return pywt.waverec2(coeffs, wavelet=wavelet, mode=_MODE)


def flatten_subbands(coeffs: list) -> "OrderedDict[str, np.ndarray]":
    """Map wavedec2 output to a name -> array dict.

    Keys are LL{n} for the coarsest approximation, and LH{d}/HL{d}/HH{d}
    (horizontal/vertical/diagonal detail) for each decomposition depth d,
    from the coarsest (n) down to the finest (1).
    """
    level = len(coeffs) - 1
    bands = OrderedDict()
    bands[f"LL{level}"] = coeffs[0]
    for depth, (cH, cV, cD) in zip(range(level, 0, -1), coeffs[1:]):
        bands[f"LH{depth}"] = cH
        bands[f"HL{depth}"] = cV
        bands[f"HH{depth}"] = cD
    return bands


def build_subband_canvas(coeffs: list) -> tuple:
    """Compose all DWT subbands into a single 2D image for display.

    Subbands are arranged in the classic quad-tree layout (the coarsest LL
    approximation in the top-left corner, growing outward through each
    decomposition depth), with every subband independently normalized to
    [0, 1].
    
    Detail subbands (LH, HL, HH) use enhanced contrast scaling centered at 0.5
    to make edges and textures visible (academic DWT visualization standard).

    Returns (canvas, stats), where stats maps subband name -> {mean, std,
    min, max}, computed from the raw (unnormalized) coefficients.
    """
    bands = flatten_subbands(coeffs)

    stats = {
        name: {
            "mean": float(np.mean(arr)),
            "std": float(np.std(arr)),
            "min": float(np.min(arr)),
            "max": float(np.max(arr)),
        }
        for name, arr in bands.items()
    }

    def normalize_approximation(arr: np.ndarray) -> np.ndarray:
        """Standard min-max normalization for LL (approximation) subbands."""
        lo, hi = float(arr.min()), float(arr.max())
        if hi - lo < 1e-12:
            return np.zeros_like(arr, dtype=np.float64)
        return (arr - lo) / (hi - lo)
    
    def normalize_detail(arr: np.ndarray) -> np.ndarray:
        """Enhanced contrast scaling for LH/HL/HH (detail) subbands.
        
        Centers at 0.5 (gray) and scales by std dev to make edges pop out.
        This matches academic DWT literature visualization standards.
        """
        std = float(np.std(arr))
        if std < 1e-12:
            return np.full_like(arr, 0.5, dtype=np.float64)
        
        # Scale by 3 standard deviations, center at 0.5
        # Coefficients within ±3σ map to [0, 1], clipped at boundaries
        normalized = 0.5 + (arr / (3.0 * std)) * 0.5
        return np.clip(normalized, 0.0, 1.0)

    level = len(coeffs) - 1
    canvas = normalize_approximation(bands[f"LL{level}"])
    
    for depth in range(level, 0, -1):
        # Use enhanced contrast for detail subbands
        lh = normalize_detail(bands[f"LH{depth}"])
        hl = normalize_detail(bands[f"HL{depth}"])
        hh = normalize_detail(bands[f"HH{depth}"])

        h = min(canvas.shape[0], lh.shape[0], hl.shape[0], hh.shape[0])
        w = min(canvas.shape[1], lh.shape[1], hl.shape[1], hh.shape[1])
        canvas, lh, hl, hh = canvas[:h, :w], lh[:h, :w], hl[:h, :w], hh[:h, :w]

        top = np.hstack([canvas, lh])
        bottom = np.hstack([hl, hh])
        canvas = np.vstack([top, bottom])

    return canvas, stats


def zero_out_subbands(coeffs: list, bands_to_zero: list) -> list:
    """Return a copy of wavedec2 coefficients with the named subbands zeroed.

    bands_to_zero: e.g. ["HH1", "HH2", "LH3"]. Names follow flatten_subbands
    / build_subband_canvas conventions.
    """
    level = len(coeffs) - 1
    to_zero = set(bands_to_zero)

    ll = coeffs[0]
    new_coeffs = [np.zeros_like(ll) if f"LL{level}" in to_zero else ll.copy()]

    for depth, (cH, cV, cD) in zip(range(level, 0, -1), coeffs[1:]):
        cH = np.zeros_like(cH) if f"LH{depth}" in to_zero else cH.copy()
        cV = np.zeros_like(cV) if f"HL{depth}" in to_zero else cV.copy()
        cD = np.zeros_like(cD) if f"HH{depth}" in to_zero else cD.copy()
        new_coeffs.append((cH, cV, cD))

    return new_coeffs


def deadzone_quantize(coeffs: list, delta: float) -> list:
    """Apply a JPEG2000-style scalar deadzone quantizer to every subband.

    q = sign(x) * floor(|x| / delta); values with |x| < delta collapse to 0.
    """
    if delta <= 0:
        raise ValueError("delta must be positive")

    def _q(arr: np.ndarray) -> np.ndarray:
        return np.sign(arr) * np.floor(np.abs(arr) / delta)

    quantized = [_q(coeffs[0])]
    for cH, cV, cD in coeffs[1:]:
        quantized.append((_q(cH), _q(cV), _q(cD)))
    return quantized


def deadzone_dequantize(quantized_coeffs: list, delta: float) -> list:
    """Inverse of deadzone_quantize: reconstruct each bin to its midpoint."""
    if delta <= 0:
        raise ValueError("delta must be positive")

    def _dq(arr: np.ndarray) -> np.ndarray:
        return np.sign(arr) * (np.abs(arr) + 0.5) * delta

    dequantized = [_dq(quantized_coeffs[0])]
    for cH, cV, cD in quantized_coeffs[1:]:
        dequantized.append((_dq(cH), _dq(cV), _dq(cD)))
    return dequantized
