import React, { useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { Button, TenantSwitcher } from '@shared/components/index.ts';
import { hasAnyRole } from '@shared/utils/auth.ts';
import { openSession, closeSession, getActiveSession } from '../api/pos';
import { useSessionStore } from '../store/sessionStore';

export const SessionManager: React.FC = () => {
  const { session, isSessionOpen, setSession, clearSession } = useSessionStore();
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('100.00');
  const [closingBalance, setClosingBalance] = useState('');
  const [actualCash, setActualCash] = useState('');

  // Auto-resume an already open session (common after backend restarts)
  useEffect(() => {
    const cashierId = '00000000-0000-0000-0000-000000000001';
    (async () => {
      try {
        const existing = await getActiveSession(cashierId);
        if (existing) setSession(existing);
      } catch (_) {
        // ignore
      }
    })();
  }, [setSession]);

  const handleOpenSession = async () => {
    try {
      setOpening(true);
      const newSession = await openSession({
        store_id: '00000000-0000-0000-0000-000000000001',
        cashier_id: '00000000-0000-0000-0000-000000000001',
        opening_balance: parseFloat(openingBalance),
        register_number: 'REG-001',
      });
      setSession(newSession);
    } catch (error) {
      // If opening fails, try to resume any active session for this cashier
      const resumed = await getActiveSession('00000000-0000-0000-0000-000000000001');
      if (resumed) {
        setSession(resumed);
      } else {
        alert('Failed to open session. Please try again.');
      }
    } finally {
      setOpening(false);
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    
    try {
      setClosing(true);
      await closeSession(session.id, {
        closing_balance: parseFloat(closingBalance),
        actual_cash: actualCash ? parseFloat(actualCash) : undefined,
      });
      clearSession();
      setClosingBalance('');
      setActualCash('');
    } catch (error) {
      alert('Failed to close session. Please try again.');
    } finally {
      setClosing(false);
    }
  };

  if (!isSessionOpen) {
    return (
      <div className="card max-w-md mx-auto mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <LogIn className="w-6 h-6" />
          Open Register
        </h2>
        <div className="space-y-4">
          <div>
            <label className="label">Opening Balance</label>
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="input"
              placeholder="100.00"
            />
          </div>
          {hasAnyRole(['cashier','manager','admin']) && (
          <Button
            variant="primary"
            loading={opening}
            onClick={handleOpenSession}
            className="w-full"
          >
            Open Register
          </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-b shadow-sm px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-sm font-medium text-gray-700">Session Active</span>
          </div>
          <div className="text-sm text-gray-600">
            Register: {session?.register_number || 'REG-001'}
          </div>
          <div className="text-sm text-gray-600">
            {(() => {
              const ob = session ? Number(session.opening_balance ?? 0) : 0;
              return `Opening: $${ob.toFixed(2)}`;
            })()}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <TenantSwitcher />
          <Button
          variant="danger"
          size="sm"
          onClick={() => {
            const shouldClose = window.confirm('Close register and end session?');
            if (shouldClose) {
              const balance = prompt('Enter closing balance:');
              const cash = prompt('Enter actual cash counted (optional):');
              if (balance) {
                setClosingBalance(balance);
                setActualCash(cash || '');
                handleCloseSession();
              }
            }
          }}
          loading={closing}
        >
          <LogOut className="w-4 h-4" />
          Close Register
        </Button>
        </div>
      </div>
    </div>
  );
};
