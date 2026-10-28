"""Quantization utilities for DCT/DWT coefficients, including rate-matching
binary search for a target bits-per-pixel (bpp)."""

import numpy as np

from . import dct_codec, dwt_codec, metrics

# Standard JPEG luminance quantization table (quality ~50)
JPEG_LUMA_QTABLE = np.array([
    [16, 11, 10, 16, 24, 40, 51, 61],
    [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56],
    [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77],
    [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101],
    [72, 92, 95, 98, 112, 100, 103, 99],
], dtype=np.float64)


def scale_qtable(qtable: np.ndarray, quality: int) -> np.ndarray:
    """Scale a base quantization table to a target JPEG quality (1-100)."""
    quality = max(1, min(100, quality))
    scale = 5000 / quality if quality < 50 else 200 - 2 * quality
    scaled = np.floor((qtable * scale + 50) / 100)
    return np.clip(scaled, 1, 255)


def quantize(coeffs: np.ndarray, qtable: np.ndarray) -> np.ndarray:
    """Quantize coefficients using the given quantization table."""
    return np.round(coeffs / qtable)


def dequantize(quantized: np.ndarray, qtable: np.ndarray) -> np.ndarray:
    """Reconstruct coefficients from quantized values."""
    return quantized * qtable


def uniform_quantize(coeffs: np.ndarray, step: float) -> np.ndarray:
    """Uniform scalar quantization, useful for DWT subbands."""
    return np.round(coeffs / step)


def uniform_dequantize(quantized: np.ndarray, step: float) -> np.ndarray:
    """Inverse of uniform_quantize."""
    return quantized * step


# --------------------------------------------------------------------------
# Rate-matching: binary search for the DCT quality / DWT delta that hits a
# target bits-per-pixel.
# --------------------------------------------------------------------------

def _dct_bpp_for_quality(image: np.ndarray, quality: int, block_size: int = 8) -> float:
    quantized = dct_codec.compress(image, quality=quality, block_size=block_size)
    return metrics.estimate_dct_bitrate(quantized, block_size=block_size)["bpp"]


def find_quality_for_bpp(image: np.ndarray, target_bpp: float, block_size: int = 8,
                          tol: float = 0.02, max_iter: int = 12) -> dict:
    """Binary search over JPEG quality (1-100) for the value whose DCT bpp is
    closest to target_bpp. Bpp increases (near-)monotonically with quality.
    """
    lo, hi = 1, 100
    best_quality = lo
    best_bpp = _dct_bpp_for_quality(image, lo, block_size)
    best_diff = abs(best_bpp - target_bpp)

    for _ in range(max_iter):
        if lo > hi:
            break
        mid = (lo + hi) // 2
        bpp = _dct_bpp_for_quality(image, mid, block_size)
        diff = abs(bpp - target_bpp)
        if diff < best_diff:
            best_quality, best_bpp, best_diff = mid, bpp, diff
        if best_diff <= tol:
            break
        if bpp < target_bpp:
            lo = mid + 1
        else:
            hi = mid - 1

    return {"quality": best_quality, "bpp": best_bpp}


def _dwt_bpp_for_delta(image: np.ndarray, delta: float, wavelet: str, level: int) -> float:
    coeffs = dwt_codec.encode(image, wavelet=wavelet, level=level)
    quantized = dwt_codec.deadzone_quantize(coeffs, delta)
    return metrics.estimate_dwt_bitrate(quantized, image.shape)["bpp"]


def find_delta_for_bpp(image: np.ndarray, target_bpp: float, wavelet: str = "db4", level: int = 3,
                        delta_range: tuple = (0.5, 1000.0), tol: float = 0.02,
                        max_iter: int = 30) -> dict:
    """Binary search over the deadzone delta for the value whose DWT bpp is
    closest to target_bpp. Bpp decreases (near-)monotonically with delta.
    """
    lo, hi = delta_range
    best_delta = lo
    best_bpp = _dwt_bpp_for_delta(image, lo, wavelet, level)
    best_diff = abs(best_bpp - target_bpp)

    for _ in range(max_iter):
        mid = (lo + hi) / 2.0
        bpp = _dwt_bpp_for_delta(image, mid, wavelet, level)
        diff = abs(bpp - target_bpp)
        if diff < best_diff:
            best_delta, best_bpp, best_diff = mid, bpp, diff
        if best_diff <= tol:
            break
        if bpp > target_bpp:
            lo = mid  # too many bits: need a coarser (larger) delta
        else:
            hi = mid  # too few bits: need a finer (smaller) delta

    return {"delta": best_delta, "bpp": best_bpp}
