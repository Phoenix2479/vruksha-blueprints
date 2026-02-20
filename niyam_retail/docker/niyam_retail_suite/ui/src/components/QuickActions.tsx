import React from 'react';
import { ShoppingCart, FileText, Package, ExternalLink } from 'lucide-react';

export interface QuickActionsProps {
  onOpenPOS?: () => void;
  onOpenBilling?: () => void;
  onOpenInventory?: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onOpenPOS,
  onOpenBilling,
  onOpenInventory,
}) => {
  const posUrl = import.meta.env.VITE_POS_URL || 'http://localhost:3003';
  const billingUrl = import.meta.env.VITE_BILLING_URL || 'http://localhost:3004';
  const inventoryUrl = import.meta.env.VITE_INVENTORY_URL || 'http://localhost:3005';

  const actions = [
    {
      title: 'Open POS',
      description: 'Start processing sales',
      icon: ShoppingCart,
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      onClick: onOpenPOS || (() => window.open(posUrl, '_blank')),
    },
    {
      title: 'Billing',
      description: 'Manage invoices & payments',
      icon: FileText,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      onClick: onOpenBilling || (() => window.open(billingUrl, '_blank')),
    },
    {
      title: 'Inventory',
      description: 'Check stock & products',
      icon: Package,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      onClick: onOpenInventory || (() => window.open(inventoryUrl, '_blank')),
    },
  ];

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.title}
              onClick={action.onClick}
              className={`flex items-center gap-4 p-4 rounded-lg ${action.color} ${action.hoverColor} text-white transition-all duration-200 transform hover:scale-105 hover:shadow-lg`}
            >
              <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                <Icon className="w-6 h-6" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold flex items-center gap-2">
                  {action.title}
                  <ExternalLink className="w-4 h-4" />
                </div>
                <div className="text-sm opacity-90">{action.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
