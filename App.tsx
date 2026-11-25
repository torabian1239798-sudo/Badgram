import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, Linking, Image
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, useAudioPlayer } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import { isSupabaseConfigured, supabase } from "./src/supabase";

type Chat = {
  id: string;
  title: string;
  is_group: boolean;
  preview: string;
  time: string;
};
type Message = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_message_id?: string | null;
};

function normalizePhone(value: string) {
  return value.trim().replace(/[\s()-]/g, "");
}
function chatTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"chats" | "groups" | "settings">("chats");
  const [chats, setChats] = useState<Chat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [selected, setSelected] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [memberPhones, setMemberPhones] = useState("");
  const [newChatType, setNewChatType] = useState<"private" | "group">("private");
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [readMessageIds, setReadMessageIds] = useState<string[]>([]);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Array<{ user_id: string; role: string; display_name?: string | null; phone?: string | null }>>([]);
  const [groupPhone, setGroupPhone] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<Record<string, string>>({});
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const audioPlayer = useAudioPlayer(null);
  const videoPlayer = useVideoPlayer(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const openChatRequest = useRef(0);

  useEffect(() => {
    let alive = true;
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError("");
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user || demoMode) return;
    const userPhone = session.user.phone;
    if (userPhone) {
      supabase.from("profiles").upsert(
        { id: session.user.id, phone: userPhone },
        { onConflict: "id" }
      ).then(({ error: profileError }) => {
        if (profileError) setError(profileError.message);
      });
    }
    loadConversations();
  }, [session?.user?.id, demoMode]);

  useEffect(() => {
    if (demoMode || !selected?.id || !messages.length) return;
    let active = true;
    const pending = messages.filter((message) => {
      const attachment = parseMediaMessage(message.body);
      return !!attachment && attachment.mime.startsWith("image/") && !mediaPreviewUrls[message.id];
    });
    if (!pending.length) return;
    void Promise.all(pending.map(async (message) => {
      const attachment = parseMediaMessage(message.body);
      if (!attachment) return null;
      const { data, error: signedError } = await supabase.storage
        .from("badgram-chat-media").createSignedUrl(attachment.path, 60 * 10);
      if (signedError || !data?.signedUrl) return null;
      return [message.id, data.signedUrl] as const;
    })).then((entries) => {
      if (!active) return;
      const valid = entries.filter((entry): entry is readonly [string, string] => !!entry);
      if (valid.length) setMediaPreviewUrls((current) => ({ ...current, ...Object.fromEntries(valid) }));
    });
    return () => { active = false; };
  }, [messages, selected?.id, demoMode, mediaPreviewUrls]);

  async function loadConversations() {
    if (demoMode) {
      setChats([{ id: "demo-chat-1", title: "گفتگوی آزمایشی بادگرام", is_group: false, preview: "به بادگرام خوش آمدید؛ این یک پیام آزمایشی است.", time: chatTime(new Date().toISOString()) }]);
      setLoadingChats(false);
      return;
    }
    if (!session?.user?.id) return;
    setLoadingChats(true);
    const { data, error: listError } = await supabase.rpc("list_my_conversations");
    setLoadingChats(false);
    if (listError) {
      setError(listError.message);
      return;
    }
    const rows = (data ?? []) as any[];
    setChats(rows.map((row) => ({
      id: row.id,
      title: row.title || (row.is_group ? "گروه بدون نام" : "گفت‌وگوی خصوصی"),
      is_group: !!row.is_group,
      preview: row.last_message || "هنوز پیامی ارسال نشده است",
      time: chatTime(row.last_message_at || row.created_at)
    })));
  }

  async function sendCode() {
    const cleanPhone = normalizePhone(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(cleanPhone)) {
      setError("شماره را با کد کشور وارد کنید؛ نمونه: +989123456789");
      return;
    }
    if (!isSupabaseConfigured) {
      setError("ابتدا آدرس پروژه و کلید عمومی Supabase را در فایل .env تنظیم کنید.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: sendError } = await supabase.auth.signInWithOtp({ phone: cleanPhone });
    setBusy(false);
    if (sendError) setError(sendError.message);
    else {
      setPhone(cleanPhone);
      setOtpSent(true);
    }
  }

  async function verifyCode() {
    if (!/^\d{4,8}$/.test(otp.trim())) {
      setError("کد تأیید باید بین ۴ تا ۸ رقم باشد.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: normalizePhone(phone), token: otp.trim(), type: "sms"
    });
    setBusy(false);
    if (verifyError) setError(verifyError.message);
  }

  async function openChat(chat: Chat) {
    const requestId = ++openChatRequest.current;
    setError("");
    setMessages(demoMode ? [{ id: "demo-message-1", body: "به بادگرام خوش آمدید؛ محیط آزمایشی فعال است.", sender_id: "demo-user", created_at: new Date().toISOString() }] : []);
    setSelected(chat);
    if (demoMode) return;
    const { data, error: messageError } = await supabase.from("messages")
      .select("id,body,sender_id,created_at,edited_at,deleted_at,reply_to_message_id")
      .eq("conversation_id", chat.id)
      .order("created_at", { ascending: true })
      .limit(100);
    if (requestId !== openChatRequest.current) return;
    if (messageError) {
      setError(messageError.message);
    } else {
      const loaded = (data ?? []) as Message[];
      setMessages(loaded);
      const incomingIds = loaded.filter((m) => m.sender_id !== session?.user?.id && !m.deleted_at).map((m) => m.id);
      if (incomingIds.length) {
        const receipts = incomingIds.map((message_id) => ({ message_id, user_id: session.user.id }));
        const { error: readError } = await supabase.from("message_read_receipts").upsert(receipts, { onConflict: "message_id,user_id", ignoreDuplicates: true });
        if (readError) setError(readError.message);
      }
      const ownIds = loaded.filter((m) => m.sender_id === session?.user?.id).map((m) => m.id);
      if (ownIds.length) {
        const { data: receipts, error: receiptError } = await supabase.from("message_read_receipts").select("message_id").in("message_id", ownIds).neq("user_id", session.user.id);
        if (!receiptError) setReadMessageIds([...new Set((receipts ?? []).map((r: any) => r.message_id))]);
      }
    }
  }

  useEffect(() => {
    if (demoMode || !selected?.id) return;
    const channel = supabase.channel("badgram-messages-" + selected.id)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq." + selected.id
      }, (payload) => {
        const incoming = payload.new as Message;
        setMessages((current) => current.some((item) => item.id === incoming.id)
          ? current : [...current, incoming]);
        setChats((current) => current.map((chat) => chat.id === selected.id
          ? { ...chat, preview: incoming.body, time: chatTime(incoming.created_at) }
          : chat));
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq." + selected.id
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "message_read_receipts"
      }, (payload) => {
        const receipt = payload.new as { message_id?: string; user_id?: string };
        if (!receipt.message_id || receipt.user_id === session?.user?.id) return;
        setReadMessageIds((ids) => ids.includes(receipt.message_id!) ? ids : [...ids, receipt.message_id!]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected?.id, demoMode]);

  async function loadGroupMembers() {
    if (!selected?.is_group || demoMode) return;
    const { data, error: memberError } = await supabase.from("conversation_members")
      .select("user_id,role").eq("conversation_id", selected.id).order("joined_at", { ascending: true });
    if (memberError) {
      setError(memberError.message);
      return;
    }
    const members = (data ?? []) as Array<{ user_id: string; role: string }>;
    const userIds = members.map((member) => member.user_id);
    if (!userIds.length) {
      setGroupMembers([]);
      return;
    }
    const { data: profiles, error: profileError } = await supabase.from("profiles")
      .select("id,display_name,phone").in("id", userIds);
    if (profileError) {
      // Keep membership management usable even if profile visibility is restricted by RLS.
      setGroupMembers(members);
      return;
    }
    const profileById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    setGroupMembers(members.map((member) => {
      const profile = profileById.get(member.user_id) as any;
      return { ...member, display_name: profile?.display_name ?? null, phone: profile?.phone ?? null };
    }));
  }

  async function addGroupMember() {
    if (!selected || !groupPhone.trim()) return;
    const clean = normalizePhone(groupPhone);
    if (!/^\+[1-9]\d{7,14}$/.test(clean)) { setError("شماره را با کد کشور وارد کنید."); return; }
    setGroupBusy(true); setError("");
    const { data, error: lookupError } = await supabase.rpc("find_profile_by_phone", { p_phone: clean });
    const found = (data ?? [])[0];
    if (lookupError || !found?.user_id) {
      setError(lookupError?.message || "این شماره در بادگرام ثبت‌نام نکرده است.");
      setGroupBusy(false); return;
    }
    const { error: insertError } = await supabase.from("conversation_members").insert({ conversation_id: selected.id, user_id: found.user_id });
    if (insertError) setError(insertError.message);
    else { setGroupPhone(""); await loadGroupMembers(); }
    setGroupBusy(false);
  }

  async function changeGroupMemberRole(userId: string, role: string) {
    if (!selected) return;
    setGroupBusy(true); setError("");
    const { error: roleError } = await supabase.from("conversation_members").update({ role }).eq("conversation_id", selected.id).eq("user_id", userId);
    if (roleError) setError(roleError.message); else await loadGroupMembers();
    setGroupBusy(false);
  }

  async function removeGroupMember(userId: string) {
    if (!selected) return;
    setGroupBusy(true); setError("");
    const { error: removeError } = await supabase.from("conversation_members").delete().eq("conversation_id", selected.id).eq("user_id", userId);
    if (removeError) setError(removeError.message); else await loadGroupMembers();
    setGroupBusy(false);
  }

  async function deleteMessage(message: Message) {
    if (demoMode) {
      setMessages((current) => current.map((m) => m.id === message.id ? { ...m, body: "این پیام حذف شد", deleted_at: new Date().toISOString() } : m));
      return;
    }
    const { error: deleteError } = await supabase.from("messages").update({ body: "این پیام حذف شد", deleted_at: new Date().toISOString(), edited_at: null }).eq("id", message.id).eq("sender_id", session.user.id);
    if (deleteError) setError(deleteError.message);
    else setMessages((current) => current.map((m) => m.id === message.id ? { ...m, body: "این پیام حذف شد", deleted_at: new Date().toISOString() } : m));
  }

  function manageMessage(message: Message) {
    const mine = message.sender_id === session?.user?.id;
    const actions: any[] = [
      { text: "پاسخ", onPress: () => { setEditingMessageId(null); setReplyTo(message); } },
    ];
    if (mine && !message.deleted_at) {
      actions.push({ text: "ویرایش", onPress: () => { setReplyTo(null); setEditingMessageId(message.id); setDraft(message.body); } });
      actions.push({ text: "حذف پیام", style: "destructive", onPress: () => Alert.alert("حذف پیام", "این پیام برای همه اعضای گفتگو حذف شود؟", [{ text: "انصراف", style: "cancel" }, { text: "حذف", style: "destructive", onPress: () => { void deleteMessage(message); } }]) });
    }
    actions.push({ text: "بستن", style: "cancel" });
    Alert.alert("مدیریت پیام", message.deleted_at ? "این پیام حذف شده است." : message.body, actions);
  }


  function mediaMessageBody(path: string, name: string, mime: string, size: number) {
    return "BG_MEDIA:" + JSON.stringify({ path, name, mime, size });
  }

  function parseMediaMessage(body: string) {
    if (!body.startsWith("BG_MEDIA:")) return null;
    try {
      const value = JSON.parse(body.slice(9));
      if (!value || typeof value.path !== "string" || typeof value.name !== "string" ||
          typeof value.mime !== "string" || typeof value.size !== "number" ||
          !Number.isFinite(value.size) || value.size < 0) return null;
      const parts = value.path.split("/");
      if (parts.length !== 3 || !parts.every((part: string) => !!part && part !== "." && part !== "..")) return null;
      return value as { path: string; name: string; mime: string; size: number };
    } catch { return null; }
  }

  async function openMediaAttachment(body: string) {
    const attachment = parseMediaMessage(body);
    if (!attachment || !selected?.id || !session?.user?.id) {
      setError("اطلاعات پیوست معتبر نیست.");
      return;
    }
    const [conversationId, uploaderId] = attachment.path.split("/");
    if (conversationId !== selected.id) {
      setError("این فایل متعلق به گفتگوی دیگری است.");
      return;
    }
    if (!uploaderId) {
      setError("مسیر فایل معتبر نیست.");
      return;
    }
    try {
      const { data, error: urlError } = await supabase.storage
        .from("badgram-chat-media").createSignedUrl(attachment.path, 60 * 10);
      if (urlError || !data?.signedUrl) {
        setError(urlError?.message || "لینک فایل ساخته نشد.");
        return;
      }
      if (attachment.mime.startsWith("audio/")) {
        audioPlayer.replace(data.signedUrl);
        audioPlayer.play();
      } else if (attachment.mime.startsWith("video/")) {
        setVideoUrl(data.signedUrl);
        videoPlayer.replace(data.signedUrl);
        videoPlayer.play();
      } else {
        await Linking.openURL(data.signedUrl);
      }
    } catch (error: any) {
      setError(error?.message || "باز کردن فایل انجام نشد.");
    }
  }

  async function uploadChatAsset(asset: { uri: string; name: string; mimeType?: string | null; size?: number | null }) {
    if (!selected || demoMode || !session?.user?.id) {
      setError("ارسال فایل فقط در گفتگوی واقعی و پس از ورود امکان‌پذیر است.");
      return;
    }
    const mime = asset.mimeType || "application/octet-stream";
    const allowed = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|aac|ogg|webm|wav)|application\/pdf)$/.test(mime);
    if (!allowed) { setError("این نوع فایل پشتیبانی نمی‌شود."); return; }
    if (asset.size && asset.size > 50 * 1024 * 1024) { setError("حداکثر حجم فایل ۵۰ مگابایت است."); return; }
    setMediaBusy(true); setError("");
    try {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error("خواندن فایل انتخاب‌شده ناموفق بود.");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 50 * 1024 * 1024) throw new Error("حداکثر حجم فایل ۵۰ مگابایت است.");
      const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
      const path = selected.id + "/" + session.user.id + "/" + Date.now() + "-" + safeName;
      const { error: uploadError } = await supabase.storage.from("badgram-chat-media")
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (uploadError) throw uploadError;
      const body = mediaMessageBody(path, asset.name, mime, bytes.byteLength);
      const { data, error: messageError } = await supabase.from("messages").insert({
        conversation_id: selected.id, sender_id: session.user.id, body
      }).select("id,body,sender_id,created_at,reply_to_message_id").single();
      if (messageError) {
        await supabase.storage.from("badgram-chat-media").remove([path]);
        throw messageError;
      }
      if (data) setMessages(current => current.some(item => item.id === data.id) ? current : [...current, data as Message]);
      setChats(current => current.map(chat => chat.id === selected.id
        ? { ...chat, preview: "پیوست: " + asset.name, time: chatTime(data?.created_at) } : chat));
    } catch (uploadError: any) {
      setError(uploadError?.message || "ارسال فایل انجام نشد.");
    } finally { setMediaBusy(false); }
  }

  async function startVoiceRecording() {
    if (!selected || demoMode || !session?.user?.id || mediaBusy) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { setError("برای ضبط پیام صوتی باید اجازه میکروفون را فعال کنید."); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setError("");
    } catch (recordError: any) { setError(recordError?.message || "شروع ضبط صدا ناموفق بود."); }
  }

  async function stopAndSendVoice() {
    if (!recorderState.isRecording || !selected) return;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("فایل ضبط‌شده در دسترس نیست.");
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      await uploadChatAsset({ uri, name: "voice-" + Date.now() + ".m4a", mimeType: "audio/mp4" });
    } catch (recordError: any) { setError(recordError?.message || "ارسال پیام صوتی ناموفق بود."); }
  }

  async function pickChatMedia() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"], allowsMultipleSelection: false, quality: 0.85
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await uploadChatAsset({
      uri: asset.uri,
      name: asset.fileName || ("media-" + Date.now() + (asset.type === "video" ? ".mp4" : ".jpg")),
      mimeType: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg"),
      size: asset.fileSize
    });
  }

  async function pickChatDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/webp", "video/mp4", "audio/mpeg", "audio/mp4", "audio/ogg"],
      copyToCacheDirectory: true, multiple: false
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await uploadChatAsset({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size });
  }

  async function sendMessage() {
    const body = draft.trim();
    if (!body || !selected || busy) return;
    if (editingMessageId) {
      if (demoMode) {
        setMessages((current) => current.map((m) => m.id === editingMessageId ? { ...m, body, edited_at: new Date().toISOString() } : m));
        setEditingMessageId(null); setDraft(""); return;
      }
      setBusy(true);
      const { data, error: editError } = await supabase.from("messages").update({ body, edited_at: new Date().toISOString() }).eq("id", editingMessageId).eq("sender_id", session.user.id).select("id,body,edited_at").single();
      setBusy(false);
      if (editError) setError(editError.message);
      else if (data) {
        setMessages((current) => current.map((m) => m.id === data.id ? { ...m, body: data.body, edited_at: data.edited_at } : m));
        setEditingMessageId(null); setDraft("");
      }
      return;
    }
    if (demoMode) {
      const item: Message = { id: "demo-" + Date.now(), body, sender_id: "demo-user", created_at: new Date().toISOString(), reply_to_message_id: replyTo?.id ?? null };
      setMessages(current => [...current, item]);
      setChats(current => current.map(chat => chat.id === selected.id ? { ...chat, preview: body, time: chatTime(item.created_at) } : chat));
      setDraft("");
      setReplyTo(null);
      return;
    }
    if (!session?.user?.id) return;
    setBusy(true);
    setError("");
    const { data, error: sendError } = await supabase.from("messages").insert({
      conversation_id: selected.id,
      sender_id: session.user.id,
      body,
      reply_to_message_id: replyTo?.id ?? null
    }).select("id,body,sender_id,created_at,reply_to_message_id").single();
    setBusy(false);
    if (sendError) setError(sendError.message);
    else if (data) {
      setMessages((current) => current.some((item) => item.id === data.id)
        ? current : [...current, data as Message]);
      setDraft("");
      setReplyTo(null);
      setChats((current) => current.map((chat) => chat.id === selected.id
        ? { ...chat, preview: body, time: chatTime(data.created_at) }
        : chat));
    }
  }

  async function createConversation() {
    if (!session?.user?.id && !demoMode) return;
    const title = newTitle.trim();
    const phones = [...new Set(memberPhones.split(/[\n,،;；]/).map(normalizePhone).filter(Boolean))];
    if (!title) {
      setError("برای گفتگو یا گروه یک نام وارد کنید.");
      return;
    }
    if (newChatType === "private" && phones.length !== 1) {
      setError("برای گفتگوی خصوصی دقیقاً یک شماره عضو وارد کنید.");
      return;
    }
    if (newChatType === "group" && phones.length < 1) {
      setError("برای ساخت گروه، حداقل شماره یک عضو را وارد کنید.");
      return;
    }
    if (phones.some((item) => !/^\+[1-9]\d{7,14}$/.test(item))) {
      setError("شماره اعضا باید با کد کشور و علامت + وارد شود.");
      return;
    }
    setCreating(true);
    setError("");
    if (demoMode) {
      const chat: Chat = { id: "demo-chat-" + Date.now(), title, is_group: newChatType === "group", preview: "گفتگوی آزمایشی ساخته شد", time: chatTime(new Date().toISOString()) };
      setChats(current => [chat, ...current]);
      setModalOpen(false); setNewTitle(""); setMemberPhones(""); setNewChatType("private"); setSelected(chat);
      setMessages([{ id: "demo-welcome-" + Date.now(), body: "گفتگو در حالت آزمایشی ساخته شد.", sender_id: "demo-user", created_at: new Date().toISOString() }]);
      setCreating(false);
      return;
    }
    const memberIds = [session.user.id];
    for (const memberPhone of phones) {
      const { data, error: lookupError } = await supabase.rpc("find_profile_by_phone", {
        p_phone: memberPhone
      });
      if (lookupError) {
        setError(lookupError.message);
        setCreating(false);
        return;
      }
      const found = (data ?? [])[0];
      if (!found?.user_id) {
        setError("این شماره هنوز در بادگرام ثبت‌نام نکرده است: " + memberPhone);
        setCreating(false);
        return;
      }
      memberIds.push(found.user_id);
    }
    const { data: created, error: createError } = await supabase.from("conversations")
      .insert({ title, is_group: newChatType === "group", created_by: session.user.id })
      .select("id,title,is_group,created_at").single();
    if (createError || !created) {
      setError(createError?.message || "ساخت گفتگو انجام نشد.");
      setCreating(false);
      return;
    }
    const uniqueMembers = [...new Set(memberIds)];
    const { error: membersError } = await supabase.from("conversation_members").insert(
      uniqueMembers.map((user_id) => ({ conversation_id: created.id, user_id }))
    );
    setCreating(false);
    if (membersError) {
      setError("گفتگو ساخته شد اما افزودن اعضا کامل نشد: " + membersError.message);
      return;
    }
    const chat: Chat = {
      id: created.id,
      title: created.title || title,
      is_group: created.is_group,
      preview: "گفتگو ایجاد شد",
      time: chatTime(created.created_at)
    };
    setModalOpen(false);
    setNewTitle("");
    setMemberPhones("");
    setNewChatType("private");
    await loadConversations();
    openChat(chat);
  }

  if (authLoading) {
    return <SafeAreaView style={s.screen}><StatusBar style="light" /><View style={s.center}>
      <ActivityIndicator size="large" color="#75D9F8" /><Text style={s.muted}>در حال بررسی نشست کاربری...</Text>
    </View></SafeAreaView>;
  }

  if (!demoMode && (!isSupabaseConfigured || !session)) return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="light" />
      <View style={s.login}>
        <View style={s.logo}><Text style={s.logoLetter}>B</Text></View>
        <Text style={s.brand}>BADGRAM</Text>
        <Text style={s.tagline}>ارتباط ساده، سریع و امن</Text>
        <View style={s.glass}>
          <Text style={s.heading}>{!isSupabaseConfigured ? "راه‌اندازی اتصال" : otpSent ? "تأیید شماره موبایل" : "ورود به بادگرام"}</Text>
          <Text style={s.muted}>{!isSupabaseConfigured ? "اطلاعات پروژه Supabase هنوز تنظیم نشده است." : otpSent ? "کد پیامک‌شده را وارد کنید." : "شماره موبایل را با کد کشور وارد کنید."}</Text>
          {isSupabaseConfigured && (!otpSent
            ? <TextInput value={phone} onChangeText={setPhone} placeholder="+989123456789" placeholderTextColor="#8293A9" keyboardType="phone-pad" style={s.input} textAlign="left" />
            : <TextInput value={otp} onChangeText={setOtp} placeholder="کد تأیید" placeholderTextColor="#8293A9" keyboardType="number-pad" style={s.input} textAlign="center" />)}
          {!!error && <Text style={s.error}>{error}</Text>}
          {isSupabaseConfigured ? <Pressable style={s.primary} onPress={otpSent ? verifyCode : sendCode} disabled={busy}>
            {busy ? <ActivityIndicator color="#06111F" /> : <Text style={s.primaryText}>{otpSent ? "تأیید و ورود" : "دریافت کد ورود"}</Text>}
          </Pressable> : <Text style={s.note}>فایل .env را از روی .env.example بسازید و آدرس پروژه و کلید Publishable را وارد کنید. سپس برنامه را دوباره اجرا کنید.</Text>}
          <Pressable onPress={() => { setDemoMode(true); setSession({ user: { id: "demo-user", phone: "حساب آزمایشی" } }); setChats([{ id: "demo-chat-1", title: "گفتگوی آزمایشی بادگرام", is_group: false, preview: "به بادگرام خوش آمدید؛ این یک پیام آزمایشی است.", time: chatTime(new Date().toISOString()) }]); }}><Text style={s.link}>ورود آزمایشی بدون پیامک</Text></Pressable>
          {otpSent && <Pressable onPress={() => { setOtpSent(false); setOtp(""); setError(""); }}><Text style={s.link}>تغییر شماره موبایل</Text></Pressable>}
          <Text style={s.note}>ورود پیامکی به فعال بودن Phone Auth و سرویس پیامک در Supabase نیاز دارد.</Text>
        </View>
      </View>
    </SafeAreaView>
  );

  if (selected) return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Pressable onPress={() => { setSelected(null); setError(""); }}><Text style={s.back}>بازگشت</Text></Pressable>
        <View style={{ flex: 1 }}><Text style={s.chatTitle}>{selected.title}</Text><Text style={s.online}>{selected.is_group ? "گروه" : "گفتگوی خصوصی"}</Text></View>
        {!demoMode && selected.is_group && <Pressable onPress={() => { setGroupManageOpen(true); void loadGroupMembers(); }}><Text style={s.back}>مدیریت گروه</Text></Pressable>}
      </View>
      {!!error && <Text style={s.errorBanner}>{error}</Text>}
      <Modal visible={!!videoUrl} transparent animationType="fade" onRequestClose={() => { setVideoUrl(null); videoPlayer.pause(); }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center", padding: 16 }}>
          <Pressable onPress={() => { setVideoUrl(null); videoPlayer.pause(); }} style={{ alignSelf: "flex-end", padding: 12 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 16 }}>بستن ×</Text>
          </Pressable>
          {!!videoUrl && <VideoView player={videoPlayer} style={{ width: "100%", height: 260 }} nativeControls contentFit="contain" />}
        </View>
      </Modal>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList style={s.messages} data={messages} keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={<Text style={s.empty}>هنوز پیامی در این گفتگو وجود ندارد.</Text>}
          renderItem={({ item }) => {
            const quoted = item.reply_to_message_id ? messages.find((m) => m.id === item.reply_to_message_id) : null;
            const mine = item.sender_id === session.user.id;
            return (
              <Pressable onLongPress={() => manageMessage(item)} delayLongPress={350} style={[s.bubble, mine ? s.mine : s.theirs]}>
                {!!quoted && <View style={s.replyQuote}><Text style={s.replyQuoteText} numberOfLines={2}>{quoted.deleted_at ? "پیام حذف شده" : quoted.body}</Text></View>}
                {parseMediaMessage(item.body) ? (
                  <Pressable onPress={() => openMediaAttachment(item.body)} style={s.attachmentCard}>
                    {parseMediaMessage(item.body)?.mime.startsWith("image/") && !!mediaPreviewUrls[item.id] &&
                      <Image source={{ uri: mediaPreviewUrls[item.id] }} style={{ width: 220, height: 160, borderRadius: 12, marginBottom: 8 }} resizeMode="cover" />}
                    <Text style={s.attachmentTitle}>▣ {parseMediaMessage(item.body)?.name}</Text>
                    <Text style={s.attachmentMeta}>{parseMediaMessage(item.body)?.mime} · {Math.max(1, Math.round((parseMediaMessage(item.body)?.size || 0) / 1024))} KB</Text>
                    <Text style={s.attachmentOpen}>برای دریافت فایل لمس کنید</Text>
                  </Pressable>
                ) : <Text style={s.messageText}>{item.body}</Text>}
                <Text style={s.messageTime}>{item.edited_at ? "ویرایش‌شده · " : ""}{chatTime(item.created_at)}{mine ? (readMessageIds.includes(item.id) ? "  ✓✓" : "  ✓") : ""}</Text>
              </Pressable>
            );
          }} />
        {(replyTo || editingMessageId) && <View style={s.composerContext}>
          <Text style={s.composerContextText}>{editingMessageId ? "در حال ویرایش پیام" : "پاسخ به: " + (replyTo?.deleted_at ? "پیام حذف‌شده" : replyTo?.body || "")}</Text>
          <Pressable onPress={() => { setReplyTo(null); setEditingMessageId(null); setDraft(""); }}><Text style={s.cancelContext}>لغو</Text></Pressable>
        </View>}
        <View style={s.composer}>
          {!editingMessageId && <Pressable onPress={pickChatMedia} disabled={mediaBusy || recorderState.isRecording} style={s.attachButton}><Text style={s.attachText}>▧</Text></Pressable>}
          {!editingMessageId && <Pressable onPress={pickChatDocument} disabled={mediaBusy || recorderState.isRecording} style={s.attachButton}><Text style={s.attachText}>＋</Text></Pressable>}
          {!editingMessageId && !demoMode && (recorderState.isRecording
            ? <Pressable onPress={stopAndSendVoice} style={s.attachButton}><Text style={s.attachText}>■</Text></Pressable>
            : <Pressable onPress={startVoiceRecording} disabled={mediaBusy} style={s.attachButton}><Text style={s.attachText}>🎙</Text></Pressable>)}
          <TextInput value={draft} onChangeText={setDraft} placeholder={recorderState.isRecording ? "در حال ضبط پیام صوتی..." : editingMessageId ? "متن اصلاح‌شده..." : "پیام بنویسید..."} placeholderTextColor="#8190A4" style={s.composerInput} multiline editable={!recorderState.isRecording} />
          <Pressable onPress={sendMessage} style={s.send} disabled={busy || mediaBusy || recorderState.isRecording || !draft.trim()}>
            {busy || mediaBusy ? <ActivityIndicator color="#06111F" /> : <Text style={s.sendText}>➤</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <Modal visible={groupManageOpen} transparent animationType="slide" onRequestClose={() => setGroupManageOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.heading}>مدیریت اعضای گروه</Text>
            <Text style={s.muted}>مالک می‌تواند مدیر تعیین کند؛ مدیران امکان افزودن و حذف اعضا دارند.</Text>
            <TextInput value={groupPhone} onChangeText={setGroupPhone} placeholder="شماره عضو جدید، مثل +98912..." placeholderTextColor="#8293A9" style={s.input} />
            <Pressable style={s.primary} onPress={addGroupMember} disabled={groupBusy}><Text style={s.primaryText}>افزودن عضو</Text></Pressable>
            <FlatList data={groupMembers} keyExtractor={(m) => m.user_id} style={{ maxHeight: 280 }} renderItem={({item}) => (
              <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(180,220,255,.1)" }}>
                <Text style={s.chatName}>{item.display_name || item.phone || (item.user_id.slice(0, 8) + "…")}  ·  {item.role === "owner" ? "مالک" : item.role === "admin" ? "مدیر" : "عضو"}</Text>
                {item.role !== "owner" && <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  {item.role === "member" && <Pressable onPress={() => changeGroupMemberRole(item.user_id, "admin")}><Text style={s.back}>ارتقا به مدیر</Text></Pressable>}
                  {item.role === "admin" && <Pressable onPress={() => changeGroupMemberRole(item.user_id, "member")}><Text style={s.back}>تنزل به عضو</Text></Pressable>}
                  <Pressable onPress={() => removeGroupMember(item.user_id)}><Text style={s.cancelContext}>حذف عضو</Text></Pressable>
                </View>}
              </View>
            )} />
            {!!error && <Text style={s.error}>{error}</Text>}
            <Pressable style={s.secondary} onPress={() => setGroupManageOpen(false)}><Text style={s.secondaryText}>بستن</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );

  const visibleChats = chats.filter((chat) => {
    const matchesTab = tab === "groups" ? chat.is_group : !chat.is_group;
    const query = searchQuery.trim().toLocaleLowerCase();
    const matchesSearch = !query || `${chat.title} ${chat.preview}`.toLocaleLowerCase().includes(query);
    return matchesTab && matchesSearch;
  });

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="light" />
      <View style={s.top}>
        <View><Text style={s.brandSmall}>BADGRAM</Text><Text style={s.subSmall}>پیام‌رسان شما</Text></View>
        <Pressable style={s.newButton} onPress={() => { setError(""); setModalOpen(true); }}><Text style={s.newButtonText}>＋ گفتگوی جدید</Text></Pressable>
      </View>
      {!!error && <Text style={s.errorBanner}>{error}</Text>}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{tab === "settings" ? "تنظیمات" : tab === "groups" ? "گروه‌ها" : "گفتگوهای خصوصی"}</Text>
        <Pressable onPress={loadConversations}><Text style={s.refresh}>بروزرسانی</Text></Pressable>
      </View>
      {tab === "settings" ? (
        <View style={[s.glass, { margin: 18, width: undefined }]}>
          <Text style={s.heading}>حساب کاربری</Text>
          <Text style={s.muted}>{session.user.phone || session.user.email || "کاربر بادگرام"}</Text>
          <Pressable style={s.secondary} onPress={() => { if (demoMode) { setDemoMode(false); setSession(null); setSelected(null); } else supabase.auth.signOut(); }}><Text style={s.secondaryText}>خروج از حساب</Text></Pressable>
        </View>
      ) : loadingChats ? (
        <View style={s.center}><ActivityIndicator color="#75D9F8" /><Text style={s.muted}>در حال دریافت گفتگوها...</Text></View>
      ) : (
        <>
        <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="جستجو در گفتگوها..." placeholderTextColor="#8293A9" style={s.searchInput} returnKeyType="search" />
        <FlatList data={visibleChats} keyExtractor={(c) => c.id} contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={s.empty}>{tab === "groups" ? "هنوز عضو گروهی نیستید." : "هنوز گفتگوی خصوصی ندارید. از «گفتگوی جدید» استفاده کنید."}</Text>}
          renderItem={({ item }) => (
            <Pressable style={s.chatRow} onPress={() => openChat(item)}>
              <View style={s.chatAvatar}><Text style={s.chatAvatarText}>{item.title.slice(0, 1)}</Text></View>
              <View style={{ flex: 1 }}><Text style={s.chatName}>{item.title}</Text><Text style={s.preview} numberOfLines={1}>{item.preview}</Text></View>
              <View style={s.meta}><Text style={s.time}>{item.time}</Text></View>
            </Pressable>
          )} />
        </>
      )}
      <View style={s.nav}>
        <Pressable style={s.navItem} onPress={() => setTab("chats")}><Text style={s.navIcon}>▤</Text><Text style={s.navLabel}>پیام‌ها</Text></Pressable>
        <Pressable style={s.navItem} onPress={() => setTab("groups")}><Text style={s.navIcon}>◎</Text><Text style={s.navLabel}>گروه‌ها</Text></Pressable>
        <Pressable style={s.navItem} onPress={() => setTab("settings")}><Text style={s.navIcon}>⚙</Text><Text style={s.navLabel}>تنظیمات</Text></Pressable>
      </View>
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.heading}>گفتگوی جدید یا گروه</Text>
            <Text style={s.muted}>نوع گفتگو را انتخاب کنید، سپس نام و شماره اعضا را وارد کنید.</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => setNewChatType("private")} style={[s.secondary, { flex: 1, marginTop: 0, backgroundColor: newChatType === "private" ? "rgba(117,217,248,.16)" : "transparent" }]}><Text style={s.secondaryText}>گفتگوی خصوصی</Text></Pressable>
              <Pressable onPress={() => setNewChatType("group")} style={[s.secondary, { flex: 1, marginTop: 0, backgroundColor: newChatType === "group" ? "rgba(117,217,248,.16)" : "transparent" }]}><Text style={s.secondaryText}>گروه</Text></Pressable>
            </View>
            <TextInput value={newTitle} onChangeText={setNewTitle} placeholder="نام گفتگو" placeholderTextColor="#8293A9" style={s.input} />
            <TextInput value={memberPhones} onChangeText={setMemberPhones} placeholder={newChatType === "private" ? "+98912..." : "+98912... ، +98913..."} placeholderTextColor="#8293A9" style={[s.input, { minHeight: 78 }]} multiline textAlignVertical="top" />
            {!!error && <Text style={s.error}>{error}</Text>}
            <Pressable style={s.primary} onPress={createConversation} disabled={creating}>
              {creating ? <ActivityIndicator color="#06111F" /> : <Text style={s.primaryText}>{newChatType === "group" ? "ایجاد گروه" : "ایجاد گفتگوی خصوصی"}</Text>}
            </Pressable>
            <Pressable style={s.secondary} onPress={() => setModalOpen(false)}><Text style={s.secondaryText}>انصراف</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07111F" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  login: { flex: 1, justifyContent: "center", padding: 24, alignItems: "center" },
  logo: { width: 76, height: 76, borderRadius: 25, backgroundColor: "rgba(72,190,255,.16)", borderWidth: 1, borderColor: "rgba(120,220,255,.55)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoLetter: { color: "#8DE1FF", fontSize: 30, fontWeight: "900" },
  brand: { color: "#EAF7FF", fontSize: 27, fontWeight: "900", letterSpacing: 4 },
  tagline: { color: "#8EA5BB", marginTop: 8, marginBottom: 34 },
  glass: { width: "100%", maxWidth: 440, padding: 22, borderRadius: 25, backgroundColor: "rgba(255,255,255,.07)", borderWidth: 1, borderColor: "rgba(176,220,255,.20)" },
  heading: { color: "#F1F8FF", fontSize: 20, fontWeight: "800", textAlign: "right" },
  muted: { color: "#8FA3B8", fontSize: 12, textAlign: "right", marginTop: 8 },
  input: { minHeight: 52, borderRadius: 14, backgroundColor: "rgba(4,14,27,.7)", borderWidth: 1, borderColor: "rgba(137,194,235,.22)", color: "white", paddingHorizontal: 15, paddingVertical: 12, marginTop: 16, textAlign: "right" },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: "#75D9F8", alignItems: "center", justifyContent: "center", marginTop: 16, padding: 12 },
  primaryText: { color: "#06111F", fontWeight: "900", fontSize: 15 },
  note: { color: "#71879D", fontSize: 10, textAlign: "center", marginTop: 18, lineHeight: 17 },
  error: { color: "#FF8F9B", textAlign: "right", marginTop: 10, fontSize: 12 },
  errorBanner: { color: "#FF9BA5", textAlign: "right", marginHorizontal: 18, marginBottom: 8, fontSize: 11 },
  link: { color: "#8DE1FF", textAlign: "center", marginTop: 14 },
  top: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandSmall: { color: "#EAF7FF", fontSize: 21, fontWeight: "900", letterSpacing: 3 },
  subSmall: { color: "#8297AD", fontSize: 11, marginTop: 3 },
  newButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13, backgroundColor: "rgba(117,217,248,.14)", borderWidth: 1, borderColor: "rgba(117,217,248,.3)" },
  newButtonText: { color: "#9BE6FF", fontSize: 12, fontWeight: "800" },
  section: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 21, paddingTop: 18, paddingBottom: 12 },
  sectionTitle: { color: "#F0F7FF", fontSize: 18, fontWeight: "800" },
  refresh: { color: "#8DE1FF", fontSize: 11 },
  searchInput: { marginHorizontal: 18, marginBottom: 8, minHeight: 46, borderRadius: 14, backgroundColor: "rgba(255,255,255,.06)", borderWidth: 1, borderColor: "rgba(137,194,235,.18)", color: "white", paddingHorizontal: 15, textAlign: "right" },
  chatRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "rgba(180,220,255,.07)" },
  chatAvatar: { width: 52, height: 52, borderRadius: 19, backgroundColor: "rgba(88,185,235,.14)", borderWidth: 1, borderColor: "rgba(120,210,255,.23)", alignItems: "center", justifyContent: "center", marginRight: 13 },
  chatAvatarText: { color: "#9BE6FF", fontSize: 21, fontWeight: "800" },
  chatName: { color: "#EDF7FF", textAlign: "right", fontWeight: "700", fontSize: 14 },
  preview: { color: "#8499AE", textAlign: "right", fontSize: 12, marginTop: 6 },
  meta: { alignItems: "flex-end", gap: 8 },
  time: { color: "#758BA1", fontSize: 10 },
  nav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 76, backgroundColor: "rgba(12,28,46,.96)", borderTopWidth: 1, borderTopColor: "rgba(150,210,255,.12)", flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  navItem: { alignItems: "center", gap: 4, minWidth: 70 },
  navIcon: { color: "#85E2FF", fontSize: 22 },
  navLabel: { color: "#8FA3B8", fontSize: 10 },
  header: { padding: 17, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: "rgba(180,220,255,.1)" },
  back: { color: "#8DE1FF", fontWeight: "700" },
  chatTitle: { color: "#F0F8FF", textAlign: "right", fontWeight: "800", fontSize: 16 },
  online: { color: "#75D9A5", textAlign: "right", fontSize: 10, marginTop: 3 },
  messages: { flex: 1, padding: 14 },
  replyQuote: { borderRightWidth: 2, borderRightColor: "#75D9F8", paddingRight: 8, marginBottom: 8, backgroundColor: "rgba(0,0,0,.12)", paddingVertical: 5 },
  replyQuoteText: { color: "#9BE6FF", fontSize: 11, textAlign: "right" },
  composerContext: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  composerContextText: { color: "#9BE6FF", fontSize: 11, flex: 1, textAlign: "right" },
  cancelContext: { color: "#FF9BA5", paddingHorizontal: 8 },
  empty: { color: "#8297AD", textAlign: "center", padding: 28, lineHeight: 24 },
  bubble: { maxWidth: "82%", borderRadius: 17, padding: 12, marginVertical: 6 },
  mine: { alignSelf: "flex-end", backgroundColor: "rgba(82,183,225,.22)", borderWidth: 1, borderColor: "rgba(120,220,255,.22)" },
  theirs: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,.08)", borderWidth: 1, borderColor: "rgba(255,255,255,.08)" },
  messageText: { color: "#EFF8FF", textAlign: "right", fontSize: 14 },
  messageTime: { color: "#8EA5BA", fontSize: 9, marginTop: 6, textAlign: "left" },
  attachButton: { width: 38, height: 42, borderRadius: 12, backgroundColor: "rgba(117,217,248,.12)", alignItems: "center", justifyContent: "center" },
  attachText: { color: "#9BE6FF", fontSize: 22, fontWeight: "800" },
  attachmentCard: { minWidth: 180, padding: 10, borderRadius: 12, backgroundColor: "rgba(4,14,27,.45)" },
  attachmentTitle: { color: "#EAF7FF", textAlign: "right", fontWeight: "700" },
  attachmentMeta: { color: "#91A8BE", textAlign: "right", fontSize: 10, marginTop: 5 },
  attachmentOpen: { color: "#8DE1FF", textAlign: "right", fontSize: 11, marginTop: 8 },
  composer: { flexDirection: "row", padding: 12, gap: 7, alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(180,220,255,.1)" },
  composerInput: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 15, backgroundColor: "rgba(255,255,255,.07)", color: "white", paddingHorizontal: 14, paddingVertical: 10, textAlign: "right" },
  send: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#75D9F8", alignItems: "center", justifyContent: "center" },
  sendText: { color: "#06111F", fontSize: 20, fontWeight: "900" },
  secondary: { marginTop: 12, borderRadius: 13, padding: 14, borderWidth: 1, borderColor: "rgba(130,210,255,.3)" },
  secondaryText: { color: "#9BE6FF", textAlign: "center", fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.72)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#102238", borderRadius: 24, borderWidth: 1, borderColor: "rgba(150,210,255,.2)", padding: 20 }
});