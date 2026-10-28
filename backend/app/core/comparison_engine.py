"""Rate-matched DCT vs DWT codec comparison."""

import numpy as np

from . import dct_codec, dwt_codec, metrics, quantizer

ORIGINAL_BPP = 8.0  # 8-bit grayscale source
DEFAULT_MULTI_WAVELETS = ("haar", "db2", "db4", "db8", "db12")


def _augment_size_metrics(result: dict, original_bytes: int) -> None:
    result["original_bytes"] = original_bytes
    result["compressed_bytes"] = original_bytes / result["compression_ratio"]
    result["reduction_percent"] = (1.0 - 1.0 / result["compression_ratio"]) * 100.0


def _run_dct(image: np.ndarray, target_bpp: float, block_size: int = 8) -> dict:
    match = quantizer.find_quality_for_bpp(image, target_bpp, block_size=block_size)
    quality = match["quality"]

    quantized = dct_codec.compress(image, quality=quality, block_size=block_size)
    reconstructed = dct_codec.decompress(quantized, quality=quality, block_size=block_size)
    bitrate = metrics.estimate_dct_bitrate(quantized, block_size=block_size)

    return {
        "codec": "DCT",
        "parameter": {"quality": quality},
        "reconstructed": reconstructed,
        "bpp": bitrate["bpp"],
        "mse": metrics.calculate_mse(image, reconstructed),
        "psnr": metrics.calculate_psnr(image, reconstructed),
        "ssim": metrics.calculate_ssim(image, reconstructed),
    }


def _run_dwt(image: np.ndarray, target_bpp: float, wavelet: str = "db4", level: int = 3) -> dict:
    match = quantizer.find_delta_for_bpp(image, target_bpp, wavelet=wavelet, level=level)
    delta = match["delta"]

    coeffs = dwt_codec.encode(image, wavelet=wavelet, level=level)
    quantized = dwt_codec.deadzone_quantize(coeffs, delta)
    dequantized = dwt_codec.deadzone_dequantize(quantized, delta)
    reconstructed = np.clip(dwt_codec.decode(dequantized, wavelet=wavelet), 0, 255)
    reconstructed = reconstructed[:image.shape[0], :image.shape[1]]
    bitrate = metrics.estimate_dwt_bitrate(quantized, image.shape)

    return {
        "codec": "DWT",
        "parameter": {"wavelet": wavelet, "level": level, "delta": delta},
        "reconstructed": reconstructed,
        "bpp": bitrate["bpp"],
        "mse": metrics.calculate_mse(image, reconstructed),
        "psnr": metrics.calculate_psnr(image, reconstructed),
        "ssim": metrics.calculate_ssim(image, reconstructed),
    }


def compare_codecs(image: np.ndarray, target_bpp: float, wavelet: str = "db4", level: int = 3) -> dict:
    """Rate-match DCT and DWT to target_bpp and compare their quality/compression.

    Returns reconstructed images, |original - reconstructed| residual maps,
    per-codec metrics (MSE/PSNR/SSIM/actual bpp/compression ratio), and the
    DWT-minus-DCT deltas for PSNR and SSIM.
    """
    image = image.astype(np.float64)
    original_bytes = image.shape[0] * image.shape[1]  # 1 byte/pixel, 8-bit grayscale

    dct_result = _run_dct(image, target_bpp)
    dwt_result = _run_dwt(image, target_bpp, wavelet=wavelet, level=level)

    for result in (dct_result, dwt_result):
        result["compression_ratio"] = metrics.compression_ratio(ORIGINAL_BPP, result["bpp"])
        result["residual"] = np.abs(image - result["reconstructed"])
        _augment_size_metrics(result, original_bytes)

    summary = {
        "target_bpp": target_bpp,
        "delta_bpp": dwt_result["bpp"] - dct_result["bpp"],
        "delta_psnr": dwt_result["psnr"] - dct_result["psnr"],
        "delta_ssim": dwt_result["ssim"] - dct_result["ssim"],
        "delta_mse": dwt_result["mse"] - dct_result["mse"],
    }

    return {
        "original": image,
        "original_bytes": original_bytes,
        "dct": dct_result,
        "dwt": dwt_result,
        "summary": summary,
    }


def compare_wavelets(image: np.ndarray, target_bpp: float, wavelets: tuple = DEFAULT_MULTI_WAVELETS,
                      level: int = 3) -> dict:
    """Rate-match several wavelet filters to the same target_bpp for a head-to-head DWT comparison."""
    image = image.astype(np.float64)
    original_bytes = image.shape[0] * image.shape[1]  # 1 byte/pixel, 8-bit grayscale

    results = []
    for wavelet in wavelets:
        result = _run_dwt(image, target_bpp, wavelet=wavelet, level=level)
        result["compression_ratio"] = metrics.compression_ratio(ORIGINAL_BPP, result["bpp"])
        _augment_size_metrics(result, original_bytes)
        results.append(result)

    return {
        "original": image,
        "original_bytes": original_bytes,
        "target_bpp": target_bpp,
        "results": results,
    }
