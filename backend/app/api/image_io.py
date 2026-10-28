"""Upload decoding / response encoding helpers for the API layer."""

import base64

import cv2
import numpy as np
from fastapi import UploadFile


def _pad_to_multiple(image: np.ndarray, multiple: int = 16) -> np.ndarray:
    """Pad image dimensions to the nearest multiple for DCT/DWT processing.
    
    DCT requires dimensions divisible by 8 (block size).
    DWT requires dimensions divisible by 2^level (e.g., 16 for level=3).
    Using 16 ensures compatibility with both.
    """
    h, w = image.shape[:2]
    new_h = ((h + multiple - 1) // multiple) * multiple
    new_w = ((w + multiple - 1) // multiple) * multiple
    
    if h == new_h and w == new_w:
        return image
    
    # Pad with edge values to avoid artifacts
    pad_bottom = new_h - h
    pad_right = new_w - w
    
    return cv2.copyMakeBorder(
        image, 0, pad_bottom, 0, pad_right,
        cv2.BORDER_REPLICATE
    )


async def read_upload_as_grayscale(file: UploadFile) -> np.ndarray:
    """Decode an uploaded image file into a float64 grayscale array.
    
    Handles:
    - RGBA images (AI-generated PNGs with transparency)
    - RGB color images
    - Grayscale images
    
    Ensures dimensions are multiples of 16 for DCT/DWT processing.
    """
    raw = await file.read()
    buffer = np.frombuffer(raw, dtype=np.uint8)
    
    # Decode with all channels first to detect format
    image = cv2.imdecode(buffer, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("Could not decode uploaded file as an image")
    
    # Convert to grayscale based on channel count
    if len(image.shape) == 2:
        # Already grayscale (1 channel)
        grayscale = image
    elif image.shape[2] == 4:
        # RGBA: Convert BGRA -> BGR -> Grayscale
        bgr = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        grayscale = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    elif image.shape[2] == 3:
        # RGB/BGR: Convert to Grayscale
        grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        raise ValueError(f"Unexpected image channel count: {image.shape[2]}")
    
    # Pad to multiple of 16 for DCT/DWT compatibility
    grayscale = _pad_to_multiple(grayscale, multiple=16)
    
    return grayscale.astype(np.float64)


def array_to_png_base64(array: np.ndarray, value_range: tuple = (0.0, 255.0)) -> str:
    """Encode a float array as a base64-encoded 8-bit PNG.

    value_range maps the array's [lo, hi] to the PNG's [0, 255]; use
    (0.0, 1.0) for already-normalized data such as build_subband_canvas().
    """
    lo, hi = value_range
    if hi <= lo:
        raise ValueError("value_range must be increasing")

    scaled = (np.clip(array, lo, hi) - lo) / (hi - lo) * 255.0
    img_uint8 = np.round(scaled).astype(np.uint8)

    success, buffer = cv2.imencode(".png", img_uint8)
    if not success:
        raise ValueError("Failed to encode array as PNG")
    return base64.b64encode(buffer.tobytes()).decode("ascii")
