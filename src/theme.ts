import { Platform } from 'react-native';

export const colors = {
  ink: '#18332A',
  muted: '#667A72',
  canvas: '#F6F8F4',
  surface: '#FFFFFF',
  primary: '#147D64',
  primaryDark: '#0C5B49',
  primarySoft: '#E2F4ED',
  peach: '#FFF0E5',
  warning: '#B85C18',
  danger: '#B83A3A',
  dangerSoft: '#FDEAEA',
  border: '#DCE5DF',
  white: '#FFFFFF',
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const shadow = Platform.select({
  web: { boxShadow: '0 8px 30px rgba(24, 51, 42, 0.08)' } as const,
  default: {
    shadowColor: '#18332A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
});
