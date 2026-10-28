import { Upload, Image as ImageIcon, FileImage } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Card, Field, Select, RangeSlider, ToggleGroup } from './ui/Primitives'

const CATEGORY_OPTIONS = [
  { value: 'natural', label: 'Natural / Landscape' },
  { value: 'biomedical', label: 'Biomedical' },
  { value: 'synthetic', label: 'Synthetic / Logos' },
]

const ALGORITHM_OPTIONS = [
  { value: 'dct', label: 'Baseline JPEG (DCT)' },
  { value: 'dwt', label: 'JPEG2000 (DWT)' },
]

function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export default function Sidebar() {
  const { file, imageMeta, loadFile, category, setCategory, mode, setMode, algorithm, setAlgorithm, targetBpp, setTargetBpp } =
    useApp()

  const compressionRatio = targetBpp > 0 ? (8.0 / targetBpp).toFixed(1) : '—'

  function handleFileInput(e) {
    const picked = e.target.files?.[0]
    if (picked) loadFile(picked)
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 px-1">
        <FileImage className="text-blue-600" size={22} />
        <div>
          <h1 className="text-sm font-bold leading-tight text-slate-800">Smart Codec Lab</h1>
          <p className="text-[11px] text-slate-400">JPEG (DCT) vs JPEG2000 (DWT)</p>
        </div>
      </div>

      <Card title="Upload Image" icon={Upload}>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50">
          <Upload size={18} className="text-slate-400" />
          <span className="font-medium">{file ? 'Replace image' : 'Click to select an image'}</span>
          <span className="text-[10px] text-slate-400">PNG, JPG, BMP…</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
        </label>

        {imageMeta && (
          <div className="mt-3 space-y-2">
            <img
              src={imageMeta.previewUrl}
              alt="preview"
              className="max-h-32 w-full rounded-lg border border-slate-200 object-contain bg-slate-100"
            />
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-500">
              <span className="truncate col-span-2 font-medium text-slate-700" title={imageMeta.name}>
                {imageMeta.name}
              </span>
              <span className="flex items-center gap-1">
                <ImageIcon size={11} /> {imageMeta.width}×{imageMeta.height}px
              </span>
              <span>{formatBytes(imageMeta.sizeBytes)}</span>
              <span className="col-span-2">Bit depth: 8-bit (processed as grayscale)</span>
            </div>
          </div>
        )}
      </Card>

      <Card title="Configuration">
        <div className="space-y-4">
          <Field label="Image Category">
            <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
          </Field>

          <Field label="Mode">
            <ToggleGroup
              value={mode}
              onChange={setMode}
              options={[
                { value: 'lossy', label: 'Lossy' },
                { value: 'lossless', label: 'Lossless' },
              ]}
            />
            {mode === 'lossless' && (
              <p className="mt-1 text-[10px] text-slate-400">
                Approximated as near-lossless (finest quantization); target BPP is disabled.
              </p>
            )}
          </Field>

          <Field label="Target Output Format">
            <Select value="png" onChange={() => {}} disabled options={[{ value: 'png', label: 'PNG (Lossless Container)' }]} />
          </Field>

          <Field label="Algorithm">
            <ToggleGroup value={algorithm} onChange={setAlgorithm} options={ALGORITHM_OPTIONS} />
          </Field>

          <Field label="Target BPP" hint={`≈ ${compressionRatio}:1 CR`}>
            <RangeSlider
              value={targetBpp}
              min={0.1}
              max={2.0}
              step={0.05}
              onChange={setTargetBpp}
              disabled={mode === 'lossless'}
              formatValue={(v) => `${v.toFixed(2)} bpp`}
            />
          </Field>
        </div>
      </Card>
    </aside>
  )
}
