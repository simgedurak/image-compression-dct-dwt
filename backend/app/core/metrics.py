"""Quality metrics and theoretical rate-distortion (bit-rate) estimation."""

from collections import Counter

import numpy as np
from skimage.metrics import structural_similarity


def calculate_mse(original: np.ndarray, reconstructed: np.ndarray) -> float:
    """Mean squared error between two images."""
    original = original.astype(np.float64)
    reconstructed = reconstructed.astype(np.float64)
    return float(np.mean((original - reconstructed) ** 2))


def calculate_psnr(original: np.ndarray, reconstructed: np.ndarray, data_range: float = 255.0) -> float:
    """Peak signal-to-noise ratio in dB. Returns +inf for identical images."""
    mse = calculate_mse(original, reconstructed)
    if mse == 0:
        return float("inf")
    return float(10.0 * np.log10((data_range ** 2) / mse))


def calculate_masked_mse(original: np.ndarray, reconstructed: np.ndarray, mask: np.ndarray) -> float:
    """MSE restricted to the pixels where mask is truthy.

    NaN if the mask selects no pixels at all (the region is empty) — there is
    no distortion figure to report, not zero distortion.
    """
    original = original.astype(np.float64)
    reconstructed = reconstructed.astype(np.float64)
    mask = mask.astype(bool)
    if not np.any(mask):
        return float("nan")
    return float(np.mean((original[mask] - reconstructed[mask]) ** 2))


def calculate_masked_psnr(original: np.ndarray, reconstructed: np.ndarray, mask: np.ndarray,
                           data_range: float = 255.0) -> float:
    """PSNR restricted to the pixels where mask is truthy (see calculate_masked_mse)."""
    mse = calculate_masked_mse(original, reconstructed, mask)
    if mse != mse:  # NaN check without importing math: NaN is the only value unequal to itself
        return float("nan")
    if mse == 0:
        return float("inf")
    return float(10.0 * np.log10((data_range ** 2) / mse))


def calculate_ssim(original: np.ndarray, reconstructed: np.ndarray, data_range: float = 255.0) -> float:
    """Structural similarity index between two images."""
    channel_axis = -1 if original.ndim == 3 else None
    return float(structural_similarity(
        original, reconstructed, data_range=data_range, channel_axis=channel_axis
    ))


def shannon_entropy(symbols) -> float:
    """Zero-order Shannon entropy, in bits/symbol, of a sequence of discrete symbols."""
    counts = Counter(symbols)
    total = sum(counts.values())
    if total == 0:
        return 0.0
    probabilities = np.array(list(counts.values()), dtype=np.float64) / total
    return float(-np.sum(probabilities * np.log2(probabilities)))


def estimate_dct_bitrate(quantized_coeffs: np.ndarray, block_size: int = 8) -> dict:
    """Theoretical bit-rate of quantized DCT coefficients.

    Each block is zigzag-scanned into a DC symbol plus (run, level) AC
    symbols and an end-of-block marker; the zero-order Shannon entropy of
    that symbol stream approximates what an entropy coder (e.g. the Huffman
    coder real JPEG uses) would achieve.
    """
    from .dct_codec import zigzag_scan

    h, w = quantized_coeffs.shape[:2]
    h_blocks, w_blocks = h - h % block_size, w - w % block_size

    symbols = []
    for i in range(0, h_blocks, block_size):
        for j in range(0, w_blocks, block_size):
            zz = zigzag_scan(quantized_coeffs[i:i + block_size, j:j + block_size])
            symbols.append(("DC", int(zz[0])))
            run = 0
            for coeff in zz[1:]:
                if coeff == 0:
                    run += 1
                else:
                    symbols.append(("AC", run, int(coeff)))
                    run = 0
            symbols.append(("EOB",))

    entropy = shannon_entropy(symbols)
    num_pixels = h_blocks * w_blocks
    total_bits = entropy * len(symbols)
    bpp = total_bits / num_pixels if num_pixels else 0.0

    return {
        "bpp": bpp,
        "total_bits": total_bits,
        "entropy_per_symbol": entropy,
        "num_symbols": len(symbols),
    }


def estimate_dwt_bitrate(coeffs: list, image_shape: tuple) -> dict:
    """Theoretical bit-rate of DWT coefficients from per-subband zero-order entropy."""
    from .dwt_codec import flatten_subbands

    bands = flatten_subbands(coeffs)
    num_pixels = image_shape[0] * image_shape[1]

    total_bits = 0.0
    subband_entropy = {}
    for name, arr in bands.items():
        symbols = np.round(arr).astype(np.int64).flatten().tolist()
        entropy = shannon_entropy(symbols)
        subband_entropy[name] = entropy
        total_bits += entropy * arr.size

    bpp = total_bits / num_pixels if num_pixels else 0.0

    return {
        "bpp": bpp,
        "total_bits": total_bits,
        "subband_entropy": subband_entropy,
    }


def compression_ratio(original_bpp: float, compressed_bpp: float) -> float:
    """Compression ratio CR = original bits-per-pixel / compressed bits-per-pixel.

    compressed_bpp == 0 is a real, reachable value (zero-order entropy of a
    perfectly uniform subband/block stream is exactly 0 bits/symbol) and
    means "infinite" compression, not an error; only a negative value is invalid.
    """
    if compressed_bpp < 0:
        raise ValueError("compressed_bpp must not be negative")
    if compressed_bpp == 0:
        return float("inf")
    return original_bpp / compressed_bpp
