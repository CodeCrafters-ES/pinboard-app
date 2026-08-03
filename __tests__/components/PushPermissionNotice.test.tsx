import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PushPermissionNotice } from '@/components/PushPermissionNotice';
import type { PushRegistrationStatus } from '@/lib/notifications';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseSession = jest.fn();

jest.mock('@/hooks/useSession', () => ({
  useSession: () => mockUseSession(),
}));

function withPushStatus(pushStatus: PushRegistrationStatus | null) {
  mockUseSession.mockReturnValue({ pushStatus });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('PushPermissionNotice', () => {
  it('avisa cuando el usuario ha denegado los permisos', () => {
    withPushStatus('denied');

    render(<PushPermissionNotice />);

    expect(screen.getByText(/Notificaciones desactivadas/)).toBeTruthy();
  });

  it.each<PushRegistrationStatus | null>([null, 'registered', 'unsupported', 'error'])(
    'no muestra nada con pushStatus=%s',
    (pushStatus) => {
      withPushStatus(pushStatus);

      render(<PushPermissionNotice />);

      expect(screen.queryByText(/Notificaciones desactivadas/)).toBeNull();
    },
  );

  it('abre los ajustes del sistema', () => {
    withPushStatus('denied');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

    render(<PushPermissionNotice />);
    fireEvent.press(screen.getByLabelText('Abrir ajustes de notificaciones'));

    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  it('se puede descartar sin bloquear la app', () => {
    withPushStatus('denied');

    render(<PushPermissionNotice />);
    fireEvent.press(screen.getByLabelText('Cerrar aviso'));

    expect(screen.queryByText(/Notificaciones desactivadas/)).toBeNull();
  });
});
