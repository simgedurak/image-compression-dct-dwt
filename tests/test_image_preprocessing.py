"""Test robust image preprocessing for RGBA, RGB, and Grayscale images."""

import io
import numpy as np
import cv2
import pytest
from PIL import Image

# Mock UploadFile for testing
class MockUploadFile:
    def __init__(self, image_array, mode='RGB'):
        self.image = Image.fromarray(image_array.astype(np.uint8), mode=mode)
        
    async def read(self):
        buffer = io.BytesIO()
        self.image.save(buffer, format='PNG')
        return buffer.getvalue()


@pytest.mark.asyncio
async def test_rgba_image_preprocessing():
    """Test RGBA image (AI-generated PNG with transparency) conversion."""
    from backend.app.api.image_io import read_upload_as_grayscale
    
    # Create synthetic RGBA image
    rgba = np.random.randint(0, 255, (100, 100, 4), dtype=np.uint8)
    mock_file = MockUploadFile(rgba, mode='RGBA')
    
    result = await read_upload_as_grayscale(mock_file)
    
    assert result.dtype == np.float64
    assert len(result.shape) == 2  # Grayscale
    assert result.shape[0] % 16 == 0  # Padded to multiple of 16
    assert result.shape[1] % 16 == 0


@pytest.mark.asyncio
async def test_rgb_image_preprocessing():
    """Test RGB color image conversion."""
    from backend.app.api.image_io import read_upload_as_grayscale
    
    # Create synthetic RGB image
    rgb = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
    mock_file = MockUploadFile(rgb, mode='RGB')
    
    result = await read_upload_as_grayscale(mock_file)
    
    assert result.dtype == np.float64
    assert len(result.shape) == 2  # Grayscale
    assert result.shape[0] % 16 == 0
    assert result.shape[1] % 16 == 0


@pytest.mark.asyncio
async def test_grayscale_image_preprocessing():
    """Test grayscale image (already 1 channel) preprocessing."""
    from backend.app.api.image_io import read_upload_as_grayscale
    
    # Create synthetic grayscale image
    gray = np.random.randint(0, 255, (100, 100), dtype=np.uint8)
    mock_file = MockUploadFile(gray, mode='L')
    
    result = await read_upload_as_grayscale(mock_file)
    
    assert result.dtype == np.float64
    assert len(result.shape) == 2  # Grayscale
    assert result.shape[0] % 16 == 0
    assert result.shape[1] % 16 == 0


@pytest.mark.asyncio
async def test_odd_dimensions_padding():
    """Test that odd dimensions are padded to multiples of 16."""
    from backend.app.api.image_io import read_upload_as_grayscale
    
    # Create image with dimensions not divisible by 16
    gray = np.random.randint(0, 255, (127, 135), dtype=np.uint8)
    mock_file = MockUploadFile(gray, mode='L')
    
    result = await read_upload_as_grayscale(mock_file)
    
    assert result.shape[0] == 128  # 127 -> 128 (next multiple of 16)
    assert result.shape[1] == 144  # 135 -> 144 (next multiple of 16)
