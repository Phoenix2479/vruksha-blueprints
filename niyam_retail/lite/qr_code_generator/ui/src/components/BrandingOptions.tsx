import type { QRBranding } from '../types';

interface BrandingOptionsProps {
  branding: Partial<QRBranding>;
  onChange: (updates: Partial<QRBranding>) => void;
}

export default function BrandingOptions({ branding, onChange }: BrandingOptionsProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Branding Options</h3>

      <div className="space-y-4">
        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Foreground</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.foreground_color || '#000000'}
                onChange={(e) => onChange({ foreground_color: e.target.value })}
                className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={branding.foreground_color || '#000000'}
                onChange={(e) => onChange({ foreground_color: e.target.value })}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.background_color || '#FFFFFF'}
                onChange={(e) => onChange({ background_color: e.target.value })}
                className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={branding.background_color || '#FFFFFF'}
                onChange={(e) => onChange({ background_color: e.target.value })}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Size: {branding.size || 300}px
          </label>
          <input
            type="range"
            min="100"
            max="600"
            step="50"
            value={branding.size || 300}
            onChange={(e) => onChange({ size: parseInt(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>100px</span>
            <span>600px</span>
          </div>
        </div>

        {/* Error Correction */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Error Correction</label>
          <select
            value={branding.error_correction || 'M'}
            onChange={(e) => onChange({ error_correction: e.target.value as 'L' | 'M' | 'Q' | 'H' })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
          >
            <option value="L">Low (7%) - Smallest QR</option>
            <option value="M">Medium (15%) - Recommended</option>
            <option value="Q">Quartile (25%) - Better recovery</option>
            <option value="H">High (30%) - Best for logos</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Higher error correction allows for logo overlay but increases QR size
          </p>
        </div>

        {/* Quick presets */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quick Presets</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onChange({ foreground_color: '#000000', background_color: '#FFFFFF' })}
              className="px-3 py-1 text-xs rounded-full border border-gray-200 hover:bg-gray-50"
            >
              Classic
            </button>
            <button
              onClick={() => onChange({ foreground_color: '#0369a1', background_color: '#e0f2fe' })}
              className="px-3 py-1 text-xs rounded-full border border-gray-200 hover:bg-gray-50"
            >
              Blue
            </button>
            <button
              onClick={() => onChange({ foreground_color: '#166534', background_color: '#dcfce7' })}
              className="px-3 py-1 text-xs rounded-full border border-gray-200 hover:bg-gray-50"
            >
              Green
            </button>
            <button
              onClick={() => onChange({ foreground_color: '#9333ea', background_color: '#f3e8ff' })}
              className="px-3 py-1 text-xs rounded-full border border-gray-200 hover:bg-gray-50"
            >
              Purple
            </button>
            <button
              onClick={() => onChange({ foreground_color: '#FFFFFF', background_color: '#000000' })}
              className="px-3 py-1 text-xs rounded-full border border-gray-200 hover:bg-gray-50"
            >
              Inverted
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
