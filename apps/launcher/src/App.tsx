import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Download, FolderOpen, LogIn, LogOut, Minus, Play, RefreshCw, Settings, ShieldCheck, UserRound, X } from "lucide-react";
import { apiUrl, authenticate, createGameTicket, loadNews, loadProfiles, logout, restoreSession, updateSkinModel, uploadCape, uploadSkin, type Announcement, type AuthTokens, type ServerProfile } from "./api";
import type { SyncProgress } from "../electron/sync";
import type { UpdateState } from "../electron/updater";
import logo from "./assets/logo.png";

type View = "home" | "minecraft" | "css";
type LauncherSettings = { memoryMb: number; gameRoot: string; cssRoot: string };
const serverConfigs = {
  "melchior-1": { id: "melchior-1", name: "МЕЛЬХИОР-1", gameType: "minecraft", version: "1.21.1", supportsLaunch: true, supportsSync: true, supportsGameSettings: true, supportsCosmetics: true },
  "survival-jim-css": { id: "survival-jim-css", name: "SURVIVAL JIM", gameType: "css", version: "v34", supportsLaunch: true, supportsSync: false, supportsGameSettings: true, supportsCosmetics: false },
} as const;

function AuthPanel({ onDone, onCancel }: { onDone(tokens: AuthTokens): void; onCancel(): void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    try { onDone(await authenticate(mode, data)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка авторизации"); }
    finally { setBusy(false); }
  }
  return <div className="auth-shade"><form className="auth-panel glass" onSubmit={submit}>
    <button type="button" className="modal-close" aria-label="Закрыть" onClick={onCancel}><X/></button>
    <img src={logo} draggable={false}/><span className="eyebrow">rareteam ACCOUNT</span><h2>{mode === "login" ? "ВХОД" : "РЕГИСТРАЦИЯ"}</h2>
    <p className="auth-intro">Один аккаунт для всех игровых серверов rareteam.</p>
    {mode === "register" && <><input name="username" placeholder="Ник в игре" minLength={3} maxLength={16} required/><input name="email" type="email" placeholder="E-mail" required/></>}
    {mode === "login" && <input name="login" placeholder="Ник или e-mail" required/>}
    <input name="password" type="password" placeholder="Пароль" minLength={mode === "login" ? 8 : 10} required/>
    {error && <p className="auth-error">{error}</p>}
    <button className="auth-submit" disabled={busy}>{busy ? "ПРОВЕРКА..." : mode === "login" ? "ВОЙТИ" : "СОЗДАТЬ АККАУНТ"}</button>
    <button type="button" className="auth-switch" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Создать аккаунт" : "У меня уже есть аккаунт"}</button>
  </form></div>;
}

function bytes(value: number) {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} КБ`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} МБ`;
  return `${(value / 1024 ** 3).toFixed(2)} ГБ`;
}

export function App() {
  const [session, setSession] = useState<AuthTokens | null>(null);
  const [profile, setProfile] = useState<ServerProfile | null>(null);
  const [cssProfile, setCssProfile] = useState<ServerProfile | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("ПОДКЛЮЧЕНИЕ К API");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [view, setView] = useState<View>("home");
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<LauncherSettings>({ memoryMb: 4096, gameRoot: "", cssRoot: "" });
  const [update, setUpdate] = useState<UpdateState>({ phase: "idle" });
  const skinInput = useRef<HTMLInputElement>(null);
  const capeInput = useRef<HTMLInputElement>(null);

  const connect = useCallback(async () => {
    setReady(false); setApiReady(false); setError(""); setMessage("ПОДКЛЮЧЕНИЕ К API");
    if (!apiUrl) { setError("Адрес API не настроен в этой сборке"); setReady(true); return; }
    try {
      const saved = await restoreSession();
      setSession(saved);
      setApiReady(true);
      setMessage(saved ? "ГОТОВО К ЗАПУСКУ" : "ТРЕБУЕТСЯ ВХОД");
      try {
        const [profiles, news] = await Promise.all([loadProfiles(), loadNews().catch(() => [])]);
        const melchior = profiles.find((item) => item.id === "melchior-1") ?? null;
        setProfile(melchior);
        setCssProfile(profiles.find((item) => item.id === "survival-jim-css") ?? null);
        setAnnouncements(news);
        if (!melchior) setError("На сервере не опубликована клиентская сборка Мельхиор-1");
      } catch (reason) {
        setError(reason instanceof Error ? `Не удалось загрузить список серверов: ${reason.message}` : "Не удалось загрузить список серверов");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "API недоступен"); }
    finally { setReady(true); }
  }, []);

  useEffect(() => { void connect(); void window.rare?.getSettings().then(setSettings); }, [connect]);
  useEffect(() => window.rare?.onSyncProgress((value) => setProgress(value)), []);
  useEffect(() => {
    void window.rare?.getUpdateState().then(setUpdate);
    return window.rare?.onUpdateState(setUpdate);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadProfiles().then((profiles) => {
        setProfile(profiles.find((item) => item.id === "melchior-1") ?? null);
        setCssProfile(profiles.find((item) => item.id === "survival-jim-css") ?? null);
      }).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function play() {
    setError("");
    if (!window.rare) { setError("Служебный модуль лаунчера не загрузился. Перезапустите обновлённый EXE"); return; }
    if (!session) { setAuthOpen(true); setError("Войдите в единый аккаунт rareteam, чтобы запустить игру"); return; }
    if (selectedServerId === "survival-jim-css") {
      if (!cssProfile) { setError("Профиль Survival Jim CSS ещё не загружен"); return; }
      if (!settings.cssRoot) { setSettingsOpen(true); setError("Выберите папку базового клиента CSS v34"); return; }
      try {
        setSyncing(true); setMessage("УСТАНОВКА ФИРМЕННОГО МЕНЮ");
        await window.rare.launchSource(cssProfile.address);
        setMessage("CSS V34 ЗАПУЩЕНА");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка запуска CSS v34"); setMessage("ЗАПУСК НЕ ВЫПОЛНЕН"); }
      finally { setSyncing(false); }
      return;
    }
    if (!profile?.manifestUrl || !profile.manifestPublicKey) { setError("Профиль Мельхиор-1 ещё не загружен"); return; }
    try {
      setSyncing(true);
      setProgress(null);
      setMessage("ПРОВЕРКА ФАЙЛОВ");
      await window.rare.synchronize(profile.id);
      setMessage("ПОЛУЧЕНИЕ БИЛЕТА");
      const ticketResult = await createGameTicket(session, profile.id);
      setSession(ticketResult.session);
      await window.rare.launch(profile.id, { username: ticketResult.session.user.username, uuid: ticketResult.session.user.uuid, ticket: ticketResult.data.ticket, serverAddress: profile.address });
      setMessage("ИГРА ЗАПУЩЕНА");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка запуска"); setMessage("ЗАПУСК НЕ ВЫПОЛНЕН"); }
    finally { setSyncing(false); }
  }

  async function skinChanged(file?: File) {
    if (!file || !session) return;
    try { const result = await uploadSkin(session, file); setSession({ ...result.session, user: { ...result.session.user, skinUrl: result.data.skinUrl } }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить скин"); }
  }
  async function capeChanged(file?: File) {
    if (!file || !session) return;
    try { const result = await uploadCape(session, file); setSession({ ...result.session, user: { ...result.session.user, capeUrl: result.data.capeUrl } }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить плащ"); }
  }
  async function modelChanged(model: "classic" | "slim") {
    if (!session) return;
    const result = await updateSkinModel(session, model);
    setSession({ ...result.session, user: { ...result.session.user, skinModel: result.data.skinModel } });
  }
  async function signOut() { if (session) await logout(session); setSession(null); setAccountOpen(false); }
  async function saveSettings(next: Partial<LauncherSettings>) {
    const saved = await window.rare?.saveSettings(next); if (saved) setSettings(saved);
  }

  function selectView(next: View) {
    setView(next);
    setSelectedServerId(next === "minecraft" ? "melchior-1" : next === "css" ? "survival-jim-css" : null);
    setAccountOpen(false);
  }

  const selectedServer = selectedServerId ? serverConfigs[selectedServerId as keyof typeof serverConfigs] : null;
  const activeProfile = selectedServerId === "survival-jim-css" ? cssProfile : profile;
  const syncText = !selectedServer ? "Выберите игровой сервер сверху" : selectedServer.gameType === "css" ? (cssProfile ? `${cssProfile.subtitle} · ${cssProfile.address}` : "Профиль CSS v34 не получен") : progress?.phase === "downloading" ? `${progress.completedFiles}/${progress.totalFiles} файлов · ${bytes(progress.completedBytes)} / ${bytes(progress.totalBytes)}` : progress?.phase === "checking" ? "Сверяем локальные файлы со сборкой" : progress?.phase === "cleaning" ? "Удаляем устаревшие файлы" : profile ? `${profile.subtitle} · ${profile.address}` : "Профиль сборки не получен";
  const progressPercent = progress?.totalBytes ? Math.min(100, Math.round(progress.completedBytes / progress.totalBytes * 100)) : 0;
  const name = session?.user.username ?? "ВОЙТИ";
  const primaryRole = session?.user.roleAssignments?.slice().sort((a, b) => b.position - a.position)[0];
  const updateText = update.phase === "checking" ? "Проверяем обновления лаунчера"
    : update.phase === "available" ? `Доступна версия ${update.version}`
    : update.phase === "downloading" ? `Загрузка обновления ${update.percent}%`
    : update.phase === "downloaded" ? `Версия ${update.version} готова к установке`
    : update.phase === "error" ? `Ошибка обновления: ${update.message}`
    : "";
  return <main className="app-shell">
    <div className="hex-grid"/><div className="ribbon"><i/><i/><i/></div>
    <header className="titlebar">
      <div className="brand"><img src={logo} draggable={false}/><span>rareteam</span><small>GAME CLIENT</small></div>
      <nav>
        <button className={view === "home" ? "active" : ""} onClick={() => selectView("home")}>ГЛАВНАЯ</button>
        <button className={view === "minecraft" ? "active" : ""} onClick={() => selectView("minecraft")}>МЕЛЬХИОР-1</button>
        <button className={view === "css" ? "active" : ""} onClick={() => selectView("css")}>SURVIVAL JIM</button>
      </nav>
      <div className="account-wrap">
        <button className={`account-chip ${session ? "authorized" : "guest"}`} onClick={() => setAccountOpen((open) => !open)}>
          <span className={`account-dot ${session ? "" : "offline"}`}>●</span>{name}<span>⌄</span>
        </button>
        {accountOpen && <div className="account-popover glass">
          <div className="account-popover-head"><div className="avatar">{session?.user.skinUrl ? <img src={session.user.skinUrl} draggable={false}/> : <UserRound size={28}/>}</div><div><strong>{session?.user.username ?? "ГОСТЬ"}</strong><small className={session ? "" : "offline-text"}>{session ? "AUTHORIZED" : "НЕ АВТОРИЗОВАН"}</small></div></div>
          {session
            ? <button onClick={() => void signOut()}><LogOut/> Выйти из аккаунта</button>
            : <button className="account-login" onClick={() => { setAccountOpen(false); setAuthOpen(true); }}><LogIn/> Войти или зарегистрироваться</button>}
        </div>}
      </div>
      <div className="window-actions"><button aria-label="Свернуть" onClick={() => void window.rare?.minimize()}><Minus/></button><button aria-label="Закрыть" onClick={() => void window.rare?.close()}><X/></button></div>
    </header>

    {update.phase !== "idle" && update.phase !== "not-available" && <div className={`update-banner ${update.phase}`}>
      <span>{updateText}</span>
      {update.phase === "downloaded" && <button onClick={() => void window.rare?.installUpdate()}>ПЕРЕЗАПУСТИТЬ И ОБНОВИТЬ</button>}
      {update.phase === "error" && <button onClick={() => void window.rare?.checkForUpdates()}>ПОВТОРИТЬ</button>}
    </div>}

    <input ref={skinInput} hidden type="file" accept="image/png" onChange={(event) => void skinChanged(event.target.files?.[0])}/>
    <input ref={capeInput} hidden type="file" accept="image/png" onChange={(event) => void capeChanged(event.target.files?.[0])}/>

    <section className={`content ${selectedServerId ? "server-selected" : "home-selected"} ${view === "css" ? "css-selected" : ""}`}>
      {selectedServerId === "melchior-1" && <aside className="profile glass">
        <div className="unit">rareteam / PLAYER</div>
        <div className="avatar">{session?.user.skinUrl ? <img src={session.user.skinUrl} draggable={false}/> : <UserRound size={52}/>}</div>
        <strong>{session?.user.username ?? "ГОСТЬ"}</strong>
        {primaryRole && <span className="launcher-role" style={{ color: primaryRole.color }}>{primaryRole.iconUrl ? <img src={primaryRole.iconUrl} draggable={false}/> : "◆"} {primaryRole.name}</span>}
        <span className={session ? "verified" : "disconnected"}>● {session ? "AUTHORIZED" : "НЕ АВТОРИЗОВАН"}</span>
        <div className="profile-meta"><span>ПРОФИЛЬ</span><b>{session?.user.uuid.slice(0, 8) ?? "—"}</b><span>ПАМЯТЬ</span><b>{settings.memoryMb / 1024} ГБ</b></div>
        <div className="profile-actions">
          {!session && <button className="profile-login" onClick={() => setAuthOpen(true)}><LogIn/> Войти в аккаунт</button>}
          <button onClick={() => setSettingsOpen(true)}><Settings/> Настройки игры</button>
        </div>
      </aside>}

      {view === "home" ? <div className="home-feed">
        <section className="hero glass">
          <div className="hero-copy"><span className="eyebrow">rareteam / ЕДИНЫЙ ИГРОВОЙ ЛАУНЧЕР</span><h1>rare<em>team</em></h1><p>Новости проекта, игровые серверы и ваш аккаунт — в одном месте.</p>
            <div className="hero-actions">
              {!session && <button className="hero-login" onClick={() => setAuthOpen(true)}><LogIn/> ВОЙТИ В АККАУНТ</button>}
              <button className="hero-server" onClick={() => selectView("minecraft")}>МЕЛЬХИОР-1 <span>{profile?.online ? "● ONLINE" : "● OFFLINE"}</span></button>
              <button className="hero-server" onClick={() => selectView("css")}>SURVIVAL JIM <span>{cssProfile?.online ? "● ONLINE" : "● OFFLINE"}</span></button>
            </div>
          </div>
          <img className="hero-logo" src={logo} draggable={false}/><div className="scanline"/>
        </section>
        <section className="news-section">
          <div className="section-heading"><div><span className="eyebrow">ОБНОВЛЕНИЯ ПРОЕКТА</span><h2>НОВОСТИ</h2></div><span>{announcements.length ? `${announcements.length} публикаций` : "Публикаций пока нет"}</span></div>
          <div className="news-grid">
            {announcements.length ? announcements.map((item) => <article className="news-card glass" key={item.id}>
              <div className="news-image">{item.imageUrl ? <img src={item.imageUrl} alt="" draggable={false}/> : <img className="news-placeholder" src={logo} alt="" draggable={false}/>}</div>
              <div className="news-copy"><span className="news-date"><CalendarDays/> {new Date(item.publishedAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}</span><h3>{item.title}</h3><p>{item.summary}</p></div>
            </article>) : <div className="news-empty glass"><img src={logo} alt="" draggable={false}/><div><b>Здесь появятся новости rareteam</b><span>Обновления серверов, события и важные объявления будут публиковаться на этой странице.</span></div></div>}
          </div>
        </section>
        {error && <section className="connection-error glass"><span>{error}</span><button onClick={() => void connect()}><RefreshCw/> Повторить</button></section>}
      </div> : view === "minecraft" ? <section className="build-panel glass">
        <span className="eyebrow">MINECRAFT SERVER</span><h1>МЕЛЬХИОР·1</h1><p className="coming-soon">Minecraft 1.21.1 · синхронизация сборки и защищённый вход через единый аккаунт rareteam.</p>
        <div className="server-overview"><b>{profile?.online ? "● В сети" : "● Не в сети"}</b><span>Minecraft 1.21.1</span>{profile && <span>Игроки: {profile.players} / {profile.maxPlayers}</span>}</div>
        {!session && <button className="inline-login secondary" onClick={() => setAuthOpen(true)}><LogIn/> ВОЙТИ ДЛЯ ИГРЫ</button>}
      </section> : <section className="build-panel glass">
        <span className="eyebrow">COUNTER-STRIKE: SOURCE v34</span><h1>SURVIVAL·JIM</h1><p className="coming-soon">Фирменная сборка с меню rareteam: подключение к серверу и настройки.</p>
        <div className="server-overview"><b>{cssProfile?.online ? "● В сети" : "● Не в сети"}</b><span>{cssProfile?.map ? `Карта: ${cssProfile.map}` : "CSS v34"}</span>{cssProfile && <span>Игроки: {cssProfile.players} / {cssProfile.maxPlayers}</span>}</div>
        <div className="build-actions">{!session && <button className="inline-login secondary" onClick={() => setAuthOpen(true)}><LogIn/> ВОЙТИ ДЛЯ ИГРЫ</button>}<button className="secondary" onClick={() => setSettingsOpen(true)}><Settings/> ПАПКА КЛИЕНТА</button></div>
      </section>}
    </section>

    {selectedServerId && <footer className="launchbar glass server-launchbar">
      <div className="download">{selectedServerId === "melchior-1" ? (syncing ? <RefreshCw className="spin"/> : <Download/>) : <ShieldCheck/>}<div><b>{error || (session ? message : "ТРЕБУЕТСЯ ВХОД В АККАУНТ")}</b><span>{session ? syncText : "Один аккаунт используется для всех серверов rareteam"}</span>{syncing && progress?.phase === "downloading" && <div className="progress-track"><i style={{ width: `${progressPercent}%` }}/></div>}</div>{error && selectedServerId === "melchior-1" && <button className="retry" onClick={() => void connect()}>ПОВТОРИТЬ</button>}</div>
      <button className="play" onClick={() => void play()} disabled={selectedServer?.supportsLaunch !== true || !activeProfile || syncing}><Play fill="currentColor"/><span>{!session ? "ВОЙТИ" : selectedServerId === "melchior-1" ? (syncing ? progress?.phase === "downloading" ? `${progressPercent}%` : "ПРОВЕРКА" : "ИГРАТЬ") : (syncing ? "ЗАПУСК" : "ИГРАТЬ")}<small>{!session ? "ДЛЯ ЗАПУСКА ИГРЫ" : selectedServerId === "melchior-1" ? (syncing ? "НЕ ЗАКРЫВАЙТЕ ЛАУНЧЕР" : "ОБНОВИТЬ И ЗАПУСТИТЬ") : "COUNTER-STRIKE: SOURCE v34"}</small></span></button>
    </footer>}

    {ready && apiReady && authOpen && !session && <AuthPanel onCancel={() => setAuthOpen(false)} onDone={(tokens) => { setSession(tokens); setAuthOpen(false); setError(""); setMessage("ГОТОВО К ЗАПУСКУ"); }}/>}
    {settingsOpen && selectedServerId === "melchior-1" && <div className="modal-shade"><section className="settings-modal glass"><button className="modal-close" onClick={() => setSettingsOpen(false)}><X/></button><span className="eyebrow">НАСТРОЙКИ ИГРЫ / MINECRAFT</span><h2>КЛИЕНТ</h2><label>Оперативная память <b>{settings.memoryMb / 1024} ГБ</b><input type="range" min="2048" max="16384" step="512" value={settings.memoryMb} onChange={(event) => void saveSettings({ memoryMb: Number(event.target.value) })}/></label><label>Папка игры<div className="folder-row"><input value={settings.gameRoot || "Стандартная папка"} readOnly/><button onClick={async () => { const saved = await window.rare?.chooseGameDirectory(); if (saved) setSettings(saved); }}><FolderOpen/></button></div></label><label>Скин<button className="secondary" type="button" disabled={!session} onClick={() => skinInput.current?.click()}>ВЫБРАТЬ СКИН</button></label><label>Плащ<button className="secondary" type="button" disabled={!session} onClick={() => capeInput.current?.click()}>ВЫБРАТЬ ПЛАЩ</button></label><label>Модель скина<select value={session?.user.skinModel ?? "classic"} disabled={!session} onChange={(event) => void modelChanged(event.target.value as "classic" | "slim")}><option value="classic">Classic</option><option value="slim">Slim</option></select></label></section></div>}
    {settingsOpen && selectedServerId === "survival-jim-css" && <div className="modal-shade"><section className="settings-modal glass"><button className="modal-close" onClick={() => setSettingsOpen(false)}><X/></button><span className="eyebrow">НАСТРОЙКИ / CSS v34</span><h2>SURVIVAL JIM</h2><p className="muted">Выберите папку легально установленного или предоставленного вами базового клиента. В ней должны находиться hl2.exe и папка cstrike.</p><label>Папка клиента<div className="folder-row"><input value={settings.cssRoot || "Папка не выбрана"} readOnly/><button onClick={async () => { const saved = await window.rare?.chooseCssDirectory(); if (saved) setSettings(saved); }}><FolderOpen/></button></div></label><p className="muted">Перед запуском лаунчер установит только фирменное меню rareteam и конфигурацию подключения.</p></section></div>}
  </main>;
}
