import axios from 'axios'

// Direct connection to the FastAPI backend (CORS is enabled there for this).
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8004'

const client = axios.create({ baseURL: API_BASE })

// Add request/response interceptors for better error debugging
client.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    console.error('API Request Error:', error)
    return Promise.reject(error)
  }
)

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error status (4xx, 5xx)
      console.error('API Response Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url,
      })
    } else if (error.request) {
      // Request was made but no response received
      console.error('Network Error: No response received', {
        message: error.message,
        url: error.config?.url,
      })
    } else {
      // Error in request setup
      console.error('Request Setup Error:', error.message)
    }
    return Promise.reject(error)
  }
)

function buildForm(file, fields) {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    // Serialize arrays and objects as JSON strings
    if (typeof value === 'object') {
      form.append(key, JSON.stringify(value))
    } else {
      form.append(key, String(value))
    }
  }
  return form
}

export async function checkHealth() {
  const { data } = await client.get('/health')
  return data
}

export async function compareCodecs(file, { targetBpp, wavelet, level }) {
  const form = buildForm(file, { target_bpp: targetBpp, wavelet, level })
  const { data } = await client.post('/api/compare', form)
  return data
}

export async function multiWavelet(file, { targetBpp, level }) {
  const form = buildForm(file, { target_bpp: targetBpp, level })
  const { data } = await client.post('/api/multi-wavelet', form)
  return data
}

export async function getSubbandTree(file, { wavelet, level }) {
  const form = buildForm(file, { wavelet, level })
  const { data } = await client.post('/api/subband-tree', form)
  return data
}

export async function zeroOutSubbands(file, { wavelet, level, inactiveSubbands }) {
  const form = buildForm(file, { wavelet, level, inactive_subbands: inactiveSubbands })
  const { data } = await client.post('/api/zero-out', form)
  return data
}

export async function inspectBlock(file, { blockX, blockY, targetBpp, quality }) {
  const form = buildForm(file, {
    block_x: blockX,
    block_y: blockY,
    target_bpp: quality ? undefined : targetBpp,
    quality,
  })
  const { data } = await client.post('/api/inspect-block', form)
  return data
}

export async function semanticRoi(file, { roiCoords, deltaRoi, deltaBg, wavelet, level, blurBackground }) {
  const form = buildForm(file, {
    roi_coords: roiCoords && Array.isArray(roiCoords) && roiCoords.length > 0 ? roiCoords : undefined,
    delta_roi: deltaRoi,
    delta_bg: deltaBg,
    wavelet,
    level,
    blur_background: blurBackground,
  })
  const { data } = await client.post('/api/semantic-roi', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export function pngDataUrl(base64) {
  return `data:image/png;base64,${base64}`
}

export function apiErrorMessage(err) {
  if (err?.response?.data?.detail) {
    const detail = err.response.data.detail
    return typeof detail === 'string' ? detail : JSON.stringify(detail)
  }
  if (err?.response) {
    // Server responded with an error status
    const status = err.response.status
    if (status >= 500) {
      return `Server Error (${status}): ${err.response.statusText || 'Internal server error'}. Check backend logs for details.`
    }
    if (status >= 400) {
      return `Client Error (${status}): ${err.response.statusText || 'Bad request'}`
    }
    return `Server error (${status}): ${err.response.statusText || 'Unknown error'}`
  }
  if (err?.request) {
    // Request made but no response received
    return `Network Error: Could not connect to backend at ${API_BASE}. Ensure the server is running on the correct port.`
  }
  return err?.message || 'Request failed'
}
