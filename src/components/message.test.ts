import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmAction } from './confirm';
import { showMessage } from './message';

const native = vi.hoisted(() => ({ Alert: { alert: vi.fn() }, Platform: { OS: 'web' } }));
vi.mock('react-native', () => native);
const alert = vi.fn(), confirm = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); native.Platform.OS = 'web';
  vi.stubGlobal('alert', alert); vi.stubGlobal('confirm', confirm);
});
afterEach(() => vi.unstubAllGlobals());

describe('Zprávy a potvrzení na webu i telefonu', () => {
  it('na webu skutečně zobrazí nadpis i důvod chyby', () => {
    showMessage('Zkontrolujte počet', 'Zadejte konečný počet kusů.');
    expect(alert).toHaveBeenCalledExactlyOnceWith('Zkontrolujte počet\n\nZadejte konečný počet kusů.');
    expect(native.Alert.alert).not.toHaveBeenCalled();
  });
  it.each(['android', 'ios'])('na %s zachová nativní hlášení', (platform) => {
    native.Platform.OS = platform;
    showMessage('Hotovo', 'Změny byly uloženy.');
    expect(native.Alert.alert).toHaveBeenCalledExactlyOnceWith('Hotovo', 'Změny byly uloženy.');
    expect(alert).not.toHaveBeenCalled();
  });
  it.each([true, false])('na webu vrátí výsledek potvrzení %s', async (answer) => {
    confirm.mockReturnValue(answer);
    expect(await confirmAction('Je zpráva odeslaná?', 'Označte stav ručně.', 'Ano, odesláno', false, 'Zatím ne')).toBe(answer);
    expect(confirm).toHaveBeenCalledExactlyOnceWith('Je zpráva odeslaná?\n\nOznačte stav ručně.');
    expect(native.Alert.alert).not.toHaveBeenCalled();
  });
  it('nativní potvrzení zachová vlastní popisky a potvrdí jen kladnou akci', async () => {
    native.Platform.OS = 'android';
    const result = confirmAction('Je zpráva odeslaná?', 'Označte stav ručně.', 'Ano, odesláno', false, 'Zatím ne');
    const buttons = native.Alert.alert.mock.calls[0]![2]!;
    expect(buttons.map((button: { text: string }) => button.text)).toEqual(['Zatím ne', 'Ano, odesláno']);
    buttons[1].onPress();
    expect(await result).toBe(true);
  });
  it('nativní zavření dialogu nikdy nepotvrdí operaci', async () => {
    native.Platform.OS = 'ios';
    const result = confirmAction('Potvrdit?', 'Text.', 'Potvrdit');
    native.Alert.alert.mock.calls[0]![3]!.onDismiss();
    expect(await result).toBe(false);
  });
});
