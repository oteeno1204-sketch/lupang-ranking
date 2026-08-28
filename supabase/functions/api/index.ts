import { createClient } from 'npm:@supabase/supabase-js@2';

import { handleLogin, handleLogout, handleMe, handleRegister } from './auth.ts';
import type { HandlerResult, ServiceClient } from './types.ts';
import { handleCreateNotice, handleDeleteNotice, handleGetNotice, handleListNotices, handleUpdateNotice } from './notices.ts';
import { handleCreateSchedule, handleDeleteSchedule, handleGetSchedule, handleListSchedules, handleUpdateSchedule } from './schedules.ts';
import { handleAdminUpdateMember, handleGetMember, handleListMembers, handlePresenceHeartbeat, handleRemoveMember, handleUpdateMyProfile } from './members.ts';
import { handleCreateCharacter, handleCreatePowerRecord, handleDeleteCharacter, handleGetCharacter, handleListGuildOfficialSyncTargets, handleListMyCharacters, handleListPowerRecords, handleOfficialBrowserResult, handlePowerRankings, handleSetPrimaryCharacter, handleUpdateCharacter } from './characters.ts';
import { handleOfficialStatsJob, handleSyncOfficialStats } from './officialStats.ts';
import { handleCreateProposal, handleDeleteProposal, handleGetProposal, handleJoinProposal, handleLeaveProposal, handleListProposals, handleUpdateProposal } from './proposals.ts';
import { handleCreateAlbum, handleCreateAlbumComment, handleDeleteAlbum, handleDeleteAlbumComment, handleGetAlbum, handleListAlbumComments, handleListAlbums, handleToggleAlbumCommentLike, handleToggleAlbumLike, handleUpdateAlbum } from './albums.ts';
import { handleSignUpload } from './uploads.ts';
import { handleCreateChatAnnouncement, handleCreateChatEmoji, handleCreateChatEmojiBatch, handleCreateChatEmojiPack, handleDeleteChatEmoji, handleDeleteChatEmojiPack, handleDeleteMessage, handleGetChatNotificationPreference, handleListChatAnnouncements, handleListChatEmojis, handleListChatEmojiPacks, handleListChatRooms, handleListMessages, handleMarkRoomRead, handleOpenDirectRoom, handleSendMessage, handleSetChatNotificationPreference, handleUpdateChatAnnouncement, handleUpdateChatEmojiPack } from './chat.ts';
import { handleRegisterPush, handleUnregisterPush } from './push.ts';
import { handleGetGuildSettings, handleUpdateGuildSettings } from './guild.ts';
import {
  handleCreateAdminGuild,
  handleCreateGuildInvite,
  handleDeactivateAdminGuild,
  handleDeleteGuildInvite,
  handleJoinGuild,
  handleLeaveGuild,
  handleListAdminGuilds,
  handleIssueOwnerGuildInvite,
  handlePermanentlyDeleteAdminGuild,
  handlePreviewGuildInvite,
  handleRestoreAdminGuild,
  handleTransferGuildOwner,
  handleUpdateAdminGuild,
  handleUpdateGuildMemberRole,
} from './guildAdmin.ts';
import { handleCreateGuestbook, handleDeleteGuestbook, handleListGuestbook } from './guestbook.ts';
import { handlePowerGrowth } from './powerGrowth.ts';
import { handleBlockProfile, handleCreateDirectReport, handleListDirectReports, handleSearchDirectory, handleUnblockProfile, handleUpdateDirectReport } from './directModeration.ts';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function render<T>(result: HandlerResult<T>): Response {
  if (result.ok) return json({ data: result.data, error: null }, result.status ?? 200);
  return json({ data: null, error: { code: result.code, message: result.message } }, result.status);
}

function serviceClient(): ServiceClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizePath(req: Request): string {
  const pathname = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
  const withoutGateway = pathname.replace(/^\/functions\/v1\/api(?=\/|$)/, '');
  return withoutGateway.replace(/^\/api(?=\/|$)/, '') || '/';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const client = serviceClient();
    const path = normalizePath(req);

    if (req.method === 'POST' && path === '/register') return render(await handleRegister(req, client));
    if (req.method === 'POST' && path === '/login') return render(await handleLogin(req, client));
    if (req.method === 'POST' && path === '/logout') return render(await handleLogout(req, client));
    if (req.method === 'GET' && path === '/me') return render(await handleMe(req, client));

    if (path === '/admin/guilds' && req.method === 'GET') return render(await handleListAdminGuilds(req, client));
    if (path === '/admin/guilds' && req.method === 'POST') return render(await handleCreateAdminGuild(req, client));
    const adminGuildOwnerInviteMatch = /^\/admin\/guilds\/([^/]+)\/owner-invite$/.exec(path);
    if (adminGuildOwnerInviteMatch && req.method === 'POST') {
      return render(await handleIssueOwnerGuildInvite(req, client, decodeURIComponent(adminGuildOwnerInviteMatch[1])));
    }
    const adminGuildDeactivateMatch = /^\/admin\/guilds\/([^/]+)\/deactivate$/.exec(path);
    if (adminGuildDeactivateMatch && req.method === 'POST') {
      return render(await handleDeactivateAdminGuild(req, client, decodeURIComponent(adminGuildDeactivateMatch[1])));
    }
    const adminGuildRestoreMatch = /^\/admin\/guilds\/([^/]+)\/restore$/.exec(path);
    if (adminGuildRestoreMatch && req.method === 'POST') {
      return render(await handleRestoreAdminGuild(req, client, decodeURIComponent(adminGuildRestoreMatch[1])));
    }
    const adminGuildOwnerMatch = /^\/admin\/guilds\/([^/]+)\/owner$/.exec(path);
    if (adminGuildOwnerMatch && req.method === 'POST') {
      return render(await handleTransferGuildOwner(req, client, decodeURIComponent(adminGuildOwnerMatch[1])));
    }
    const adminGuildMatch = /^\/admin\/guilds\/([^/]+)$/.exec(path);
    if (adminGuildMatch && req.method === 'PATCH') {
      return render(await handleUpdateAdminGuild(req, client, decodeURIComponent(adminGuildMatch[1])));
    }
    if (adminGuildMatch && req.method === 'DELETE') {
      return render(await handlePermanentlyDeleteAdminGuild(req, client, decodeURIComponent(adminGuildMatch[1])));
    }

    if (path === '/guild/invites' && req.method === 'POST') return render(await handleCreateGuildInvite(req, client));
    if (path === '/guild/invites/preview' && req.method === 'POST') return render(await handlePreviewGuildInvite(req, client));
    if (path === '/guild/join' && req.method === 'POST') return render(await handleJoinGuild(req, client));
    if (path === '/guild/leave' && req.method === 'POST') return render(await handleLeaveGuild(req, client));
    const guildInviteMatch = /^\/guild\/invites\/([^/]+)$/.exec(path);
    if (guildInviteMatch && req.method === 'DELETE') {
      return render(await handleDeleteGuildInvite(req, client, decodeURIComponent(guildInviteMatch[1])));
    }
    const guildMemberRoleMatch = /^\/guild\/members\/([^/]+)\/role$/.exec(path);
    if (guildMemberRoleMatch && req.method === 'PATCH') {
      return render(await handleUpdateGuildMemberRole(req, client, decodeURIComponent(guildMemberRoleMatch[1])));
    }


    if (path === '/directory' && req.method === 'GET') return render(await handleSearchDirectory(req, client));
    if (path === '/direct-reports' && req.method === 'POST') return render(await handleCreateDirectReport(req, client));
    if (path === '/admin/direct-reports' && req.method === 'GET') return render(await handleListDirectReports(req, client));
    const directReportMatch = /^\/admin\/direct-reports\/([^/]+)$/.exec(path);
    if (directReportMatch && req.method === 'PATCH') return render(await handleUpdateDirectReport(req, client, decodeURIComponent(directReportMatch[1])));
    const profileBlockMatch = /^\/profiles\/([^/]+)\/block$/.exec(path);
    if (profileBlockMatch) {
      const targetId = decodeURIComponent(profileBlockMatch[1]);
      if (req.method === 'POST') return render(await handleBlockProfile(req, client, targetId));
      if (req.method === 'DELETE') return render(await handleUnblockProfile(req, client, targetId));
    }

    if (path === '/guild-settings' && req.method === 'GET') return render(await handleGetGuildSettings(req, client));
    if (path === '/guild-settings' && req.method === 'PATCH') return render(await handleUpdateGuildSettings(req, client));

    if (path === '/notices' && req.method === 'GET') return render(await handleListNotices(req, client));
    if (path === '/notices' && req.method === 'POST') return render(await handleCreateNotice(req, client));
    const noticeMatch = /^\/notices\/([^/]+)$/.exec(path);
    if (noticeMatch) {
      const id = decodeURIComponent(noticeMatch[1]);
      if (req.method === 'GET') return render(await handleGetNotice(req, client, id));
      if (req.method === 'PATCH') return render(await handleUpdateNotice(req, client, id));
      if (req.method === 'DELETE') return render(await handleDeleteNotice(req, client, id));
    }

    if (path === '/schedules' && req.method === 'GET') return render(await handleListSchedules(req, client));
    if (path === '/schedules' && req.method === 'POST') return render(await handleCreateSchedule(req, client));
    const scheduleMatch = /^\/schedules\/([^/]+)$/.exec(path);
    if (scheduleMatch) {
      const id = decodeURIComponent(scheduleMatch[1]);
      if (req.method === 'GET') return render(await handleGetSchedule(req, client, id));
      if (req.method === 'PATCH') return render(await handleUpdateSchedule(req, client, id));
      if (req.method === 'DELETE') return render(await handleDeleteSchedule(req, client, id));
    }

    if (path === '/members' && req.method === 'GET') return render(await handleListMembers(req, client));
    if (path === '/presence/heartbeat' && req.method === 'POST') return render(await handlePresenceHeartbeat(req, client));
    if (path === '/profile' && req.method === 'PATCH') return render(await handleUpdateMyProfile(req, client));
    const memberMatch = /^\/members\/([^/]+)$/.exec(path);
    if (memberMatch) {
      const id = decodeURIComponent(memberMatch[1]);
      if (req.method === 'GET') return render(await handleGetMember(req, client, id));
      if (req.method === 'PATCH') return render(await handleAdminUpdateMember(req, client, id));
      if (req.method === 'DELETE') return render(await handleRemoveMember(req, client, id));
    }

    const guestbookProfile = /^\/profiles\/([^/]+)\/guestbook$/.exec(path);
    if (guestbookProfile) {
      const id = decodeURIComponent(guestbookProfile[1]);
      if (req.method === 'GET') return render(await handleListGuestbook(req, client, id));
      if (req.method === 'POST') return render(await handleCreateGuestbook(req, client, id));
    }
    const guestbookEntry = /^\/guestbook\/([^/]+)$/.exec(path);
    if (guestbookEntry && req.method === 'DELETE') return render(await handleDeleteGuestbook(req, client, decodeURIComponent(guestbookEntry[1])));

    if (path === '/characters' && req.method === 'GET') return render(await handleListMyCharacters(req, client));
    if (path === '/guild/official-sync-targets' && req.method === 'GET') return render(await handleListGuildOfficialSyncTargets(req, client));
    if (path === '/characters' && req.method === 'POST') return render(await handleCreateCharacter(req, client));
    if (path === '/power/rankings' && req.method === 'GET') return render(await handlePowerRankings(req, client));
    if (path === '/power/growth' && req.method === 'GET') return render(await handlePowerGrowth(req, client));
    if (path === '/jobs/official-stats-sync' && req.method === 'POST') return render(await handleOfficialStatsJob(req, client));
    const officialBrowserResult = /^\/characters\/([^/]+)\/official-browser-result$/.exec(path);
    if (officialBrowserResult && req.method === 'POST') return render(await handleOfficialBrowserResult(req, client, decodeURIComponent(officialBrowserResult[1])));
        const officialStatsSync = /^\/characters\/([^/]+)\/official-stats\/sync$/.exec(path);
    if (officialStatsSync && req.method === 'POST') return render(await handleSyncOfficialStats(req, client, decodeURIComponent(officialStatsSync[1])));
    const characterPrimary = /^\/characters\/([^/]+)\/primary$/.exec(path);
    if (characterPrimary && req.method === 'POST') return render(await handleSetPrimaryCharacter(req, client, decodeURIComponent(characterPrimary[1])));
    const characterPower = /^\/characters\/([^/]+)\/power-records$/.exec(path);
    if (characterPower) {
      const id = decodeURIComponent(characterPower[1]);
      if (req.method === 'GET') return render(await handleListPowerRecords(req, client, id));
      if (req.method === 'POST') return render(await handleCreatePowerRecord(req, client, id));
    }
    const characterMatch = /^\/characters\/([^/]+)$/.exec(path);
    if (characterMatch) {
      const id = decodeURIComponent(characterMatch[1]);
      if (req.method === 'GET') return render(await handleGetCharacter(req, client, id));
      if (req.method === 'PATCH') return render(await handleUpdateCharacter(req, client, id));
      if (req.method === 'DELETE') return render(await handleDeleteCharacter(req, client, id));
    }

    if (path === '/proposals' && req.method === 'GET') return render(await handleListProposals(req, client));
    if (path === '/proposals' && req.method === 'POST') return render(await handleCreateProposal(req, client));
    const proposalJoin = /^\/proposals\/([^/]+)\/join$/.exec(path);
    if (proposalJoin && req.method === 'POST') return render(await handleJoinProposal(req, client, decodeURIComponent(proposalJoin[1])));
    const proposalLeave = /^\/proposals\/([^/]+)\/leave$/.exec(path);
    if (proposalLeave && req.method === 'POST') return render(await handleLeaveProposal(req, client, decodeURIComponent(proposalLeave[1])));
    const proposalMatch = /^\/proposals\/([^/]+)$/.exec(path);
    if (proposalMatch) {
      const id = decodeURIComponent(proposalMatch[1]);
      if (req.method === 'GET') return render(await handleGetProposal(req, client, id));
      if (req.method === 'PATCH') return render(await handleUpdateProposal(req, client, id));
      if (req.method === 'DELETE') return render(await handleDeleteProposal(req, client, id));
    }

    if (path === '/albums' && req.method === 'GET') return render(await handleListAlbums(req, client));
    if (path === '/albums' && req.method === 'POST') return render(await handleCreateAlbum(req, client));
    const albumLike = /^\/albums\/([^/]+)\/like$/.exec(path);
    if (albumLike && req.method === 'POST') return render(await handleToggleAlbumLike(req, client, decodeURIComponent(albumLike[1])));
    const albumComments = /^\/albums\/([^/]+)\/comments$/.exec(path);
    if (albumComments) { const id = decodeURIComponent(albumComments[1]); if (req.method === 'GET') return render(await handleListAlbumComments(req, client, id)); if (req.method === 'POST') return render(await handleCreateAlbumComment(req, client, id)); }
    const albumCommentLike = /^\/albums\/comments\/([^/]+)\/like$/.exec(path);
    if (albumCommentLike && req.method === 'POST') return render(await handleToggleAlbumCommentLike(req, client, decodeURIComponent(albumCommentLike[1])));
    const albumComment = /^\/albums\/comments\/([^/]+)$/.exec(path);
    if (albumComment && req.method === 'DELETE') return render(await handleDeleteAlbumComment(req, client, decodeURIComponent(albumComment[1])));
        const albumMatch = /^\/albums\/([^/]+)$/.exec(path);
    if (albumMatch) {
      const id = decodeURIComponent(albumMatch[1]);
      if (req.method === 'GET') return render(await handleGetAlbum(req, client, id));
      if (req.method === 'PATCH') return render(await handleUpdateAlbum(req, client, id));
      if (req.method === 'DELETE') return render(await handleDeleteAlbum(req, client, id));
    }

    if (path === '/uploads/sign' && req.method === 'POST') return render(await handleSignUpload(req, client));

    if (path === '/chat/rooms' && req.method === 'GET') return render(await handleListChatRooms(req, client));
    const directMatch = /^\/chat\/direct\/([^/]+)$/.exec(path);
    if (directMatch && req.method === 'POST') return render(await handleOpenDirectRoom(req, client, decodeURIComponent(directMatch[1])));
    const roomMessages = /^\/chat\/rooms\/([^/]+)\/messages$/.exec(path);
    if (roomMessages) {
      const id = decodeURIComponent(roomMessages[1]);
      if (req.method === 'GET') return render(await handleListMessages(req, client, id));
      if (req.method === 'POST') return render(await handleSendMessage(req, client, id));
    }
    const roomRead = /^\/chat\/rooms\/([^/]+)\/read$/.exec(path);
    if (roomRead && req.method === 'POST') return render(await handleMarkRoomRead(req, client, decodeURIComponent(roomRead[1])));
    const roomNotification = /^\/chat\/rooms\/([^/]+)\/notification-preference$/.exec(path);
    if (roomNotification) {
      const id = decodeURIComponent(roomNotification[1]);
      if (req.method === 'GET') return render(await handleGetChatNotificationPreference(req, client, id));
      if (req.method === 'PUT') return render(await handleSetChatNotificationPreference(req, client, id));
    }
    const roomAnnouncements = /^\/chat\/rooms\/([^/]+)\/announcements$/.exec(path);
    if (roomAnnouncements) {
      const id = decodeURIComponent(roomAnnouncements[1]);
      if (req.method === 'GET') return render(await handleListChatAnnouncements(req, client, id));
      if (req.method === 'POST') return render(await handleCreateChatAnnouncement(req, client, id));
    }
    const announcementMatch = /^\/chat\/announcements\/([^/]+)$/.exec(path);
    if (announcementMatch && req.method === 'PATCH') return render(await handleUpdateChatAnnouncement(req, client, decodeURIComponent(announcementMatch[1])));
    if (path === '/chat/emoji-packs' && req.method === 'GET') return render(await handleListChatEmojiPacks(req, client));
    if (path === '/chat/emoji-packs' && req.method === 'POST') return render(await handleCreateChatEmojiPack(req, client));
    const emojiPackMatch = /^\/chat\/emoji-packs\/([^/]+)$/.exec(path);
    if (emojiPackMatch && req.method === 'PATCH') return render(await handleUpdateChatEmojiPack(req, client, decodeURIComponent(emojiPackMatch[1])));
    if (emojiPackMatch && req.method === 'DELETE') return render(await handleDeleteChatEmojiPack(req, client, decodeURIComponent(emojiPackMatch[1])));
    if (path === '/chat/emojis' && req.method === 'GET') return render(await handleListChatEmojis(req, client));
    if (path === '/chat/emojis' && req.method === 'POST') return render(await handleCreateChatEmoji(req, client));
    if (path === '/chat/emojis/batch' && req.method === 'POST') return render(await handleCreateChatEmojiBatch(req, client));
    const emojiMatch = /^\/chat\/emojis\/([^/]+)$/.exec(path);
    if (emojiMatch && req.method === 'DELETE') return render(await handleDeleteChatEmoji(req, client, decodeURIComponent(emojiMatch[1])));
    const messageMatch = /^\/chat\/messages\/([^/]+)$/.exec(path);
    if (messageMatch && req.method === 'DELETE') return render(await handleDeleteMessage(req, client, decodeURIComponent(messageMatch[1])));

    if (path === '/push/register' && req.method === 'POST') return render(await handleRegisterPush(req, client));
    if (path === '/push/unregister' && req.method === 'POST') return render(await handleUnregisterPush(req, client));

    return json({ data: null, error: { code: 'NOT_FOUND', message: '요청 경로가 없습니다.' } }, 404);
  } catch (error) {
    console.error('unhandled edge function error', error instanceof Error ? error.message : error);
    return json({ data: null, error: { code: 'SERVER_ERROR', message: '서버 오류가 발생했습니다.' } }, 500);
  }
});
