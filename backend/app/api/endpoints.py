"""FastAPI route definitions for the codec service."""

import json

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.api.image_io import array_to_png_base64, read_upload_as_grayscale
from app.core import comparison_engine, dct_codec, dwt_codec, metrics, quantizer, roi_engine

router = APIRouter()


@router.get("/health")
def health_check():
    """Simple liveness check."""
    return {"status": "ok"}


@router.get("/codecs")
def list_codecs():
    """List available codec backends."""
    return {"codecs": ["dct", "dwt"]}


async def _decode_upload(file: UploadFile) -> np.ndarray:
    try:
        return await read_upload_as_grayscale(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/compare")
async def compare_endpoint(
    file: UploadFile = File(...),
    target_bpp: float = Form(0.5),
    wavelet: str = Form("db4"),
    level: int = Form(3),
):
    """Rate-match DCT and DWT to target_bpp and return comparative metrics
    plus base64 PNGs of the reconstructions and residual maps."""
    image = await _decode_upload(file)
    result = comparison_engine.compare_codecs(image, target_bpp, wavelet=wavelet, level=level)

    _TABLE_KEYS = ("parameter", "bpp", "compression_ratio", "mse", "psnr", "ssim",
                   "original_bytes", "compressed_bytes", "reduction_percent")

    def _codec_payload(codec_result: dict) -> dict:
        return {
            **{k: codec_result[k] for k in _TABLE_KEYS},
            "reconstructed_png": array_to_png_base64(codec_result["reconstructed"]),
            "residual_png": array_to_png_base64(codec_result["residual"]),
        }

    dct_payload = _codec_payload(result["dct"])
    dwt_payload = _codec_payload(result["dwt"])

    return {
        "original_png": array_to_png_base64(result["original"]),
        "original_bytes": result["original_bytes"],
        "dct": dct_payload,
        "dwt": dwt_payload,
        "summary": result["summary"],
        "metrics_table": [
            {"codec": "DCT", **{k: dct_payload[k] for k in _TABLE_KEYS}},
            {"codec": "DWT", **{k: dwt_payload[k] for k in _TABLE_KEYS}},
        ],
    }


@router.post("/api/multi-wavelet")
async def multi_wavelet_endpoint(
    file: UploadFile = File(...),
    target_bpp: float = Form(0.5),
    level: int = Form(3),
):
    """Rate-match haar/db2/db4/db8/db12 to the same target_bpp for a
    head-to-head DWT filter comparison."""
    image = await _decode_upload(file)
    result = comparison_engine.compare_wavelets(image, target_bpp, level=level)

    _KEYS = ("parameter", "bpp", "compression_ratio", "mse", "psnr", "ssim",
             "original_bytes", "compressed_bytes", "reduction_percent")

    def _payload(codec_result: dict) -> dict:
        return {
            **{k: codec_result[k] for k in _KEYS},
            "reconstructed_png": array_to_png_base64(codec_result["reconstructed"]),
        }

    return {
        "original_png": array_to_png_base64(result["original"]),
        "original_bytes": result["original_bytes"],
        "target_bpp": result["target_bpp"],
        "results": [_payload(r) for r in result["results"]],
    }


@router.post("/api/subband-tree")
async def subband_tree_endpoint(
    file: UploadFile = File(...),
    wavelet: str = Form("db4"),
    level: int = Form(3),
):
    """Return a composite image of every DWT subband plus per-subband stats."""
    image = await _decode_upload(file)
    try:
        coeffs = dwt_codec.encode(image, wavelet=wavelet, level=level)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    canvas, stats = dwt_codec.build_subband_canvas(coeffs)

    return {
        "canvas_png": array_to_png_base64(canvas, value_range=(0.0, 1.0)),
        "stats": stats,
        "wavelet": wavelet,
        "level": level,
    }


@router.post("/api/zero-out")
async def zero_out_endpoint(
    file: UploadFile = File(...),
    wavelet: str = Form("db4"),
    level: int = Form(3),
    inactive_subbands: str = Form("[]"),
):
    """Zero the named subbands (e.g. ["HH1", "HH2"]), reconstruct, and return
    the resulting distortion (PSNR/MSE) against the original image."""
    image = await _decode_upload(file)
    try:
        bands_to_zero = json.loads(inactive_subbands)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="inactive_subbands must be a JSON array")

    try:
        coeffs = dwt_codec.encode(image, wavelet=wavelet, level=level)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    zeroed = dwt_codec.zero_out_subbands(coeffs, bands_to_zero)
    reconstructed = np.clip(dwt_codec.decode(zeroed, wavelet=wavelet), 0, 255)
    reconstructed = reconstructed[:image.shape[0], :image.shape[1]]

    return {
        "reconstructed_png": array_to_png_base64(reconstructed),
        "zeroed_subbands": bands_to_zero,
        "mse": metrics.calculate_mse(image, reconstructed),
        "psnr": metrics.calculate_psnr(image, reconstructed),
    }


@router.post("/api/inspect-block")
async def inspect_block_endpoint(
    file: UploadFile = File(...),
    block_x: int = Form(...),
    block_y: int = Form(...),
    target_bpp: float = Form(None),
    quality: int = Form(None),
):
    """Return every intermediate 8x8-block matrix (original, shifted, DCT,
    quantized, reconstructed, error) plus block-level distortion stats."""
    image = await _decode_upload(file)

    if quality is None:
        quality = quantizer.find_quality_for_bpp(image, target_bpp)["quality"] if target_bpp else 50

    try:
        result = dct_codec.inspect_8x8_block(image, block_y=block_y, block_x=block_x, quality=quality)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    matrices = {
        key: result[key].tolist()
        for key in ("original", "shifted", "dct_coeffs", "quantized_coeffs", "reconstructed", "error_matrix")
    }

    block_bpp = metrics.estimate_dct_bitrate(result["quantized_coeffs"], block_size=dct_codec.BLOCK_SIZE)["bpp"]

    return {
        "quality": quality,
        "matched_q": quality,
        "bpp": block_bpp,
        **matrices,
        "stats": result["stats"],
    }


@router.post("/api/semantic-roi")
async def semantic_roi_endpoint(
    file: UploadFile = File(...),
    roi_coords: str = Form(None),
    delta_roi: float = Form(5.0),
    delta_bg: float = Form(40.0),
    wavelet: str = Form("db4"),
    level: int = Form(3),
    blur_background: bool = Form(False),
):
    """Compare uniform vs semantic (ROI-adaptive) compression.

    roi_coords: optional JSON list of [x, y, w, h] boxes. When omitted,
    faces are auto-detected via OpenCV's Haar cascade.
    
    blur_background: if True, applies Gaussian blur to the background area
    (portrait mode defocus) to suppress quantization noise/ringing artifacts.
    """
    image = await _decode_upload(file)

    boxes = None
    if roi_coords:
        try:
            boxes = [tuple(box) for box in json.loads(roi_coords)]
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="roi_coords must be a JSON array of [x, y, w, h]")

    result = roi_engine.semantic_roi_compress(
        image, boxes=boxes, delta_roi=delta_roi, delta_bg=delta_bg, 
        wavelet=wavelet, level=level, blur_background=blur_background
    )

    return {
        "original_png": array_to_png_base64(result["original"]),
        "mask_png": array_to_png_base64(result["mask"], value_range=(0.0, 1.0)),
        "soft_mask_png": array_to_png_base64(result["soft_mask"], value_range=(0.0, 1.0)),
        "boxes": result["boxes"],
        "summary": result["summary"],
        "baseline": {
            **{k: result["baseline"][k] for k in
               ("mse", "psnr", "ssim", "bpp", "foreground_psnr", "background_psnr", "delta")},
            "reconstructed_png": array_to_png_base64(result["baseline"]["reconstructed"]),
        },
        "semantic": {
            **{k: result["semantic"][k] for k in
               ("mse", "psnr", "ssim", "bpp", "foreground_psnr", "background_psnr")},
            "reconstructed_png": array_to_png_base64(result["semantic"]["reconstructed"]),
        },
    }
