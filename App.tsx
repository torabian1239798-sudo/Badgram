import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View
} from "react-native";
import { StatusBar } from "expo-status-bar";
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
  const [creating, setCreating] = useState(false);

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
    setError("");
    setMessages(demoMode ? [{ id: "demo-message-1", body: "به بادگرام خوش آمدید؛ محیط آزمایشی فعال است.", sender_id: "demo-user", created_at: new Date().toISOString() }] : []);
    setSelected(chat);
    if (demoMode) return;
    const { data, error: messageError } = await supabase.from("messages")
      .select("id,body,sender_id,created_at")
      .eq("conversation_id", chat.id)
      .order("created_at", { ascending: true })
      .limit(100);
    if (messageError) setError(messageError.message);
    else setMessages((data ?? []) as Message[]);
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected?.id, demoMode]);

  async function sendMessage() {
    const body = draft.trim();
    if (!body || !selected || busy) return;
    if (demoMode) {
      const item: Message = { id: "demo-" + Date.now(), body, sender_id: "demo-user", created_at: new Date().toISOString() };
      setMessages(current => [...current, item]);
      setChats(current => current.map(chat => chat.id === selected.id ? { ...chat, preview: body, time: chatTime(item.created_at) } : chat));
      setDraft("");
      return;
    }
    if (!session?.user?.id) return;
    setBusy(true);
    setError("");
    const { data, error: sendError } = await supabase.from("messages").insert({
      conversation_id: selected.id,
      sender_id: session.user.id,
      body
    }).select("id,body,sender_id,created_at").single();
    setBusy(false);
    if (sendError) setError(sendError.message);
    else if (data) {
      setMessages((current) => current.some((item) => item.id === data.id)
        ? current : [...current, data as Message]);
      setDraft("");
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
    if (phones.some((item) => !/^\+[1-9]\d{7,14}$/.test(item))) {
      setError("شماره اعضا باید با کد کشور و علامت + وارد شود.");
      return;
    }
    setCreating(true);
    setError("");
    if (demoMode) {
      const chat: Chat = { id: "demo-chat-" + Date.now(), title, is_group: phones.length > 1, preview: "گفتگوی آزمایشی ساخته شد", time: chatTime(new Date().toISOString()) };
      setChats(current => [chat, ...current]);
      setModalOpen(false); setNewTitle(""); setMemberPhones(""); setSelected(chat);
      setMessages([{ id: "demo-welcome-" + Date.now(), body: "گفتگو در حالت آزمایشی ساخته شد.", sender_id: "demo-user", created_at: new Date().toISOString() }]);
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
    const isGroup = memberIds.length > 2;
    const { data: created, error: createError } = await supabase.from("conversations")
      .insert({ title, is_group: isGroup, created_by: session.user.id })
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
          {otpSent && <Pressable onPress={() => { setOtpSent(false); setOtp(""); setError(""); }}><Text style={s.link}>تغییر شماره موبایل</Text></Pressable>}}
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
        <Text style={s.muted}>•••</Text>
      </View>
      {!!error && <Text style={s.errorBanner}>{error}</Text>}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList style={s.messages} data={messages} keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={<Text style={s.empty}>هنوز پیامی در این گفتگو وجود ندارد.</Text>}
          renderItem={({ item }) => (
            <View style={[s.bubble, item.sender_id === session.user.id ? s.mine : s.theirs]}>
              <Text style={s.messageText}>{item.body}</Text>
              <Text style={s.messageTime}>{chatTime(item.created_at)}</Text>
            </View>
          )} />
        <View style={s.composer}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="پیام بنویسید..." placeholderTextColor="#8190A4" style={s.composerInput} multiline />
          <Pressable onPress={sendMessage} style={s.send} disabled={busy || !draft.trim()}>
            {busy ? <ActivityIndicator color="#06111F" /> : <Text style={s.sendText}>➤</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  const visibleChats = chats.filter((chat) => tab === "groups" ? chat.is_group : !chat.is_group);

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
        <FlatList data={visibleChats} keyExtractor={(c) => c.id} contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={s.empty}>{tab === "groups" ? "هنوز عضو گروهی نیستید." : "هنوز گفتگوی خصوصی ندارید. از «گفتگوی جدید» استفاده کنید."}</Text>}
          renderItem={({ item }) => (
            <Pressable style={s.chatRow} onPress={() => openChat(item)}>
              <View style={s.chatAvatar}><Text style={s.chatAvatarText}>{item.title.slice(0, 1)}</Text></View>
              <View style={{ flex: 1 }}><Text style={s.chatName}>{item.title}</Text><Text style={s.preview} numberOfLines={1}>{item.preview}</Text></View>
              <View style={s.meta}><Text style={s.time}>{item.time}</Text></View>
            </Pressable>
          )} />
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
            <Text style={s.muted}>نام گفتگو را بنویسید و شماره اعضا را با کد کشور وارد کنید. برای گفتگوی خصوصی فقط یک شماره وارد کنید.</Text>
            <TextInput value={newTitle} onChangeText={setNewTitle} placeholder="نام گفتگو" placeholderTextColor="#8293A9" style={s.input} />
            <TextInput value={memberPhones} onChangeText={setMemberPhones} placeholder="+98912... ، +98913..." placeholderTextColor="#8293A9" style={[s.input, { minHeight: 78 }]} multiline textAlignVertical="top" />
            {!!error && <Text style={s.error}>{error}</Text>}
            <Pressable style={s.primary} onPress={createConversation} disabled={creating}>
              {creating ? <ActivityIndicator color="#06111F" /> : <Text style={s.primaryText}>ایجاد گفتگو</Text>}
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
  empty: { color: "#8297AD", textAlign: "center", padding: 28, lineHeight: 24 },
  bubble: { maxWidth: "82%", borderRadius: 17, padding: 12, marginVertical: 6 },
  mine: { alignSelf: "flex-end", backgroundColor: "rgba(82,183,225,.22)", borderWidth: 1, borderColor: "rgba(120,220,255,.22)" },
  theirs: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,.08)", borderWidth: 1, borderColor: "rgba(255,255,255,.08)" },
  messageText: { color: "#EFF8FF", textAlign: "right", fontSize: 14 },
  messageTime: { color: "#8EA5BA", fontSize: 9, marginTop: 6, textAlign: "left" },
  composer: { flexDirection: "row", padding: 12, gap: 9, alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(180,220,255,.1)" },
  composerInput: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 15, backgroundColor: "rgba(255,255,255,.07)", color: "white", paddingHorizontal: 14, paddingVertical: 10, textAlign: "right" },
  send: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#75D9F8", alignItems: "center", justifyContent: "center" },
  sendText: { color: "#06111F", fontSize: 20, fontWeight: "900" },
  secondary: { marginTop: 12, borderRadius: 13, padding: 14, borderWidth: 1, borderColor: "rgba(130,210,255,.3)" },
  secondaryText: { color: "#9BE6FF", textAlign: "center", fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.72)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#102238", borderRadius: 24, borderWidth: 1, borderColor: "rgba(150,210,255,.2)", padding: 20 }
});
