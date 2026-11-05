// @ts-nocheck
'use strict';
// Language: the island in English (en) or Turkish (tr). Settings → General → Language.
// Every text drawn on the canvas goes through text(), and every DOM page is watched, so all screens
// are translated in one place. Unknown texts (your own notes, AI messages, file names) stay as they are.
(function i18n() {
  const lang = () => (['en', 'tr'].includes(window.__lumadockPrefs?.().lang) ? window.__lumadockPrefs().lang : 'en');
  window.__lumadockLang = lang;

  // [Dutch, English, Turkish] triples for all UI strings across the island & pages
  const DICT = [
    // states and labels
    ['Bezig', 'Working', 'Çalışıyor'],
    ['Versturen', 'Sending', 'Gönderiliyor'],
    ['Vraag', 'Question', 'Soru'],
    ['Fout', 'Error', 'Hata'],
    ['Gestopt', 'Stopped', 'Durduruldu'],
    ['Niet beschikbaar', 'Unavailable', 'Kullanılamıyor'],
    ['Klaar', 'Done', 'Tamamlandı'],
    ['Verbinden', 'Connecting', 'Bağlanıyor'],
    ['Niet verbonden', 'Not connected', 'Bağlı değil'],
    ['Inloggen', 'Log in', 'Giriş Yap'],
    ['Rustig', 'Idle', 'Boşta'],
    ['rustig', 'idle', 'boşta'],
    ['Wacht op jou', 'Waiting for you', 'Sizi bekliyor'],
    ['● Wacht op jou', '● Waiting for you', '● Sizi bekliyor'],
    ['✓ Klaar', '✓ Done', '✓ Tamamlandı'],
    ['✕ Gestopt met een fout', '✕ Stopped with an error', '✕ Hata ile durduruldu'],
    ['Wacht op Claude Code', 'Waiting for Claude Code', 'Claude Code bekleniyor'],
    ['Claude is bezig', 'Claude is working', 'Claude çalışıyor'],
    ['Claude bezig', 'Claude working', 'Claude çalışıyor'],
    ['Wil toestemming', 'Needs permission', 'İzin istiyor'],
    ['Plan klaar', 'Plan ready', 'Plan hazır'],
    ['Heeft een vraag voor jou', 'Has a question for you', 'Size bir sorusu var'],
    ['Claude heeft een vraag voor je', 'Claude has a question for you', 'Claude size bir soru soruyor'],
    ['Claude Code heeft je nodig.', 'Claude Code needs you.', 'Claude Code sizi bekliyor.'],
    ['Claude heeft je nodig in de terminal.', 'Claude needs you in the terminal.', 'Claude terminalde sizi bekliyor.'],
    ['Toegestaan, gaat verder', 'Allowed, continuing', 'İzin verildi, devam ediyor'],
    ['Geweigerd', 'Denied', 'Reddedildi'],
    ['Gezien', 'Seen', 'Görüldü'],
    ['Niet actief', 'Not active', 'Aktif değil'],
    ['Niet gekoppeld', 'Not connected', 'Bağlı değil'],
    ['Nog niet gekoppeld', 'Not connected yet', 'Henüz bağlı değil'],
    ['Je antwoord is verstuurd', 'Your answer was sent', 'Yanıtınız gönderildi'],
    ['Claude is overbelast', 'Claude is overloaded', 'Claude şu an yoğun'],
    ['niet ingelogd', 'not logged in', 'giriş yapılmadı'],
    ['antwoord te lang', 'answer too long', 'yanıt çok uzun'],
    ['Voert een opdracht uit', 'Running a command', 'Komut çalıştırıyor'],
    ['Zoekt in de code', 'Searching the code', 'Kodda arama yapıyor'],
    ['Zoekt op internet', 'Searching the web', 'İnternette arıyor'],
    ['Start een helper', 'Starting a helper', 'Yardımcı başlatıyor'],
    ['Claude vraagt iets', 'Claude asks something', 'Claude bir şey soruyor'],
    ['Plan klaar: goedkeuren?', 'Plan ready: approve?', 'Plan hazır: onaylıyor musunuz?'],
    ['Er ging iets mis', 'Something went wrong', 'Bir şeyler ters gitti'],
    ['Fout: limiet bereikt', 'Error: limit reached', 'Hata: limite ulaşıldı'],
    // permission
    ['Toestaan', 'Allow', 'İzin Ver'],
    ['Weigeren', 'Deny', 'Reddet'],
    ['Bekijk', 'View', 'Görüntüle'],
    ['Mag ik dit doen?', 'May I do this?', 'Bunu yapabilir miyim?'],
    // header / home / widgets
    ['Apps', 'Apps', 'Uygulamalar'],
    ['Widgets', 'Widgets', 'Bileşenler'],
    ['Lade', 'Tray', 'Çekmece'],
    ['Klembord', 'Clipboard', 'Pano'],
    ['Notitie', 'Note', 'Not'],
    ['Instellingen', 'Settings', 'Ayarlar'],
    ['Klok', 'Clock', 'Saat'],
    ['Muziek', 'Music', 'Müzik'],
    ['Apparaten', 'Devices', 'Cihazlar'],
    ['Spiegel', 'Mirror', 'Ayna'],
    ['Even checken voor je videogesprek · de camera stopt als je weggaat', 'Quick check before your video call · camera stops when you leave', 'Görüntülü görüşme öncesi hızlı kontrol · çıkınca kamera kapanır'],
    ['Geen camera gevonden, of Windows geeft geen toegang (Instellingen → Privacy → Camera).', 'No camera found, or Windows denied access (Settings → Privacy → Camera).', 'Kamera bulunamadı veya Windows erişime izin vermiyor (Ayarlar → Gizlilik → Kamera).'],
    ['🔇 Geluid uit', '🔇 Sound off', '🔇 Ses kapalı'],
    ['Leeg', 'Empty', 'Boş'],
    ['Opschrijven', 'Write it down', 'Not al'],
    ['Laatste kopieën', 'Last copies', 'Son kopyalar'],
    ['Kleuren, geluid', 'Colours, sound', 'Renkler, ses'],
    ['Kleuren, geluid en meer', 'Colours, sound and more', 'Renkler, ses ve fazlası'],
    ['Je laatste kopieën', 'Your last copies', 'Son kopyaladıklarınız'],
    ['Snel iets opschrijven', 'Jot something down', 'Hızlıca bir şey not alın'],
    ['Niks aan het spelen', 'Nothing playing', 'Çalan bir şey yok'],
    ['opent LumaDock overal', 'opens LumaDock anywhere', 'LumaDock\'u her yerde açar'],
    ['TIP', 'TIP', 'İPUCU'],
    ['Alles wat LumaDock voor je kan doen · Ctrl+Alt+1–6 = sneltoets', 'Everything LumaDock can do · Ctrl+Alt+1–6 = shortcut', 'LumaDock\'un yapabilecekleri · Ctrl+Alt+1–6 = kısayol'],
    ['Sleep om te verplaatsen  ·  + voor nieuwe widgets', 'Drag to move  ·  + for new widgets', 'Taşımak için sürükleyin  ·  yeni bileşenler için +'],
    ['Kies een app en een maat, of pak een kant-en-klare indeling', 'Pick an app and a size, or a ready-made layout', 'Bir uygulama ve boyut seçin veya hazır bir düzen kullanın'],
    ['Standaard', 'Default', 'Varsayılan'],
    ['8 klein', '8 small', '8 küçük'],
    ['2 groot', '2 big', '2 büyük'],
    ['4 breed', '4 wide', '4 geniş'],
    ['Klein', 'Small', 'Küçük'],
    ['Breed', 'Wide', 'Geniş'],
    ['Groot', 'Big', 'Büyük'],
    ['Staat er al', 'Already there', 'Zaten ekli'],
    ['Geen plek', 'No room', 'Yer yok'],
    ['Toevoegen', 'Add', 'Ekle'],
    ['Maak klein', 'Make small', 'Küçült'],
    ['Maak breed', 'Make wide', 'Genişlet'],
    ['Maak groot', 'Make big', 'Büyüt'],
    ['Haal eerst iets weg of maak iets kleiner', 'Remove something or make it smaller first', 'Önce bir öğeyi kaldırın veya küçültün'],
    ['Geen plek om groter te maken', 'No room to make it bigger', 'Büyütmek için yeterli alan yok'],
    ['Focus loopt', 'Focus running', 'Odak sürüyor'],
    ['Blijf gefocust', 'Stay focused', 'Odaklanmaya devam et'],
    ['Blijf gefocust, Robo let op', 'Stay focused, Robo is watching', 'Odaklanmaya devam et, Robo takipte'],
    ['Klaar om te starten', 'Ready to start', 'Başlamaya hazır'],
    ['Tik om iets op te schrijven', 'Tap to write something down', 'Bir şey yazmak için dokunun'],
    ['Kopieer iets, dan staat het hier', 'Copy something and it shows up here', 'Bir şey kopyaladığınızda burada görünür'],
    ['Snelkoppelingen', 'Shortcuts', 'Kısayollar'],
    ['Jouw favoriete apps', 'Your favourite apps', 'Favori uygulamalarınız'],
    ['Aanpassen', 'Edit', 'Düzenle'],
    ['+ Lege plek', '+ Empty spot', '+ Boş alan'],
    ['Tip: Ctrl + Alt + 1–6 opent apps ook met het toetsenbord', 'Tip: Ctrl + Alt + 1–6 also opens apps from the keyboard', 'İpucu: Ctrl + Alt + 1–6 uygulamaları klavyeden de açar'],
    ['Max 4 · haal er eerst een uit', 'Max 4 · remove one first', 'Maks 4 · önce birini çıkarın'],
    ['Kies tot 4 apps · ze staan ook op je homescherm', 'Pick up to 4 apps · they are on your home screen too', 'En fazla 4 uygulama seçin · ana ekranda da görünürler'],
    // music
    ['Er speelt nu niks', 'Nothing is playing', 'Şu an çalan bir şey yok'],
    ['Start muziek in Spotify, of druk op afspelen.', 'Start music in Spotify, or press play.', 'Spotify\'da müzik başlatın veya oynat\'a basın.'],
    ['Spotify koppelen', 'Connect Spotify', 'Spotify\'ı Bağla'],
    ['Dan zie en bedien je je muziek hier.', 'Then you see and control your music here.', 'Müziğinizi buradan görüp kontrol edebilirsiniz.'],
    ['Koppel Spotify', 'Connect Spotify', 'Spotify\'ı Bağla'],
    ['⏭  Volgend nummer', '⏭  Next song', '⏭  Sonraki parça'],
    ['⏮  Vorig nummer', '⏮  Previous song', '⏮  Önceki parça'],
    // tray, clipboard, note, focus
    ['Laat los, ik vang hem!', "Let go, I'll catch it!", 'Bırakın, yakalayayım!'],
    ['🧺 Laat los, ik vang hem!', "🧺 Let go, I'll catch it!", '🧺 Bırakın, yakalayayım!'],
    ['Het bestand komt in je lade', 'The file goes into your tray', 'Dosya çekmecenize eklenecek'],
    ['Sleep een bestand eruit, of klik om het te openen', 'Drag a file out, or click to open it', 'Dosyayı dışarı sürükleyin veya açmak için tıklayın'],
    ['Sleep bestanden op de island om ze even te bewaren', 'Drop files on the island to keep them for a bit', 'Dosyaları geçici olarak saklamak için adaya bırakın'],
    ['Je lade is leeg', 'Your tray is empty', 'Çekmeceniz boş'],
    ['Sleep een bestand op LumaDock om het even te bewaren', 'Drop a file on LumaDock to keep it for a bit', 'Geçici olarak saklamak için LumaDock\'a bir dosya sürükleyin'],
    ['Je laatst gekopieerde tekst · klik om opnieuw te kopiëren', 'Your last copied text · click to copy again', 'Son kopyalanan metinler · yeniden kopyalamak için tıklayın'],
    ['Wissen', 'Clear', 'Temizle'],
    ['Gekopieerd ✓', 'Copied ✓', 'Kopyalandı ✓'],
    ['Nog niks gekopieerd', 'Nothing copied yet', 'Henüz bir şey kopyalanmadı'],
    ['Kopieer iets (Ctrl + C), dan verschijnt het hier.', 'Copy something (Ctrl + C) and it shows up here.', 'Bir şey kopyalayın (Ctrl + C), burada görünecektir.'],
    ['Even iets opschrijven · wordt vanzelf bewaard', 'Jot something down · saved automatically', 'Hızlı not alın · otomatik olarak kaydedilir'],
    ['Typ hier…', 'Type here…', 'Buraya yazın…'],
    ['Je bent aan het focussen. LumaDock houdt de tijd bij.', 'You are focusing. LumaDock keeps the time.', 'Odaklanıyorsunuz. LumaDock süreyi takip ediyor.'],
    ['Kies hoe lang je wil focussen', 'Choose how long you want to focus', 'Ne kadar süre odaklanmak istediğinizi seçin'],
    ['Start focus', 'Start focus', 'Odağı başlat'],
    ['Stoppen', 'Stop', 'Durdur'],
    ['Uren', 'Hours', 'Saat'],
    ['Minuten', 'Minutes', 'Dakika'],
    ['Seconden', 'Seconds', 'Saniye'],
    ['Uren meer', 'More hours', 'Saat artır'],
    ['Uren minder', 'Fewer hours', 'Saat azalt'],
    ['Minuten meer', 'More minutes', 'Dakika artır'],
    ['Minuten minder', 'Fewer minutes', 'Dakika azalt'],
    ['Seconden meer', 'More seconds', 'Saniye artır'],
    ['Seconden minder', 'Fewer seconds', 'Saniye azalt'],
    ['1 uur', '1 hour', '1 saat'],
    ['Focus klaar!', 'Focus done!', 'Odak tamamlandı!'],
    ['Muziek en Claude blijven gewoon zichtbaar in het kleine eiland.', 'Music and Claude stay visible in the small island.', 'Müzik ve yapay zeka durumu küçük adada görünmeye devam eder.'],
    // AI & Claude Code page
    ['Volgt al je Claude Code-sessies', 'Follows all your Claude Code sessions', 'Tüm Claude Code oturumlarınızı takip eder'],
    ['Verbind jouw gesprek', 'Connect your conversation', 'Sohbetinizi bağlayın'],
    ['Kies jouw venster', 'Choose your window', 'Pencerenizi seçin'],
    ['Jouw antwoord…', 'Your answer…', 'Yanıtınız…'],
    ['Antwoord op de vraag', 'Answer the question', 'Soruyu yanıtla'],
    ['Typ iets voor Claude…', 'Type something for Claude…', 'Claude için bir şey yazın…'],
    ['Of typ je eigen antwoord…', 'Or type your own answer…', 'Veya kendi yanıtınızı yazın…'],
    ['Bewerkt', 'Edited', 'Düzenlendi'],
    ['Voert uit', 'Runs', 'Çalıştırıyor'],
    ['Helper bezig', 'Helper working', 'Yardımcı çalışıyor'],
    ['Gelezen', 'Read', 'Okundu'],
    ['Uitgevoerd', 'Ran', 'Çalıştırıldı'],
    ['Gezocht', 'Searched', 'Arandı'],
    ['Online gezocht', 'Searched online', 'Web\'de arandı'],
    ['Helper klaar', 'Helper done', 'Yardımcı tamamladı'],
    ['Samenvatting', 'Summary', 'Özet'],
    ['Geen bestanden aangeraakt', 'No files touched', 'Hiçbir dosyaya dokunulmadı'],
    ['Nog geen gesprek', 'No conversation yet', 'Henüz sohbet yok'],
    ['Typ iets in Claude Code. Hier zie je het gesprek live meelopen.', 'Type something in Claude Code. You will see the conversation here, live.', 'Claude Code\'da bir şey yazın. Sohbeti burada canlı göreceksiniz.'],
    ['Claude werkt. Je krijgt een seintje als hij klaar is.', "Claude is working. You'll get a ping when it's done.", 'Claude çalışıyor. Bittiğinde bildirim alacaksınız.'],
    ['Verder praten? Typ in je terminal.', 'Want to keep going? Type in your terminal.', 'Devam etmek için terminalinize yazın.'],
    ['Kijk in de terminal wat er misging.', 'Check the terminal to see what went wrong.', 'Ne ters gittiğini görmek için terminale bakın.'],
    ['Wat moet er anders?', 'What should change?', 'Ne değişmeli?'],
    ['Goedkeuren', 'Approve', 'Onayla'],
    ['Stuur', 'Send', 'Gönder'],
    ['Speelt nu', 'Playing now', 'Şimdi çalıyor'],
    ['Wacht op je AI', 'Waiting for your AI', 'Yapay zeka bekleniyor'],
    ['● Vraag', '● Question', '● Soru'],
    ['Log eerst in', 'Sign in first', 'Önce giriş yapın'],
    ['Volgt dit gesprek', 'Following this chat', 'Bu sohbeti takip ediyor'],
    ['Klaar · je antwoord staat klaar', 'Done · your answer is ready', 'Tamamlandı · yanıtınız hazır'],
    ['Het antwoord komt eraan…', 'The answer is on its way…', 'Yanıt geliyor…'],
    ['Robo meldt het als je AI klaar is of iets vraagt.', 'Robo tells you when your AI is done or asks something.', 'Yapay zekanız işi bitirdiğinde veya soru sorduğunda Robo haber verir.'],
    ['Koppel je AI in LumaDock → Verbindingen.', 'Connect your AI in LumaDock → Connections.', 'Yapay zekanızı LumaDock → Bağlantılar bölümünden bağlayın.'],
    ['Geen actieve sessie', 'No active session', 'Aktif oturum yok'],
    ['Je antwoord staat klaar in het gesprek.', 'Your answer is ready in the chat.', 'Yanıtınız sohbette hazır.'],
    ['Open Spotify op een ander apparaat, dan zie je het hier.', 'Open Spotify on another device to see it here.', 'Burada görmek için başka bir cihazda Spotify\'ı açın.'],
    ['Deze pc', 'This PC', 'Bu bilgisayar'],
    ['Kon je apparaten niet ophalen.', "Couldn't load your devices.", 'Cihazlarınız yüklenemedi.'],
    ['Dat lukte niet.', "That didn't work.", 'Bu işlem başarısız oldu.'],
    ['5-uurslimiet', '5-hour limit', '5 saatlik limit'],
    ['AI is bezig', 'AI is working', 'YZ çalışıyor'],
    ['Bericht aan Claude Code', 'Message to Claude Code', 'Claude Code\'a mesaj'],
    ['Speel af op', 'Play on', 'Şurada çal'],
    ['Open gesprek', 'Open chat', 'Sohbeti aç'],
    ['Open Verbindingen', 'Open Connections', 'Bağlantıları Aç'],
    ['Koppelen in LumaDock', 'Connect in LumaDock', 'LumaDock\'ta Bağla'],
    ['Codex staat nog niet op deze pc', 'Codex is not on this PC yet', 'Codex henüz bu bilgisayarda kurulu değil'],
    ['Eén schakelaar in LumaDock → Verbindingen. Daarna doet LumaDock de rest.', 'One switch in LumaDock → Connections. LumaDock does the rest.', 'LumaDock → Bağlantılar\'da tek bir anahtar. Gerisini LumaDock halleder.'],
    ['Nog geen geschikt venster gevonden. Houd een websitegesprek in een eigen venster.', 'No suitable window found yet. Keep a website chat open in its own window.', 'Uygun pencere bulunamadı. Web sohbetini kendi penceresinde açık tutun.'],
    ['Naar terminal', 'To terminal', 'Terminale git'],
    ['Breng het Claude Code-venster naar voren', 'Bring the Claude Code window to the front', 'Claude Code penceresini öne getir'],
    ['Welk model gebruikt Claude?', 'Which model does Claude use?', 'Claude hangi modeli kullansın?'],
    ['Kies welk Claude-model Claude Code gebruikt', 'Choose which Claude model Claude Code uses', 'Claude Code\'un kullanacağı modeli seçin'],
    ['Wat Claude Code zelf kiest', 'What Claude Code picks itself', 'Claude Code\'un kendi seçimi'],
    ['Het slimst, voor moeilijke klussen', 'The smartest, for hard jobs', 'En zeki, zorlu işler için'],
    ['Snel en slim, voor de meeste dingen', 'Fast and smart, for most things', 'Hızlı ve zeki, çoğu görev için'],
    ['Supersnel, voor kleine dingen', 'Super fast, for small things', 'Süper hızlı, küçük işler için'],
    ['Opus plant, Sonnet bouwt', 'Opus plans, Sonnet builds', 'Opus planlar, Sonnet yazar'],
    ['Opus plan', 'Opus plan', 'Opus planı'],
    ['Voor nieuwe sessies · in een lopend gesprek:', 'For new sessions · in a running conversation:', 'Yeni oturumlar için · devam eden sohbette:'],
    ['Koppel Claude Code', 'Connect Claude Code', 'Claude Code\'u Bağla'],
    ['Daarna Claude Code één keer opnieuw starten.', 'Then restart Claude Code once.', 'Ardından Claude Code\'u bir kez yeniden başlatın.'],
    ['Gekoppeld. Even wachten tot LumaDock klaar is met starten.', 'Connected. Wait a moment until LumaDock has started.', 'Bağlandı. LumaDock başlayana kadar biraz bekleyin.'],
    ['Houd het gesprek open in een eigen venster terwijl je verder werkt.', 'Keep the conversation open in its own window while you keep working.', 'Çalışırken sohbeti kendi penceresinde açık tutun.'],
    ['(kies er meer)', '(pick several)', '(birden fazla seçin)'],
    ['In je lade', 'In your tray', 'Çekmecenizde'],
    ['Bezig…', 'Working…', 'Çalışıyor…'],
    ['Gewijzigd', 'Changed', 'Değiştirildi'],
    ['LumaDock volgt het vanzelf', 'LumaDock follows it by itself', 'LumaDock otomatik takip eder'],
    ['Bezig ·', 'Working ·', 'Çalışıyor ·'],
    ['Wat wil je vinden in dit project?', 'What do you want to find in this project?', 'Bu projede ne bulmak istiyorsunuz?'],
    // demo scenes
    ['Maak de knop op de homepage blauw', 'Make the button on the homepage blue', 'Ana sayfadaki butonu mavi yap'],
    ['Maak de knop mooier', 'Make the button look nicer', 'Butonu daha şık hale getir'],
    ['Ik kan de knop blauw of groen maken. Welke kleur wil je?', 'I can make the button blue or green. Which colour do you want?', 'Butonu mavi veya yeşil yapabilirim. Hangi rengi istersiniz?'],
    ['Klaar! De knop is nu blauw en licht op als je eroverheen gaat. Alle tests slagen.', 'Done! The button is blue now and lights up when you hover it. All tests pass.', 'Tamamlandı! Buton artık mavi ve üzerine gelince parlıyor. Tüm testler geçti.'],
    ['Zet de website online', 'Put the website online', 'Web sitesini yayına al'],
    ['Fix de btw-berekening', 'Fix the VAT calculation', 'KDV hesaplamasını düzelt'],
    ['Klaar! De btw is nu 21% en wordt netjes afgerond. Alle 48 tests slagen.', 'Done! VAT is now 21% and rounds correctly. All 48 tests pass.', 'Tamamlandı! KDV hesaplaması düzeltildi ve yuvarlama doğrulandı. 48 testin tamamı geçti.'],
    // small island messages
    ['Au! Te veel tikken… even bijkomen 😵', 'Ouch! Too many taps… need a sec 😵', 'Ah! Çok fazla dokundun… başım döndü 😵'],
    ['Ik heb honger… maak een taak af 🍪', "I'm hungry… finish a task 🍪", 'Acıktım… bir görev tamamla 🍪'],
    ['Doe het even rustig aan.', 'Take it easy for a bit.', 'Biraz dinlenebilirsiniz.'],
    ['Hoi!', 'Hi!', 'Merhaba!'],
    ['vandaag', 'today', 'bugün'],
    ['nu', 'now', 'şimdi'],
    ['Afspraak', 'Event', 'Etkinlik'],
    ['Over 10 minuten', 'In 10 minutes', '10 dakika içinde'],
    // settings headers & controls
    ['Maak LumaDock helemaal van jou', 'Make LumaDock completely yours', 'LumaDock\'u tamamen kendinize göre özelleştirin'],
    ['Algemeen', 'General', 'Genel'],
    ['Karakter', 'Character', 'Karakter'],
    ['Aan', 'On', 'Açık'],
    ['Uit', 'Off', 'Kapalı'],
    ['Opslaan', 'Save', 'Kaydet'],
    ['Herstel', 'Reset', 'Sıfırla'],
    ['Taal', 'Language', 'Dil'],
    ['Taal · Language', 'Language · Dil', 'Dil · Language'],
    ['De taal van de island', 'The language of the island', 'Adanın arayüz dili'],
    ['Testen', 'Testing', 'Test Modu'],
    ['Testmodus', 'Test mode', 'Test modu'],
    ['LumaDock afsluiten?', 'Quit LumaDock?', 'LumaDock kapatılsın mı?'],
    ['Ja, afsluiten', 'Yes, quit', 'Evet, kapat'],
    ['Nee', 'No', 'Hayır']
  ];

  const EXACT = {};
  const EXACT_TR = {};
  for (const [nl, en, tr] of DICT) {
    EXACT[nl] = en;
    EXACT_TR[nl] = tr;
    EXACT_TR[en] = tr;
  }

  const PATTERNS = [
    [/^Mag ik: (.+)\?$/, 'Allow: $1?', 'İzin verilsin mi: $1?'],
    [/^Allow: (.+)\?$/, 'Allow: $1?', 'İzin verilsin mi: $1?'],
    [/^(\d+) bestanden…$/, '$1 files…', '$1 dosya…'],
    [/^(\d+) files…$/, '$1 files…', '$1 dosya…'],
    [/^Limiet (\d+)%$/, 'Limit $1%', 'Limit %$1'],
    [/^Limit (\d+)%$/, 'Limit $1%', 'Limit %$1'],
    [/^5-uurslimiet$/, '5-hour limit', '5 saatlik limit'],
    [/^Leest (een bestand)$/, 'Reading a file', 'Bir dosya okuyor'],
    [/^Leest (.+)$/, 'Reading $1', '$1 okunuyor'],
    [/^Reading (.+)$/, 'Reading $1', '$1 okunuyor'],
    [/^Bewerkt (een bestand)$/, 'Editing a file', 'Bir dosya düzenliyor'],
    [/^Bewerkt (.+)$/, 'Editing $1', '$1 düzenleniyor'],
    [/^Editing (.+)$/, 'Editing $1', '$1 düzenleniyor'],
    [/^Gebruikt (.+)$/, 'Using $1', '$1 kullanılıyor'],
    [/^Using (.+)$/, 'Using $1', '$1 kullanılıyor'],
    [/^Nog (\d.*)$/, '$1 left', '$1 kaldı'],
    [/^(\d+) min$/, '$1 min', '$1 dk'],
    [/^over (\d+) min$/, 'in $1 min', '$1 dk sonra'],
    [/^(\d+) bestand$/, '$1 file', '$1 dosya'],
    [/^(\d+) bestanden$/, '$1 files', '$1 dosya'],
    [/^(\d+) files?$/, '$1 files', '$1 dosya'],
    [/^(\d+) bestand bewerkt$/, '$1 file edited', '$1 dosya düzenlendi'],
    [/^(\d+) bestanden bewerkt$/, '$1 files edited', '$1 dosya düzenlendi'],
    [/^(\d+) bestand gelezen$/, '$1 file read', '$1 dosya okundu'],
    [/^(\d+) bestanden gelezen$/, '$1 files read', '$1 dosya okundu'],
    [/^(\d+) keer gezocht$/, 'searched $1 times', '$1 kez arandı'],
    [/^(\d+) opdracht$/, '$1 command', '$1 komut'],
    [/^(\d+) opdrachten$/, '$1 commands', '$1 komut'],
    [/^(\d+) sessies$/, '$1 sessions', '$1 oturum'],
    [/^(\d+)\/(\d+) gekozen$/, '$1/$2 picked', '$1/$2 seçildi'],
    [/^(\d+)\/(\d+) picked$/, '$1/$2 picked', '$1/$2 seçildi'],
    [/^Vol \((\d+)\/(\d+)\) · klik er een uit om te wisselen$/, 'Full ($1/$2) · click one off to swap', 'Dolu ($1/$2) · değiştirmek için birini çıkarın'],
    [/^Full \((\d+)\/(\d+)\) · click one off to swap$/, 'Full ($1/$2) · click one off to swap', 'Dolu ($1/$2) · değiştirmek için birini çıkarın'],
    [/^(\d+) taken klaar · (\d+)\/(\d+) prestaties$/, '$1 tasks done · $2/$3 achievements', '$1 görev tamamlandı · $2/$3 başarım'],
    [/^(\d+) tasks done · (\d+)\/(\d+) achievements$/, '$1 tasks done · $2/$3 achievements', '$1 görev tamamlandı · $2/$3 başarım'],
    [/^(\d+) taken klaar\. Verdien meer door taken af te ronden\.$/, '$1 tasks done. Earn more by finishing tasks.', '$1 görev tamamlandı. Görevleri bitirerek daha fazlasını açın.'],
    [/^Prestaties · (\d+)\/(\d+)$/, 'Achievements · $1/$2', 'Başarımlar · $1/$2'],
    [/^Achievements · (\d+)\/(\d+)$/, 'Achievements · $1/$2', 'Başarımlar · $1/$2'],
    [/^(.+) is (\d+)% vol\. Elke taak geeft eten 🍪$/, '$1 is $2% full. Every task gives food 🍪', '$1 %$2 dolu. Her görev enerji verir 🍪'],
    [/^Klaar om (.+)$/, 'Done at $1', 'Bitiş: $1'],
    [/^Done at (.+)$/, 'Done at $1', 'Bitiş: $1'],
    [/^van (.+)$/, 'of $1', 'toplam $1'],
    [/^of (\d+ min)$/, 'of $1', 'toplam $1'],
    [/^Nu: (.+)$/, 'Now: $1', 'Şu an: $1'],
    [/^Now: (.+)$/, 'Now: $1', 'Şu an: $1'],
    [/^Nu in gebruik: (.+)$/, 'In use now: $1', 'Şu an kullanılan: $1'],
    [/^Haal (.+) uit de lade$/, 'Remove $1 from the tray', '$1 dosyasını çekmeceden çıkar'],
    [/^Remove (.+) from the tray$/, 'Remove $1 from the tray', '$1 dosyasını çekmeceden çıkar'],
    [/^(\d+) taken klaar: je hebt een (.+) verdiend\.$/, '$1 tasks done: you earned a $2.', '$1 görev tamamlandı: $2 kazandınız.'],
    [/^(.+) gefocust\. Neem even pauze\.$/, '$1 focused. Take a short break.', '$1 odaklandınız. Kısa bir mola verin.'],
    [/^Je hebt (\d+)% van je Claude-limiet gebruikt$/, "You've used $1% of your Claude limit", 'Claude limitinizin %$1 kadarını kullandınız'],
    [/^Om (.+) is hij weer vol\.$/, "It's full again at $1.", 'Saat $1 itibarıyla yenilenecek.'],
    [/^Speelt op (.+)$/, 'Playing on $1', '$1 üzerinde çalıyor'],
    [/^Playing on (.+)$/, 'Playing on $1', '$1 üzerinde çalıyor'],
    [/^Wisselen naar (.+)…$/, 'Switching to $1…', '$1 cihazına geçiliyor…'],
    [/^Switching to (.+)…$/, 'Switching to $1…', '$1 cihazına geçiliyor…'],
    [/^Stel je vraag in (.+)\. Robo kijkt mee\.$/, 'Ask your question in $1. Robo is watching.', '$1 içinde sorunuzu sorun. Robo takip ediyor.'],
    [/^(.+) vraagt iets$/, '$1 asks something', '$1 bir şey soruyor'],
    [/^(.+) asks something$/, '$1 asks something', '$1 bir şey soruyor'],
    [/^(.+) schrijft…$/, '$1 is writing…', '$1 yazıyor…'],
    [/^(.+) is writing…$/, '$1 is writing…', '$1 yazıyor…'],
    [/^(\d+) bezig$/, '$1 working', '$1 çalışıyor'],
    [/^(\d+) working$/, '$1 working', '$1 çalışıyor'],
    [/^(\d+) wachten op jou$/, '$1 waiting for you', '$1 sizi bekliyor'],
    [/^(\d+) waiting for you$/, '$1 waiting for you', '$1 sizi bekliyor'],
    [/^(\d+) klaar$/, '$1 done', '$1 tamamlandı'],
    [/^(\d+) done$/, '$1 done', '$1 tamamlandı'],
    [/^\+ nog (\d+)$/, '+ $1 more', '+ $1 daha'],
    [/^\+ (\d+) more$/, '+ $1 more', '+ $1 daha'],
    [/^(🪫|🔋) Nog (\d+)% batterij\. Sluit je lader aan!$/, '$1 $2% battery left. Plug in your charger!', '$1 %$2 pil kaldı. Şarj cihazınızı takın!'],
    [/^Batterij bijna leeg: (\d+)%$/, 'Battery almost empty: $1%', 'Pil azaldı: %$1'],
    [/^Sluit je lader aan\.$/, 'Plug in your charger.', 'Şarj cihazınızı takın.'],
    [/^(.+) is bijna leeg$/, '$1 is almost empty', '$1 pili azaldı'],
    [/^Nog (\d+)% batterij\.$/, '$1% battery left.', '%$1 pil kaldı.'],
    [/^🎧 (.+): nog (\d+)%$/, '🎧 $1: $2% left', '🎧 $1: %$2 kaldı'],
    [/^📅 Over (\d+) min: (.+)$/, '📅 In $1 min: $2', '📅 $1 dk içinde: $2']
  ];

  function translate(t, targetLang) {
    const isTr = targetLang === 'tr';
    const map = isTr ? EXACT_TR : EXACT;
    if (Object.prototype.hasOwnProperty.call(map, t)) return map[t];
    for (const [re, repEn, repTr] of PATTERNS) {
      if (re.test(t)) return t.replace(re, isTr ? repTr : repEn);
    }
    if (t.length > 120) return null;
    for (const sep of [' · ', '. ', ': ']) {
      if (!t.includes(sep)) continue;
      const parts = t.split(sep);
      const out = parts.map(p => translate(p, targetLang) ?? (sep === '. ' ? translate(p + '.', targetLang)?.replace(/\.$/, '') : null));
      if (out.some((o, i) => o != null && o !== parts[i])) return out.map((o, i) => o ?? parts[i]).join(sep);
    }
    return null;
  }

  function tr(s) {
    if (typeof s !== 'string') return s;
    const l = lang();
    const t = s.trim();
    if (!t) return s;
    const out = translate(t, l);
    return out == null ? s : s.replace(t, out);
  }
  window.__lumadockTr = tr;

  // ---- canvas: everything drawn with text() ----
  const baseText = text;
  text = function (value, ...rest) { return baseText(typeof value === 'string' ? tr(value) : value, ...rest); };

  // ---- DOM pages: translate text and labels dynamically across language switches ----
  const SKIP = 'script,style,textarea,input,.tl-clip,.tl-list';
  const original = new WeakMap(), ATTRS = ['placeholder', 'title', 'aria-label'];
  let applying = false;
  function fixNode(node) {
    if (node.nodeType === 3) {
      if (!node.parentElement || node.parentElement.closest(SKIP)) return;
      const value = node.nodeValue, known = original.get(node);
      const source = known && known.shown === value ? known.src : value;
      const want = tr(source);
      if (want !== value) node.nodeValue = want;
      original.set(node, { src: source, shown: want });
      return;
    }
    if (node.nodeType !== 1 || node.closest?.('script,style')) return;
    for (const a of ATTRS) {
      if (!node.hasAttribute(a)) continue;
      const key = 'data-src-' + a, value = node.getAttribute(a);
      const source = node.hasAttribute(key) && node.getAttribute(key + '-shown') === value ? node.getAttribute(key) : value;
      const want = tr(source);
      if (want !== value) node.setAttribute(a, want);
      node.setAttribute(key, source);
      node.setAttribute(key + '-shown', want);
    }
  }
  function fixTree(root) {
    if (!root) return;
    fixNode(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n;
    while ((n = w.nextNode())) fixNode(n);
  }
  const observer = new MutationObserver(list => {
    if (applying) return; applying = true;
    try { for (const m of list) { if (m.type === 'childList') m.addedNodes.forEach(fixTree); else fixNode(m.target); } }
    finally { applying = false; observer.takeRecords(); }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  // When switching language: re-render dynamic views and re-translate the DOM tree
  let shownLang = null;
  setInterval(() => {
    const now = lang();
    if (now !== shownLang) {
      shownLang = now;
      window.dispatchEvent(new Event('lumadock:open-ai-settings'));
      applying = true;
      try { fixTree(document.body); }
      finally { applying = false; observer.takeRecords(); }
    }
  }, 200);

  // ---- Windows notifications and dates ----
  if (window.Notification) {
    const N = window.Notification;
    window.Notification = class extends N { constructor(title, options = {}) { super(tr(title), { icon: './assets/icon-256.png', ...options, body: options.body && tr(options.body) }); } };
  }
  for (const fn of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
    const base = Date.prototype[fn];
    Date.prototype[fn] = function (locale, options) {
      return base.call(this, /^nl/i.test(String(locale || '')) ? (lang() === 'tr' ? 'tr-TR' : 'en-GB') : locale, options);
    };
  }
})();
