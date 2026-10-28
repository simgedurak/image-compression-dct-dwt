import { createContext, useContext, useMemo, useState } from 'react'

export const SUPPORTED_WAVELETS = ['haar', 'db2', 'db4', 'db8', 'db12', 'bior4.4']

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [file, setFile] = useState(null)
  const [imageMeta, setImageMeta] = useState(null) // { name, width, height, sizeBytes, previewUrl }

  const [category, setCategory] = useState('natural')
  const [mode, setMode] = useState('lossy') // 'lossy' | 'lossless'
  const [algorithm, setAlgorithm] = useState('dct') // 'dct' | 'dwt' (preference only)
  const [targetBpp, setTargetBpp] = useState(0.5)
  const [wavelet, setWavelet] = useState('db4')
  const [level, setLevel] = useState(3)

  function loadFile(nativeFile) {
    const previewUrl = URL.createObjectURL(nativeFile)
    const probe = new Image()
    probe.onload = () => {
      setImageMeta({
        name: nativeFile.name,
        width: probe.naturalWidth,
        height: probe.naturalHeight,
        sizeBytes: nativeFile.size,
        previewUrl,
      })
    }
    probe.src = previewUrl
    setFile(nativeFile)
  }

  // In "lossless" mode we approximate near-lossless output (highest quality /
  // finest quantization) since the backend only implements lossy DCT/DWT
  // paths; a real lossless entropy coder is out of scope for this project.
  const effectiveTargetBpp = mode === 'lossless' ? 7.9 : targetBpp

  const value = useMemo(
    () => ({
      file,
      imageMeta,
      loadFile,
      category,
      setCategory,
      mode,
      setMode,
      algorithm,
      setAlgorithm,
      targetBpp,
      setTargetBpp,
      effectiveTargetBpp,
      wavelet,
      setWavelet,
      level,
      setLevel,
    }),
    [file, imageMeta, category, mode, algorithm, targetBpp, effectiveTargetBpp, wavelet, level]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within an AppProvider')
  return ctx
}
