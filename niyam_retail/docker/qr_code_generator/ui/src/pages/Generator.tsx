import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useQRStore } from '../stores/qrStore';
import QRTypeSelector from '../components/QRTypeSelector';
import QRPreview from '../components/QRPreview';
import BrandingOptions from '../components/BrandingOptions';
import ProductQRForm from '../components/forms/ProductQRForm';
import PaymentQRForm from '../components/forms/PaymentQRForm';
import WiFiForm from '../components/forms/WiFiForm';
import VCardForm from '../components/forms/VCardForm';
import CustomURLForm from '../components/forms/CustomURLForm';
import MakerQRForm from '../components/forms/MakerQRForm';
import TextQRForm from '../components/forms/TextQRForm';
import type { QRType } from '../types';

export default function Generator() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [isEditMode, setIsEditMode] = useState(false);

  const {
    draftType,
    draftLabel,
    draftMetadata,
    draftBranding,
    setDraftType,
    setDraftLabel,
    setDraftMetadata,
    setDraftBranding,
    createQR,
    updateQR,
    fetchQRCode,
    loadQRIntoDraft,
    resetDraft,
    selectedQR,
    isLoading,
    error,
    clearError,
  } = useQRStore();

  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      fetchQRCode(id).then(() => {
        const qr = useQRStore.getState().selectedQR;
        if (qr) {
          loadQRIntoDraft(qr);
        }
      });
    } else {
      setIsEditMode(false);
      resetDraft();
    }
    return () => resetDraft();
  }, [id]);

  const handleSave = async () => {
    if (isEditMode && id) {
      const success = await updateQR(id, {
        label: draftLabel,
        metadata: draftMetadata,
        branding: draftBranding as any,
      });
      if (success) {
        navigate('/list');
      }
    } else {
      const newId = await createQR();
      if (newId) {
        navigate(`/generator/${newId}`);
      }
    }
  };

  const canSave = draftType && draftLabel.trim();

  const renderForm = () => {
    if (!draftType) return null;

    const formProps = {
      metadata: draftMetadata,
      onChange: setDraftMetadata,
      label: draftLabel,
      onLabelChange: setDraftLabel,
    };

    switch (draftType) {
      case 'product':
        return <ProductQRForm {...formProps} />;
      case 'payment':
        return <PaymentQRForm {...formProps} />;
      case 'wifi':
        return <WiFiForm {...formProps} />;
      case 'vcard':
        return <VCardForm {...formProps} />;
      case 'custom':
        return <CustomURLForm {...formProps} />;
      case 'maker':
        return <MakerQRForm {...formProps} />;
      case 'text':
        return <TextQRForm {...formProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode ? 'Edit QR Code' : 'Create QR Code'}
            </h1>
            <p className="text-gray-500">
              {isEditMode
                ? 'Update your QR code settings'
                : 'Choose a type and customize your QR code'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}
          {isEditMode ? 'Save Changes' : 'Create QR Code'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-red-700">{error}</p>
          <button onClick={clearError} className="text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Type & Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Type Selector */}
          {!isEditMode && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose QR Type</h2>
              <QRTypeSelector
                selected={draftType}
                onSelect={(type: QRType) => {
                  setDraftType(type);
                  setDraftMetadata({});
                  setDraftLabel('');
                }}
              />
            </div>
          )}

          {/* Type-specific Form */}
          {draftType && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">QR Code Details</h2>
              {renderForm()}
            </div>
          )}

          {/* Branding Options */}
          {draftType && <BrandingOptions branding={draftBranding} onChange={setDraftBranding} />}
        </div>

        {/* Right Column - Preview */}
        <div className="space-y-6">
          <QRPreview
            type={draftType}
            metadata={draftMetadata}
            branding={draftBranding}
            qrId={isEditMode ? id : undefined}
            showActions={isEditMode}
          />

          {isEditMode && selectedQR && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Statistics</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Scans</span>
                  <span className="font-medium">{selectedQR.scan_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="font-medium">
                    {new Date(selectedQR.created_at).toLocaleDateString()}
                  </span>
                </div>
                {selectedQR.updated_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last Updated</span>
                    <span className="font-medium">
                      {new Date(selectedQR.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
