export type Character = {
  id:string;profileId:string;name:string;job:string;level:number;avatarUrl:string|null;isPrimary:boolean;gameServer:'아이라'|null;officialSyncEnabled:boolean;
  officialLastSyncedAt:string|null;officialLastError:string|null;latestPower:number|null;latestPowerAt:string|null;powerDelta:number|null;
  latestCombatPower:number|null;latestLifePower:number|null;latestCharmPower:number|null;latestTotalPower:number|null;createdAt:string;updatedAt:string;
};
export type PowerRecord={id:string;power:number;combatPower:number|null;lifePower:number|null;charmPower:number|null;totalPower:number|null;source:'manual'|'official';statDate:string|null;sourceCheckedAt:string|null;note:string|null;recordedAt:string;createdAt:string};
export type CharacterDetail={character:Character;powerRecords:PowerRecord[]};
export type PowerRankingScope='guild'|'alliance';
export type PowerRanking={rank:number;profileId:string;nickname:string;characterId:string;characterName:string;job:string;power:number;recordedAt:string;sourceCheckedAt:string;guildId:string;guildName:string;scope:PowerRankingScope};
export type GrowthMetric='total'|'combat'|'life'|'charm';
export type GrowthSummary={week:number|null;month:number|null;all:number|null};
export type GrowthRanking={rank:number;profileId:string;nickname:string;characterId:string;characterName:string;job:string;avatarUrl:string|null;delta:number};
export type PowerGrowth={metric:GrowthMetric;personal:GrowthSummary;rankings:GrowthRanking[]};
export type CharacterInput={name:string;avatarPath?:string|null;profileId?:string;officialSyncEnabled?:boolean};
export type PowerInput={power:number;note?:string|null;recordedAt?:string};
export type OfficialSyncResult={characterId:string;server:string;characterName:string;job:string;combatPower:number;lifePower:number;charmPower:number;totalPower:number;checkedAt:string;statDate:string};
export type OfficialBrowserInput={server:'아이라';characterName:string;job:string;combatPower:number;lifePower:number;charmPower:number;totalPower:number};
export type GuildOfficialSyncTarget={characterId:string;characterName:string;profileId:string;nickname:string;avatarUrl:string|null};
