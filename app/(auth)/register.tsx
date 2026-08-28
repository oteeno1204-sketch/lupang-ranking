import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppScreen } from '@/components/AppScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { useAuthStore } from '@/auth/store';
import { validateInviteCode, validateNickname, validatePin } from '@/auth/validation';
import { authErrorMessages } from '@/app-auth-errors-shim';
import { ApiError } from '@/lib/apiClient';
import { theme } from '@/theme/tokens';

export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const [inviteCode, setInviteCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    const inviteError = validateInviteCode(inviteCode);
    const nicknameError = validateNickname(nickname);
    const pinError = validatePin(pin);
    if (inviteError) nextErrors.inviteCode = inviteError;
    if (nicknameError) nextErrors.nickname = nicknameError;
    if (pinError) nextErrors.pin = pinError;
    if (pin !== pinConfirm) nextErrors.pinConfirm = 'PIN 확인이 일치하지 않습니다.';
    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      await register({ inviteCode, nickname, pin });
      router.replace('/(tabs)/home');
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? authErrorMessages[error.code] ?? error.message
          : '가입하지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.heading}>
        <Text style={styles.title}>루팡 연합 계정 만들기</Text>
        <Text style={styles.subtitle}>받은 숫자 4자리 길드 초대코드로 계정 생성과 길드 가입을 한 번에 완료해요.</Text>
        <Text style={styles.ownerHelp}>길드장 초대코드라면 가입 즉시 최초 길드장으로 등록되고 길드가 활성화돼요.</Text>
      </View>
      <View style={styles.card}>
        <TextField
          label="길드 초대코드"
          value={inviteCode}
          onChangeText={(text) => setInviteCode(text.replace(/\D/g, '').slice(0, 4))}
          error={errors.inviteCode}
          keyboardType="number-pad"
          maxLength={4}
        />
        <TextField
          label="닉네임"
          value={nickname}
          onChangeText={setNickname}
          error={errors.nickname}
          autoCapitalize="none"
        />
        <TextField
          label="PIN"
          value={pin}
          onChangeText={setPin}
          error={errors.pin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
        />
        <TextField
          label="PIN 확인"
          value={pinConfirm}
          onChangeText={setPinConfirm}
          error={errors.pinConfirm}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
        />
        {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}
        <PrimaryButton label="가입하기" onPress={submit} loading={loading} />
        <PrimaryButton label="로그인으로 돌아가기" variant="ghost" onPress={() => router.back()} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', gap: theme.spacing.lg },
  heading: { gap: theme.spacing.xs },
  title: { color: theme.colors.screenText, fontSize: 28, fontWeight: '900', textShadowColor: 'rgba(0,0,0,.42)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 5 },
  subtitle: { color: theme.colors.screenTextMuted, fontSize: theme.typography.body },
  ownerHelp: { color: theme.colors.gold, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  card: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  serverError: { color: theme.colors.danger, textAlign: 'center' },
});
