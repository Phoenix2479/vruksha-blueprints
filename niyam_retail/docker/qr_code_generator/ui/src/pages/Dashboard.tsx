import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QrCode, Eye, TrendingUp, Package, PlusCircle } from 'lucide-react';
import { getAnalytics } from '../api/qrApi';
import type { AnalyticsData } from '../types';
import { QR_TYPE_INFO } from '../types';

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalytics()
      .then(setAnalytics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Overview of your QR codes and scans</p>
        </div>
        <Link
          to="/generator"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <PlusCircle className="h-5 w-5" />
          Create QR Code
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
              <QrCode className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total QR Codes</p>
              <p className="text-2xl font-bold text-gray-900">{analytics?.total_qrs || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Eye className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Scans</p>
              <p className="text-2xl font-bold text-gray-900">{analytics?.total_scans || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Scans This Week</p>
              <p className="text-2xl font-bold text-gray-900">{analytics?.scans_this_week || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Package className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">QR Types</p>
              <p className="text-2xl font-bold text-gray-900">{analytics?.by_type?.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top QR Codes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top QR Codes</h2>
          {analytics?.top_qrs && analytics.top_qrs.length > 0 ? (
            <div className="space-y-3">
              {analytics.top_qrs.map((qr, index) => (
                <Link
                  key={qr.id}
                  to={`/generator/${qr.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{qr.label}</p>
                    <p className="text-xs text-gray-500">{QR_TYPE_INFO[qr.type as keyof typeof QR_TYPE_INFO]?.label || qr.type}</p>
                  </div>
                  <span className="text-sm font-medium text-gray-600">{qr.scan_count} scans</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <QrCode className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No QR codes yet</p>
              <Link to="/generator" className="text-primary-600 hover:underline text-sm">
                Create your first QR code
              </Link>
            </div>
          )}
        </div>

        {/* QR by Type */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">QR Codes by Type</h2>
          {analytics?.by_type && analytics.by_type.length > 0 ? (
            <div className="space-y-3">
              {analytics.by_type.map(({ type, count }) => {
                const info = QR_TYPE_INFO[type as keyof typeof QR_TYPE_INFO];
                const total = analytics.total_qrs || 1;
                const percentage = Math.round((count / total) * 100);

                return (
                  <div key={type} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700">{info?.label || type}</span>
                      <span className="text-gray-500">{count} ({percentage}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No type data yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
