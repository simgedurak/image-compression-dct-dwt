"""Region-of-interest (ROI) engine for content-adaptive (semantic) compression.

Fine-quantizes DWT coefficients inside a region of interest (a manual box or
an auto-detected face) and coarse-quantizes everywhere else, with a feathered
(blurred) mask so the ROI boundary doesn't produce a visible quantization seam.
"""

import cv2
import numpy as np

from . import dwt_codec, metrics


def make_roi_mask(shape: tuple, boxes: list) -> np.ndarray:
    """Build a binary mask from a list of ROI boxes.

    boxes: list of (x, y, w, h) tuples in pixel coordinates.
    """
    mask = np.zeros(shape[:2], dtype=bool)
    for (x, y, w, h) in boxes:
        mask[y:y + h, x:x + w] = True
    return mask


def feather_mask(mask: np.ndarray, blur_radius: int = 15) -> np.ndarray:
    """Gaussian-blur a binary mask into a soft [0, 1] mask so the ROI
    boundary quantizes gradually instead of switching abruptly."""
    ksize = max(1, blur_radius) | 1  # must be odd for GaussianBlur
    return cv2.GaussianBlur(mask.astype(np.float64), (ksize, ksize), 0)


def detect_faces_opencv(image: np.ndarray) -> list:
    """Detect faces using OpenCV's built-in Haar cascade as a simple ROI source."""
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
        gray = gray.astype(np.uint8)
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        detector = cv2.CascadeClassifier(cascade_path)
        
        if detector.empty():
            raise RuntimeError(f"Failed to load Haar cascade from {cascade_path}")
            
        faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
        return [tuple(map(int, box)) for box in faces]
    except AttributeError as e:
        raise RuntimeError(
            f"OpenCV CascadeClassifier not available. This usually means OpenCV 5.x is installed. "
            f"Please downgrade to OpenCV 4.x: pip install 'opencv-python>=4.0,<5.0'"
        ) from e


def _resize_mask(mask: np.ndarray, shape: tuple) -> np.ndarray:
    """Resample a soft mask to a subband's (smaller) resolution."""
    return cv2.resize(mask.astype(np.float64), (shape[1], shape[0]), interpolation=cv2.INTER_AREA)


def _delta_map(soft_mask: np.ndarray, shape: tuple, delta_roi: float, delta_bg: float) -> np.ndarray:
    band_mask = _resize_mask(soft_mask, shape)
    delta_map = delta_bg - band_mask * (delta_bg - delta_roi)
    return np.clip(delta_map, 1e-6, None)


def _quantize_adaptive(coeffs: list, soft_mask: np.ndarray, delta_roi: float, delta_bg: float) -> list:
    def _q(arr):
        delta_map = _delta_map(soft_mask, arr.shape, delta_roi, delta_bg)
        return np.sign(arr) * np.floor(np.abs(arr) / delta_map)

    quantized = [_q(coeffs[0])]
    for cH, cV, cD in coeffs[1:]:
        quantized.append((_q(cH), _q(cV), _q(cD)))
    return quantized


def _dequantize_adaptive(quantized: list, soft_mask: np.ndarray, delta_roi: float, delta_bg: float) -> list:
    def _dq(arr):
        delta_map = _delta_map(soft_mask, arr.shape, delta_roi, delta_bg)
        return np.sign(arr) * (np.abs(arr) + 0.5) * delta_map

    dequantized = [_dq(quantized[0])]
    for cH, cV, cD in quantized[1:]:
        dequantized.append((_dq(cH), _dq(cV), _dq(cD)))
    return dequantized


def _apply_background_blur(image: np.ndarray, mask: np.ndarray, blur_radius: int = 11) -> np.ndarray:
    """Apply Gaussian blur to the background area (outside ROI mask).
    
    Simulates portrait mode defocus / bokeh effect, suppressing quantization noise
    and ringing artifacts in the background while keeping ROI sharp.
    
    Args:
        image: Reconstructed image (float64)
        mask: Binary ROI mask (True=foreground, False=background)
        blur_radius: Gaussian blur kernel size (must be odd)
    
    Returns:
        Image with blurred background and sharp ROI
    """
    # Ensure blur_radius is odd
    blur_radius = max(1, blur_radius) | 1
    
    # Convert mask to float for blending
    mask_float = mask.astype(np.float64)
    
    # Apply Gaussian blur to entire image
    blurred = cv2.GaussianBlur(image, (blur_radius, blur_radius), 0)
    
    # Blend: sharp foreground + blurred background
    # result = mask * sharp + (1 - mask) * blurred
    result = mask_float * image + (1.0 - mask_float) * blurred
    
    return np.clip(result, 0, 255)


def _compress_adaptive(image: np.ndarray, soft_mask: np.ndarray, delta_roi: float, delta_bg: float,
                        wavelet: str, level: int) -> tuple:
    coeffs = dwt_codec.encode(image, wavelet=wavelet, level=level)
    quantized = _quantize_adaptive(coeffs, soft_mask, delta_roi, delta_bg)
    dequantized = _dequantize_adaptive(quantized, soft_mask, delta_roi, delta_bg)
    reconstructed = np.clip(dwt_codec.decode(dequantized, wavelet=wavelet), 0, 255)
    reconstructed = reconstructed[:image.shape[0], :image.shape[1]]
    return reconstructed, quantized


def _find_matching_delta(image: np.ndarray, target_bpp: float, wavelet: str, level: int,
                         initial_delta: float = 40.0, tolerance: float = 0.02, max_iterations: int = 20) -> float:
    """Binary search to find a uniform quantization step that achieves target_bpp ± tolerance."""
    delta_min, delta_max = 1.0, 200.0
    flat_mask = np.zeros(image.shape[:2], dtype=np.float64)
    
    for _ in range(max_iterations):
        delta_mid = (delta_min + delta_max) / 2
        _, quantized = _compress_adaptive(image, flat_mask, delta_roi=delta_mid, delta_bg=delta_mid, 
                                          wavelet=wavelet, level=level)
        bpp = metrics.estimate_dwt_bitrate(quantized, image.shape)["bpp"]
        
        if abs(bpp - target_bpp) < tolerance:
            return delta_mid
        
        # If bpp is too high, increase delta (coarser quantization)
        # If bpp is too low, decrease delta (finer quantization)
        if bpp > target_bpp:
            delta_min = delta_mid
        else:
            delta_max = delta_mid
    
    # Return best attempt even if tolerance not met
    return delta_mid


def semantic_roi_compress(image: np.ndarray, boxes: list = None, delta_roi: float = 5.0,
                           delta_bg: float = 40.0, wavelet: str = "db4", level: int = 3,
                           feather_radius: int = 15, blur_background: bool = False) -> dict:
    """Compare uniform vs semantic (ROI-adaptive) DWT compression with EQUAL bit budget.

    The semantic stream uses fine quantization (delta_roi) in the ROI and coarse
    quantization (delta_bg) in the background. The baseline uses uniform quantization
    with an automatically calibrated step size that achieves the SAME total bpp as
    the semantic stream, ensuring a fair rate-distortion comparison.
    
    boxes: list of (x, y, w, h) ROI boxes; if None, faces are auto-detected
    via OpenCV's Haar cascade.
    
    blur_background: if True, applies Gaussian blur to the background area after
    reconstruction, simulating portrait mode defocus and suppressing quantization
    noise/ringing artifacts outside the ROI.
    """
    image = image.astype(np.float64)

    if boxes is None:
        boxes = detect_faces_opencv(image)

    mask = make_roi_mask(image.shape, boxes) if boxes else np.zeros(image.shape[:2], dtype=bool)
    soft_mask = feather_mask(mask, blur_radius=feather_radius)

    # STEP 1: Compute semantic compression first to establish the target bit budget
    semantic_reconstructed, semantic_quantized = _compress_adaptive(
        image, soft_mask, delta_roi=delta_roi, delta_bg=delta_bg, wavelet=wavelet, level=level
    )
    
    # Apply background blur if requested (portrait mode defocus)
    if blur_background and boxes:
        semantic_reconstructed = _apply_background_blur(semantic_reconstructed, mask, blur_radius=11)
    
    semantic_bitrate = metrics.estimate_dwt_bitrate(semantic_quantized, image.shape)
    target_bpp = semantic_bitrate["bpp"]

    # STEP 2: Find baseline delta that matches semantic's bpp (equal bit budget)
    baseline_delta = _find_matching_delta(image, target_bpp, wavelet, level, 
                                          initial_delta=delta_bg, tolerance=0.02)
    
    # STEP 3: Compute baseline with the calibrated uniform delta
    flat_mask = np.zeros_like(soft_mask)
    baseline_reconstructed, baseline_quantized = _compress_adaptive(
        image, flat_mask, delta_roi=baseline_delta, delta_bg=baseline_delta, 
        wavelet=wavelet, level=level
    )
    baseline_bitrate = metrics.estimate_dwt_bitrate(baseline_quantized, image.shape)

    # Quality metrics
    baseline_psnr = metrics.calculate_psnr(image, baseline_reconstructed)
    baseline_ssim = metrics.calculate_ssim(image, baseline_reconstructed)
    semantic_psnr = metrics.calculate_psnr(image, semantic_reconstructed)
    semantic_ssim = metrics.calculate_ssim(image, semantic_reconstructed)

    # Region-isolated PSNR: how much the ROI gains from the fine delta, and
    # how much the background gives up to the coarse delta, each measured
    # against the same hard ROI/background split for baseline and semantic.
    background_mask = ~mask
    baseline_fg_psnr = metrics.calculate_masked_psnr(image, baseline_reconstructed, mask)
    baseline_bg_psnr = metrics.calculate_masked_psnr(image, baseline_reconstructed, background_mask)
    semantic_fg_psnr = metrics.calculate_masked_psnr(image, semantic_reconstructed, mask)
    semantic_bg_psnr = metrics.calculate_masked_psnr(image, semantic_reconstructed, background_mask)

    return {
        "original": image,
        "mask": mask.astype(np.float64),
        "soft_mask": soft_mask,
        "boxes": boxes,
        "baseline": {
            "reconstructed": baseline_reconstructed,
            "mse": metrics.calculate_mse(image, baseline_reconstructed),
            "psnr": baseline_psnr,
            "ssim": baseline_ssim,
            "bpp": baseline_bitrate["bpp"],
            "foreground_psnr": baseline_fg_psnr,
            "background_psnr": baseline_bg_psnr,
            "delta": baseline_delta,  # Expose calibrated delta for debugging
        },
        "semantic": {
            "reconstructed": semantic_reconstructed,
            "mse": metrics.calculate_mse(image, semantic_reconstructed),
            "psnr": semantic_psnr,
            "ssim": semantic_ssim,
            "bpp": semantic_bitrate["bpp"],
            "foreground_psnr": semantic_fg_psnr,
            "background_psnr": semantic_bg_psnr,
        },
        "summary": {
            "delta_psnr": semantic_psnr - baseline_psnr,
            "delta_ssim": semantic_ssim - baseline_ssim,
            "delta_foreground_psnr": semantic_fg_psnr - baseline_fg_psnr,
            "delta_background_psnr": semantic_bg_psnr - baseline_bg_psnr,
            "delta_bpp": semantic_bitrate["bpp"] - baseline_bitrate["bpp"],
        },
    }
