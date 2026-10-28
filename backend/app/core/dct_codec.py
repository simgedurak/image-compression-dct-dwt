"""JPEG-style DCT codec: block DCT/IDCT, quantization, zigzag scan, and
per-block inspection utilities.
"""

import numpy as np
from scipy.fft import dctn, idctn

from .metrics import calculate_mse, calculate_psnr

BLOCK_SIZE = 8

# Standard JPEG luminance quantization matrix (ITU-T T.81 Annex K, quality ~50)
Q_LUMINANCE = np.array([
    [16, 11, 10, 16, 24, 40, 51, 61],
    [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56],
    [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77],
    [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101],
    [72, 92, 95, 98, 112, 100, 103, 99],
], dtype=np.float64)


def quality_scale_factor(quality: int) -> float:
    """Standard IJG JPEG quality (1-100) to quantization scale factor."""
    quality = int(np.clip(quality, 1, 100))
    if quality < 50:
        return 5000.0 / quality
    return 200.0 - 2.0 * quality


def get_quality_matrix(quality: int, base: np.ndarray = Q_LUMINANCE) -> np.ndarray:
    """Scale a base 8x8 quantization matrix to the given JPEG quality (1-100)."""
    scale = quality_scale_factor(quality)
    scaled = np.floor((base * scale + 50.0) / 100.0)
    return np.clip(scaled, 1, 255).astype(np.float64)


def level_shift(block: np.ndarray) -> np.ndarray:
    """Shift pixel values from [0, 255] to [-128, 127] before the DCT."""
    return block.astype(np.float64) - 128.0


def level_unshift(block: np.ndarray) -> np.ndarray:
    """Undo level_shift after the inverse DCT."""
    return block.astype(np.float64) + 128.0


def dct2(block: np.ndarray) -> np.ndarray:
    """Orthonormal 2D DCT-II of a block."""
    return dctn(block.astype(np.float64), type=2, norm="ortho")


def idct2(block: np.ndarray) -> np.ndarray:
    """Orthonormal 2D inverse DCT (DCT-III) of a block."""
    return idctn(block.astype(np.float64), type=2, norm="ortho")


def quantize_block(dct_block: np.ndarray, qmatrix: np.ndarray) -> np.ndarray:
    """Quantize a block of DCT coefficients against a quantization matrix."""
    return np.round(dct_block / qmatrix)


def dequantize_block(quantized_block: np.ndarray, qmatrix: np.ndarray) -> np.ndarray:
    """Reconstruct DCT coefficients from quantized values."""
    return quantized_block * qmatrix


# --------------------------------------------------------------------------
# Zigzag scan
# --------------------------------------------------------------------------

def _build_zigzag_indices(n: int = BLOCK_SIZE) -> list:
    diagonals = [[] for _ in range(2 * n - 1)]
    for i in range(n):
        for j in range(n):
            s = i + j
            if s % 2 == 0:
                diagonals[s].insert(0, (i, j))
            else:
                diagonals[s].append((i, j))
    return [pos for diagonal in diagonals for pos in diagonal]


ZIGZAG_INDICES = _build_zigzag_indices(BLOCK_SIZE)


def zigzag_scan(block: np.ndarray) -> np.ndarray:
    """Flatten an 8x8 block into a 1D array following JPEG zigzag order."""
    return np.array([block[i, j] for (i, j) in ZIGZAG_INDICES])


def inverse_zigzag(arr: np.ndarray, shape=(BLOCK_SIZE, BLOCK_SIZE)) -> np.ndarray:
    """Rebuild a 2D block from a zigzag-ordered 1D array."""
    block = np.zeros(shape, dtype=arr.dtype)
    for value, (i, j) in zip(arr, ZIGZAG_INDICES):
        block[i, j] = value
    return block


# --------------------------------------------------------------------------
# Full-image, block-wise transform (lossless up to float precision; no
# quantization is applied here — see inspect_8x8_block for the lossy path)
# --------------------------------------------------------------------------

def encode(image: np.ndarray, block_size: int = BLOCK_SIZE) -> np.ndarray:
    """Level-shift and apply the 2D DCT to every non-overlapping block."""
    h, w = image.shape[:2]
    out = np.zeros_like(image, dtype=np.float64)
    for i in range(0, h - h % block_size, block_size):
        for j in range(0, w - w % block_size, block_size):
            block = level_shift(image[i:i + block_size, j:j + block_size])
            out[i:i + block_size, j:j + block_size] = dct2(block)
    return out


def decode(coeffs: np.ndarray, block_size: int = BLOCK_SIZE) -> np.ndarray:
    """Inverse of encode(): 2D IDCT + level-unshift for every block."""
    h, w = coeffs.shape[:2]
    out = np.zeros_like(coeffs, dtype=np.float64)
    for i in range(0, h - h % block_size, block_size):
        for j in range(0, w - w % block_size, block_size):
            block = coeffs[i:i + block_size, j:j + block_size]
            out[i:i + block_size, j:j + block_size] = level_unshift(idct2(block))
    return out


# --------------------------------------------------------------------------
# Full-image lossy pipeline (level shift + DCT + quantization)
# --------------------------------------------------------------------------

def compress(image: np.ndarray, quality: int = 50, block_size: int = BLOCK_SIZE) -> np.ndarray:
    """Block-wise level-shift + DCT + quantize. Returns the quantized coefficient plane."""
    h, w = image.shape[:2]
    h_c, w_c = h - h % block_size, w - w % block_size
    qmatrix = get_quality_matrix(quality)

    quantized = np.zeros((h_c, w_c), dtype=np.float64)
    for i in range(0, h_c, block_size):
        for j in range(0, w_c, block_size):
            block = level_shift(image[i:i + block_size, j:j + block_size])
            quantized[i:i + block_size, j:j + block_size] = quantize_block(dct2(block), qmatrix)
    return quantized


def decompress(quantized: np.ndarray, quality: int = 50, block_size: int = BLOCK_SIZE) -> np.ndarray:
    """Inverse of compress(): dequantize + IDCT + level-unshift, clipped to [0, 255]."""
    h, w = quantized.shape[:2]
    qmatrix = get_quality_matrix(quality)

    reconstructed = np.zeros((h, w), dtype=np.float64)
    for i in range(0, h - h % block_size, block_size):
        for j in range(0, w - w % block_size, block_size):
            block = quantized[i:i + block_size, j:j + block_size]
            dequantized = dequantize_block(block, qmatrix)
            reconstructed[i:i + block_size, j:j + block_size] = level_unshift(idct2(dequantized))
    return np.clip(reconstructed, 0, 255)


# --------------------------------------------------------------------------
# Per-block inspection (the full lossy JPEG pipeline for one 8x8 block)
# --------------------------------------------------------------------------

def inspect_8x8_block(image: np.ndarray, block_y: int, block_x: int, quality: int = 50) -> dict:
    """Run the full per-block JPEG pipeline and return every intermediate stage.

    block_y, block_x are block indices, not pixel coordinates: block (0, 0)
    covers pixels [0:8, 0:8], block (1, 2) covers pixels [8:16, 16:24], etc.
    """
    y0, x0 = block_y * BLOCK_SIZE, block_x * BLOCK_SIZE
    original = image[y0:y0 + BLOCK_SIZE, x0:x0 + BLOCK_SIZE].astype(np.float64)
    if original.shape != (BLOCK_SIZE, BLOCK_SIZE):
        raise ValueError(
            f"Block ({block_y}, {block_x}) is out of bounds for image shape {image.shape}"
        )

    qmatrix = get_quality_matrix(quality)

    shifted = level_shift(original)
    dct_coeffs = dct2(shifted)
    quantized_coeffs = quantize_block(dct_coeffs, qmatrix)

    dequantized = dequantize_block(quantized_coeffs, qmatrix)
    reconstructed = np.clip(np.round(level_unshift(idct2(dequantized))), 0, 255)

    error_matrix = original - reconstructed
    non_zero_count = int(np.count_nonzero(quantized_coeffs))

    return {
        "original": original,
        "shifted": shifted,
        "dct_coeffs": dct_coeffs,
        "quantized_coeffs": quantized_coeffs,
        "reconstructed": reconstructed,
        "error_matrix": error_matrix,
        "stats": {
            "mse": calculate_mse(original, reconstructed),
            "psnr": calculate_psnr(original, reconstructed, data_range=255.0),
            "non_zero_count": non_zero_count,
        },
    }
