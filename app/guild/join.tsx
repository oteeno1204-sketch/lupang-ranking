import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { AppScreen } from '@/components/AppScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { useJoinGuild, usePreviewGuildInvite } from '@/guild/membershipQueries';
import { ApiError } from '@/lib/apiClient';
import { theme } from '@/theme/tokens';

export default function GuildJoinScreen(){
  const router=useRouter();const params=useLocalSearchParams<{code?:string|string[]}>();const initial=Array.isArray(params.code)?params.code[0]??'':params.code??'';const [code,setCode]=useState(initial);const preview=usePreviewGuildInvite();const join=useJoinGuild();const [error,setError]=useState<string|null>(null);
  const previewCode=async(value=code)=>{const v=value.trim();if(!v)return;setError(null);try{await preview.mutateAsync(v);}catch(e){setError(e instanceof ApiError?e.message:'초대코드를 확인하지 못했습니다.');}};
  useEffect(()=>{if(initial)void previewCode(initial);},[]);
  const submit=async()=>{setError(null);try{await join.mutateAsync(code.trim());router.replace('/(tabs)/home');}catch(e){setError(e instanceof ApiError?e.message:'길드에 가입하지 못했습니다.');}};
  const deepLink=`https://lupang.expo.app/guild/join?code=${encodeURIComponent(code.trim())}`;
  return <AppScreen contentStyle={styles.screen}><Stack.Screen options={{title:'길드 가입'}}/><Text style={styles.title}>길드 초대</Text><TextField label="길드 초대코드" value={code} onChangeText={setCode} autoCapitalize="characters"/><PrimaryButton label="길드 정보 확인" onPress={()=>void previewCode()} loading={preview.isPending}/>{preview.data?<View style={styles.card}>{preview.data.guild.logoUrl?<Image source={{uri:preview.data.guild.logoUrl}} style={styles.logo} contentFit="contain"/>:null}<Text style={styles.guild}>{preview.data.guild.name}</Text><Text style={styles.tagline}>{preview.data.guild.tagline}</Text><Text style={styles.meta}>아이라 · {preview.data.guild.memberCount}/{preview.data.guild.maxMembers}명</Text>{preview.data.inviteRole === 'owner'?<Text style={styles.ownerHelp}>이 코드로 가입하면 최초 길드장으로 등록되고 길드가 활성화됩니다.</Text>:null}<Text style={styles.link} numberOfLines={1}>{deepLink}</Text><PrimaryButton label={preview.data.inviteRole === 'owner'?'길드장으로 등록하기':'이 길드에 가입하기'} onPress={()=>void submit()} loading={join.isPending}/></View>:null}{error?<Text style={styles.error}>{error}</Text>:null}</AppScreen>;
}
const styles=StyleSheet.create({screen:{gap:14,paddingBottom:60},title:{color:theme.colors.cream,fontSize:28,fontWeight:'900'},card:{gap:9,alignItems:'center',padding:18,borderRadius:24,borderWidth:1,borderColor:theme.colors.goldBorder,backgroundColor:'rgba(255,249,245,.96)'},logo:{width:90,height:90},guild:{fontSize:24,fontWeight:'900',color:theme.colors.text},tagline:{fontSize:13,fontWeight:'700',color:theme.colors.textMuted,textAlign:'center'},meta:{fontSize:12,color:theme.colors.textDim,fontWeight:'700'},ownerHelp:{padding:10,borderRadius:12,backgroundColor:'rgba(183,141,54,.1)',color:theme.colors.accentSoft,fontSize:12,fontWeight:'800',textAlign:'center'},link:{fontSize:10,color:theme.colors.textDim},error:{color:theme.colors.danger,textAlign:'center'}});
