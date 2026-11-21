import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform,
  Pressable, SafeAreaView, StyleSheet, Text, TextInput, View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { supabase } from "./src/supabase";

type Chat = { id: string; title: string; preview: string; time: string; unread?: number };
type Message = { id: string; body: string; sender_id: string; created_at: string };

const demoChats: Chat[] = [
  { id: "demo-1", title: "گفت‌وگوی عمومی", preview: "به بادگرام خوش آمدید", time: "۱۲:۳۰", unread: 2 },
  { id: "demo-2", title: "تیم بادگرام", preview: "نسخه جدید در راه است", time: "دیروز" },
  { id: "demo-3", title: "گفت‌وگوی خصوصی", preview: "سلام، خوبی؟", time: "شنبه" }
];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("chats");
  const [selected, setSelected] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function sendCode() {
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (error) setError(error.message);
    else setOtpSent(true);
  }

  async function verifyCode() {
    setBusy(true); setError("");
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
    setBusy(false);
    if (error) setError(error.message);
    else setSession(data.session);
  }

  async function openChat(chat: Chat) {
    setSelected(chat);
    if (chat.id.startsWith("demo-")) {
      setMessages([{ id: "welcome", body: "به فضای گفت‌وگوی Badgram خوش آمدید.", sender_id: "system", created_at: new Date().toISOString() }]);
      return;
    }
    const { data, error } = await supabase.from("messages").select("*")
      .eq("conversation_id", chat.id).order("created_at", { ascending: true }).limit(100);
    if (!error && data) setMessages(data as Message[]);
  }

  async function sendMessage() {
    if (!draft.trim() || !selected || !session?.user?.id) return;
    if (selected.id.startsWith("demo-")) {
      setMessages(old => [...old, { id: String(Date.now()), body: draft.trim(), sender_id: session.user.id, created_at: new Date().toISOString() }]);
      setDraft("");
      return;
    }
    const body = draft.trim();
    const { data, error } = await supabase.from("messages").insert({
      conversation_id: selected.id, sender_id: session.user.id, body
    }).select().single();
    if (error) setError(error.message);
    else if (data) { setMessages(old => [...old, data as Message]); setDraft(""); }
  }

  if (!session) return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="light" />
      <View style={s.login}>
        <View style={s.logo}><Text style={s.logoLetter}>B</Text></View>
        <Text style={s.brand}>BADGRAM</Text>
        <Text style={s.tagline}>ارتباط ساده، سریع و امن</Text>
        <View style={s.glass}>
          <Text style={s.heading}>{otpSent ? "تأیید شماره موبایل" : "ورود به بادگرام"}</Text>
          <Text style={s.muted}>{otpSent ? "کد ارسال‌شده را وارد کنید" : "شماره موبایل خود را وارد کنید"}</Text>
          {!otpSent
            ? <TextInput value={phone} onChangeText={setPhone} placeholder="+98912..." placeholderTextColor="#8293A9" keyboardType="phone-pad" style={s.input} textAlign="left" />
            : <TextInput value={otp} onChangeText={setOtp} placeholder="کد تأیید" placeholderTextColor="#8293A9" keyboardType="number-pad" style={s.input} textAlign="center" />}
          {!!error && <Text style={s.error}>{error}</Text>}
          <Pressable style={s.primary} onPress={otpSent ? verifyCode : sendCode} disabled={busy}>
            {busy ? <ActivityIndicator color="#06111F" /> : <Text style={s.primaryText}>{otpSent ? "تأیید و ورود" : "دریافت کد ورود"}</Text>}
          </Pressable>
          <Text style={s.note}>ورود واقعی پس از تنظیم سرویس پیامکی Supabase فعال می‌شود.</Text>
        </View>
      </View>
    </SafeAreaView>
  );

  if (selected) return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Pressable onPress={() => setSelected(null)}><Text style={s.back}>بازگشت</Text></Pressable>
        <View style={{ flex: 1 }}><Text style={s.chatTitle}>{selected.title}</Text><Text style={s.online}>گفت‌وگو</Text></View>
        <Text style={s.muted}>•••</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList style={s.messages} data={messages} keyExtractor={m => m.id} renderItem={({ item }) => (
          <View style={[s.bubble, item.sender_id === session.user.id ? s.mine : s.theirs]}>
            <Text style={s.messageText}>{item.body}</Text>
            <Text style={s.messageTime}>{new Date(item.created_at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
        )} />
        <View style={s.composer}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="پیام بنویسید..." placeholderTextColor="#8190A4" style={s.composerInput} />
          <Pressable onPress={sendMessage} style={s.send}><Text style={s.sendText}>➤</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="light" />
      <View style={s.top}>
        <View><Text style={s.brandSmall}>BADGRAM</Text><Text style={s.subSmall}>پیام‌رسان شما</Text></View>
        <View style={s.avatar}><Text style={s.logoLetter}>B</Text></View>
      </View>
      <View style={s.search}><Text style={s.searchIcon}>⌕</Text><TextInput placeholder="جست‌وجوی گفتگوها" placeholderTextColor="#8190A4" style={s.searchInput} /></View>
      <View style={s.section}><Text style={s.sectionTitle}>{tab === "settings" ? "تنظیمات" : tab === "groups" ? "گروه‌ها" : "گفت‌وگوها"}</Text><Text style={s.muted}>همه پیام‌ها</Text></View>
      {tab === "settings" ? (
        <View style={[s.glass, { margin: 18, width: undefined }]}>
          <Text style={s.heading}>حساب کاربری</Text><Text style={s.muted}>{session.user.phone || session.user.email}</Text>
          <Pressable style={s.secondary} onPress={() => supabase.auth.signOut()}><Text style={s.secondaryText}>خروج از حساب</Text></Pressable>
        </View>
      ) : (
        <FlatList data={demoChats} keyExtractor={c => c.id} contentContainerStyle={{ paddingBottom: 100 }} renderItem={({ item }) => (
          <Pressable style={s.chatRow} onPress={() => openChat(item)}>
            <View style={s.chatAvatar}><Text style={s.chatAvatarText}>{item.title.slice(0, 1)}</Text></View>
            <View style={{ flex: 1 }}><Text style={s.chatName}>{item.title}</Text><Text style={s.preview}>{item.preview}</Text></View>
            <View style={s.meta}><Text style={s.time}>{item.time}</Text>{!!item.unread && <Text style={s.unread}>{item.unread}</Text>}</View>
          </Pressable>
        )} />
      )}
      <View style={s.nav}>
        <Pressable style={s.navItem} onPress={() => setTab("chats")}><Text style={s.navIcon}>▤</Text><Text style={s.navLabel}>پیام‌ها</Text></Pressable>
        <Pressable style={s.navItem} onPress={() => setTab("groups")}><Text style={s.navIcon}>◎</Text><Text style={s.navLabel}>گروه‌ها</Text></Pressable>
        <Pressable style={s.navItem} onPress={() => setTab("settings")}><Text style={s.navIcon}>⚙</Text><Text style={s.navLabel}>تنظیمات</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07111F" },
  login: { flex: 1, justifyContent: "center", padding: 24, alignItems: "center" },
  logo: { width: 76, height: 76, borderRadius: 25, backgroundColor: "rgba(72,190,255,.16)", borderWidth: 1, borderColor: "rgba(120,220,255,.55)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoLetter: { color: "#8DE1FF", fontSize: 30, fontWeight: "900" },
  brand: { color: "#EAF7FF", fontSize: 27, fontWeight: "900", letterSpacing: 4 },
  tagline: { color: "#8EA5BB", marginTop: 8, marginBottom: 34 },
  glass: { width: "100%", maxWidth: 440, padding: 22, borderRadius: 25, backgroundColor: "rgba(255,255,255,.07)", borderWidth: 1, borderColor: "rgba(176,220,255,.20)" },
  heading: { color: "#F1F8FF", fontSize: 20, fontWeight: "800", textAlign: "right" },
  muted: { color: "#8FA3B8", fontSize: 12, textAlign: "right", marginTop: 8 },
  input: { height: 52, borderRadius: 14, backgroundColor: "rgba(4,14,27,.7)", borderWidth: 1, borderColor: "rgba(137,194,235,.22)", color: "white", paddingHorizontal: 15, marginTop: 22 },
  primary: { height: 52, borderRadius: 14, backgroundColor: "#75D9F8", alignItems: "center", justifyContent: "center", marginTop: 16 },
  primaryText: { color: "#06111F", fontWeight: "900", fontSize: 15 },
  note: { color: "#71879D", fontSize: 10, textAlign: "center", marginTop: 18, lineHeight: 17 },
  error: { color: "#FF8F9B", textAlign: "right", marginTop: 10, fontSize: 12 },
  top: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandSmall: { color: "#EAF7FF", fontSize: 21, fontWeight: "900", letterSpacing: 3 },
  subSmall: { color: "#8297AD", fontSize: 11, marginTop: 3 },
  avatar: { width: 43, height: 43, borderRadius: 16, backgroundColor: "rgba(100,205,255,.16)", borderColor: "rgba(130,220,255,.4)", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  search: { marginHorizontal: 18, borderRadius: 15, backgroundColor: "rgba(255,255,255,.06)", borderWidth: 1, borderColor: "rgba(170,215,255,.12)", height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 13 },
  searchIcon: { color: "#8DE1FF", fontSize: 24, marginRight: 8 },
  searchInput: { flex: 1, color: "white", textAlign: "right" },
  section: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 21, paddingTop: 25, paddingBottom: 12 },
  sectionTitle: { color: "#F0F7FF", fontSize: 18, fontWeight: "800" },
  chatRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "rgba(180,220,255,.07)" },
  chatAvatar: { width: 52, height: 52, borderRadius: 19, backgroundColor: "rgba(88,185,235,.14)", borderWidth: 1, borderColor: "rgba(120,210,255,.23)", alignItems: "center", justifyContent: "center", marginRight: 13 },
  chatAvatarText: { color: "#9BE6FF", fontSize: 21, fontWeight: "800" },
  chatName: { color: "#EDF7FF", textAlign: "right", fontWeight: "700", fontSize: 14 },
  preview: { color: "#8499AE", textAlign: "right", fontSize: 12, marginTop: 6 },
  meta: { alignItems: "flex-end", gap: 8 },
  time: { color: "#758BA1", fontSize: 10 },
  unread: { color: "#06111F", backgroundColor: "#79DDF8", overflow: "hidden", borderRadius: 10, minWidth: 19, textAlign: "center", fontSize: 10, padding: 3, fontWeight: "800" },
  nav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 76, backgroundColor: "rgba(12,28,46,.96)", borderTopWidth: 1, borderTopColor: "rgba(150,210,255,.12)", flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  navItem: { alignItems: "center", gap: 4, minWidth: 70 },
  navIcon: { color: "#85E2FF", fontSize: 22 },
  navLabel: { color: "#8FA3B8", fontSize: 10 },
  header: { padding: 17, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: "rgba(180,220,255,.1)" },
  back: { color: "#8DE1FF", fontWeight: "700" },
  chatTitle: { color: "#F0F8FF", textAlign: "right", fontWeight: "800", fontSize: 16 },
  online: { color: "#75D9A5", textAlign: "right", fontSize: 10, marginTop: 3 },
  messages: { flex: 1, padding: 14 },
  bubble: { maxWidth: "82%", borderRadius: 17, padding: 12, marginVertical: 6 },
  mine: { alignSelf: "flex-end", backgroundColor: "rgba(82,183,225,.22)", borderWidth: 1, borderColor: "rgba(120,220,255,.22)" },
  theirs: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,.08)", borderWidth: 1, borderColor: "rgba(255,255,255,.08)" },
  messageText: { color: "#EFF8FF", textAlign: "right", fontSize: 14 },
  messageTime: { color: "#8EA5BA", fontSize: 9, marginTop: 6, textAlign: "left" },
  composer: { flexDirection: "row", padding: 12, gap: 9, alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(180,220,255,.1)" },
  composerInput: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: "rgba(255,255,255,.07)", color: "white", paddingHorizontal: 14, textAlign: "right" },
  send: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#75D9F8", alignItems: "center", justifyContent: "center" },
  sendText: { color: "#06111F", fontSize: 20, fontWeight: "900" },
  secondary: { marginTop: 22, borderRadius: 13, padding: 14, borderWidth: 1, borderColor: "rgba(130,210,255,.3)" },
  secondaryText: { color: "#9BE6FF", textAlign: "center", fontWeight: "700" }
});
