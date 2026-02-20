import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, Trash2, ExternalLink, Edit2, Check, FileDown } from 'lucide-react';
import { useQRStore } from '../stores/qrStore';
import { exportPDF, exportZIP, getQRImageUrl } from '../api/qrApi';
import { QR_TYPE_INFO } from '../types';
import type { QRType } from '../types';

export default function QRList() {
  const { qrCodes, fetchQRCodes, deleteQR, isLoading } = useQRStore();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<QRType | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchQRCodes({ search: search || undefined, type: typeFilter || undefined });
  }, [search, typeFilter, fetchQRCodes]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const selectAll = () => {
    if (selected.size === qrCodes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(qrCodes.map(q => q.id)));
    }
  };

  const handleExportPDF = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const blob = await exportPDF(Array.from(selected));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qr_codes.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  const handleExportZIP = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const blob = await exportZIP(Array.from(selected));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qr_codes.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this QR code?')) {
      await deleteQR(id);
      selected.delete(id);
      setSelected(new Set(selected));
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My QR Codes</h1>
          <p className="text-gray-500">{qrCodes.length} total QR codes</p>
        </div>
        <Link
          to="/generator"
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Create New
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search QR codes..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as QRType | '')}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Types</option>
          {Object.entries(QR_TYPE_INFO).map(([type, info]) => (
            <option key={type} value={type}>
              {info.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <span className="text-sm text-primary-700 font-medium">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              Export PDF
            </button>
            <button
              onClick={handleExportZIP}
              disabled={exporting}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export ZIP
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selected.size === qrCodes.length && qrCodes.length > 0}
                  onChange={selectAll}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">QR Code</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Label</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Scans</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Created</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : qrCodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  No QR codes found
                </td>
              </tr>
            ) : (
              qrCodes.map((qr) => (
                <tr key={qr.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(qr.id)}
                      onChange={() => toggleSelect(qr.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <img
                      src={getQRImageUrl(qr.id, 'png', 50)}
                      alt={qr.label}
                      className="w-10 h-10 rounded border border-gray-200"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{qr.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                      {QR_TYPE_INFO[qr.type as QRType]?.label || qr.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{qr.scan_count}</td>
                  <td className="px-4 py-3 text-gray-600 text-sm">
                    {new Date(qr.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/generator/${qr.id}`}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <a
                        href={`/qr/r/${qr.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="Test redirect"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <a
                        href={getQRImageUrl(qr.id, 'png', 600)}
                        download={`${qr.label}.png`}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => handleDelete(qr.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
