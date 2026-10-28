"""Pytest suite for the DSP codec core modules."""

import numpy as np
import pytest

from app.core import dct_codec, dwt_codec, quantizer, metrics, roi_engine


@pytest.fixture
def sample_image():
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, size=(64, 64), dtype=np.uint8).astype(np.float64)


@pytest.fixture
def dwt_sample_image():
    # Large enough for every SUPPORTED_WAVELETS entry (incl. db12) to
    # support a 2-level decomposition.
    rng = np.random.default_rng(7)
    return rng.integers(0, 256, size=(128, 128), dtype=np.uint8).astype(np.float64)


class TestDctCodec:
    def test_encode_decode_roundtrip(self, sample_image):
        coeffs = dct_codec.encode(sample_image)
        reconstructed = dct_codec.decode(coeffs)
        assert reconstructed.shape == sample_image.shape
        assert np.allclose(reconstructed, sample_image, atol=1e-8)

    def test_q_luminance_shape(self):
        assert dct_codec.Q_LUMINANCE.shape == (8, 8)

    def test_quality_scale_factor_endpoints(self):
        assert dct_codec.quality_scale_factor(50) == pytest.approx(100.0)
        assert dct_codec.quality_scale_factor(1) == pytest.approx(5000.0)
        assert dct_codec.quality_scale_factor(100) == pytest.approx(0.0)

    def test_get_quality_matrix_high_quality_is_finest(self):
        matrix = dct_codec.get_quality_matrix(100)
        assert np.all(matrix == 1)

    def test_get_quality_matrix_low_quality_is_coarser(self):
        low_q = dct_codec.get_quality_matrix(1)
        high_q = dct_codec.get_quality_matrix(90)
        assert low_q.mean() > high_q.mean()

    def test_level_shift_roundtrip(self):
        block = np.full((8, 8), 200.0)
        assert np.allclose(dct_codec.level_unshift(dct_codec.level_shift(block)), block)

    def test_zigzag_roundtrip(self):
        block = np.arange(64, dtype=np.float64).reshape(8, 8)
        zz = dct_codec.zigzag_scan(block)
        assert zz.shape == (64,)
        assert np.array_equal(dct_codec.inverse_zigzag(zz), block)

    def test_zigzag_starts_dc_ends_high_freq(self):
        block = np.arange(64, dtype=np.float64).reshape(8, 8)
        zz = dct_codec.zigzag_scan(block)
        assert zz[0] == block[0, 0]
        assert zz[-1] == block[7, 7]

    def test_inspect_8x8_block_structure(self, sample_image):
        result = dct_codec.inspect_8x8_block(sample_image, block_y=0, block_x=0, quality=50)

        for key in ("original", "shifted", "dct_coeffs", "quantized_coeffs",
                    "reconstructed", "error_matrix"):
            assert result[key].shape == (8, 8)

        stats = result["stats"]
        assert stats["mse"] >= 0
        assert stats["psnr"] > 0 or stats["psnr"] == float("inf")
        assert 0 <= stats["non_zero_count"] <= 64
        assert "eob_index" not in stats
        assert np.allclose(result["error_matrix"], result["original"] - result["reconstructed"])

    def test_inspect_8x8_block_out_of_bounds(self, sample_image):
        with pytest.raises(ValueError):
            dct_codec.inspect_8x8_block(sample_image, block_y=100, block_x=100, quality=50)

    def test_inspect_8x8_block_low_quality_has_fewer_nonzero_coeffs(self, sample_image):
        low = dct_codec.inspect_8x8_block(sample_image, 0, 0, quality=5)
        high = dct_codec.inspect_8x8_block(sample_image, 0, 0, quality=95)
        assert low["stats"]["non_zero_count"] <= high["stats"]["non_zero_count"]


class TestDwtCodec:
    @pytest.mark.parametrize("wavelet", dwt_codec.SUPPORTED_WAVELETS)
    def test_encode_decode_roundtrip(self, dwt_sample_image, wavelet):
        coeffs = dwt_codec.encode(dwt_sample_image, wavelet=wavelet, level=2)
        reconstructed = dwt_codec.decode(coeffs, wavelet=wavelet)
        cropped = reconstructed[:dwt_sample_image.shape[0], :dwt_sample_image.shape[1]]
        assert np.allclose(cropped, dwt_sample_image, atol=1e-6)

    def test_unsupported_wavelet_raises(self, dwt_sample_image):
        with pytest.raises(ValueError):
            dwt_codec.encode(dwt_sample_image, wavelet="sym5", level=1)

    def test_flatten_subbands_keys(self, dwt_sample_image):
        coeffs = dwt_codec.encode(dwt_sample_image, wavelet="haar", level=2)
        bands = dwt_codec.flatten_subbands(coeffs)
        assert set(bands.keys()) == {"LL2", "LH2", "HL2", "HH2", "LH1", "HL1", "HH1"}

    def test_build_subband_canvas(self, dwt_sample_image):
        coeffs = dwt_codec.encode(dwt_sample_image, wavelet="haar", level=2)
        canvas, stats = dwt_codec.build_subband_canvas(coeffs)

        assert canvas.shape == dwt_sample_image.shape
        assert canvas.min() >= 0.0 and canvas.max() <= 1.0
        assert set(stats.keys()) == {"LL2", "LH2", "HL2", "HH2", "LH1", "HL1", "HH1"}
        for band_stats in stats.values():
            assert set(band_stats.keys()) == {"mean", "std", "min", "max"}

    def test_zero_out_subbands(self, dwt_sample_image):
        coeffs = dwt_codec.encode(dwt_sample_image, wavelet="haar", level=2)
        zeroed = dwt_codec.zero_out_subbands(coeffs, ["HH1", "HH2"])

        assert np.all(zeroed[1][2] == 0)  # HH2 is index 2 of the first detail tuple
        assert np.all(zeroed[2][2] == 0)  # HH1 is index 2 of the second detail tuple

        reconstructed = dwt_codec.decode(zeroed, wavelet="haar")
        baseline = dwt_codec.decode(coeffs, wavelet="haar")
        assert reconstructed.shape == baseline.shape
        assert not np.allclose(reconstructed, baseline)

    def test_deadzone_quantize_zeroes_small_coefficients(self, dwt_sample_image):
        coeffs = dwt_codec.encode(dwt_sample_image, wavelet="haar", level=1)
        delta = 50.0
        quantized = dwt_codec.deadzone_quantize(coeffs, delta)

        small_mask = np.abs(coeffs[0]) < delta
        assert np.all(quantized[0][small_mask] == 0)

        dequantized = dwt_codec.deadzone_dequantize(quantized, delta)
        reconstructed = dwt_codec.decode(dequantized, wavelet="haar")
        assert reconstructed.shape == dwt_sample_image.shape

    def test_deadzone_quantize_rejects_non_positive_delta(self, dwt_sample_image):
        coeffs = dwt_codec.encode(dwt_sample_image, wavelet="haar", level=1)
        with pytest.raises(ValueError):
            dwt_codec.deadzone_quantize(coeffs, 0)


class TestQuantizer:
    def test_quantize_dequantize_roundtrip(self):
        coeffs = np.array([[10.0, 20.0], [30.0, 40.0]])
        qtable = np.array([[2.0, 2.0], [2.0, 2.0]])
        quantized = quantizer.quantize(coeffs, qtable)
        dequantized = quantizer.dequantize(quantized, qtable)
        assert np.allclose(dequantized, coeffs, atol=2.0)

    def test_scale_qtable_quality_bounds(self):
        table = quantizer.scale_qtable(quantizer.JPEG_LUMA_QTABLE, quality=100)
        assert np.all(table >= 1)


class TestMetrics:
    def test_mse_zero_for_identical_images(self, sample_image):
        assert metrics.calculate_mse(sample_image, sample_image) == 0.0

    def test_psnr_identical_images_is_inf(self, sample_image):
        assert metrics.calculate_psnr(sample_image, sample_image) == float("inf")

    def test_psnr_decreases_with_noise(self, sample_image):
        rng = np.random.default_rng(0)
        noisy = np.clip(sample_image + rng.normal(0, 20, sample_image.shape), 0, 255)
        psnr = metrics.calculate_psnr(sample_image, noisy)
        assert 0 < psnr < float("inf")

    def test_ssim_identical_images_is_one(self, sample_image):
        assert metrics.calculate_ssim(sample_image, sample_image) == pytest.approx(1.0)

    def test_shannon_entropy_constant_symbol_is_zero(self):
        assert metrics.shannon_entropy([1, 1, 1, 1]) == 0.0

    def test_shannon_entropy_uniform_binary_is_one_bit(self):
        assert metrics.shannon_entropy([0, 1, 0, 1]) == pytest.approx(1.0)

    def test_estimate_dct_bitrate(self, sample_image):
        coeffs = dct_codec.encode(sample_image)
        qmatrix = dct_codec.get_quality_matrix(50)
        h, w = sample_image.shape
        quantized = np.zeros_like(coeffs)
        for i in range(0, h, 8):
            for j in range(0, w, 8):
                block = coeffs[i:i + 8, j:j + 8]
                quantized[i:i + 8, j:j + 8] = dct_codec.quantize_block(block, qmatrix)

        result = metrics.estimate_dct_bitrate(quantized)
        assert result["bpp"] > 0
        assert result["num_symbols"] > 0

    def test_estimate_dwt_bitrate(self, dwt_sample_image):
        coeffs = dwt_codec.encode(dwt_sample_image, wavelet="haar", level=2)
        result = metrics.estimate_dwt_bitrate(coeffs, dwt_sample_image.shape)
        assert result["bpp"] > 0
        assert len(result["subband_entropy"]) == 7

    def test_compression_ratio(self):
        assert metrics.compression_ratio(8.0, 2.0) == 4.0

    def test_compression_ratio_zero_bpp_is_infinite(self):
        # A perfectly uniform block/subband stream has exactly 0 bits/symbol
        # of zero-order entropy; that's a real "infinite compression" result,
        # not an error.
        assert metrics.compression_ratio(8.0, 0) == float("inf")

    def test_compression_ratio_negative_input_raises(self):
        with pytest.raises(ValueError):
            metrics.compression_ratio(8.0, -1.0)

    def test_calculate_masked_mse_isolates_region(self):
        original = np.zeros((4, 4))
        reconstructed = original.copy()
        reconstructed[:2, :] = 10.0  # error only in the top half
        top_mask = np.zeros((4, 4), dtype=bool)
        top_mask[:2, :] = True
        bottom_mask = ~top_mask
        assert metrics.calculate_masked_mse(original, reconstructed, top_mask) == 100.0
        assert metrics.calculate_masked_mse(original, reconstructed, bottom_mask) == 0.0

    def test_calculate_masked_psnr_matches_full_image_with_all_true_mask(self, sample_image):
        rng = np.random.default_rng(1)
        noisy = np.clip(sample_image + rng.normal(0, 15, sample_image.shape), 0, 255)
        full_mask = np.ones(sample_image.shape, dtype=bool)
        assert metrics.calculate_masked_psnr(sample_image, noisy, full_mask) == pytest.approx(
            metrics.calculate_psnr(sample_image, noisy)
        )

    def test_calculate_masked_psnr_empty_mask_is_nan(self, sample_image):
        empty_mask = np.zeros(sample_image.shape, dtype=bool)
        psnr = metrics.calculate_masked_psnr(sample_image, sample_image, empty_mask)
        assert psnr != psnr  # NaN is the only value that isn't equal to itself


class TestRoiEngine:
    def test_make_roi_mask(self):
        mask = roi_engine.make_roi_mask((10, 10), [(2, 2, 3, 3)])
        assert mask.shape == (10, 10)
        assert mask[2:5, 2:5].all()
        assert not mask[0, 0]

    def test_semantic_roi_regional_psnr_favors_fine_quantization_in_roi(self, dwt_sample_image):
        box = [(20, 20, 40, 40)]
        result = roi_engine.semantic_roi_compress(
            dwt_sample_image, boxes=box, delta_roi=2.0, delta_bg=80.0, wavelet="haar", level=2
        )

        baseline = result["baseline"]
        semantic = result["semantic"]

        # Fine quantization inside the ROI should reconstruct it strictly
        # better than the uniform-coarse baseline.
        assert semantic["foreground_psnr"] > baseline["foreground_psnr"]

        # The summary deltas must equal the difference of the two regional
        # PSNR values they are derived from.
        assert result["summary"]["delta_foreground_psnr"] == pytest.approx(
            semantic["foreground_psnr"] - baseline["foreground_psnr"]
        )
        assert result["summary"]["delta_background_psnr"] == pytest.approx(
            semantic["background_psnr"] - baseline["background_psnr"]
        )

    def test_semantic_roi_no_boxes_gives_nan_foreground_psnr(self, dwt_sample_image):
        result = roi_engine.semantic_roi_compress(
            dwt_sample_image, boxes=[], delta_roi=5.0, delta_bg=40.0, wavelet="haar", level=1
        )
        fg_psnr = result["baseline"]["foreground_psnr"]
        assert fg_psnr != fg_psnr  # NaN: no ROI pixels to measure
