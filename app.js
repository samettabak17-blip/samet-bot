// app.js – WhatsApp + Gemini 2.0 Flash (FINAL – CRON, NİYET SKORU, PROFİL, KONU TESPİTİ)

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
import cron from "node-cron";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  SESSION MEMORY
// -------------------------------
const sessions = {};

// -------------------------------
//  WHATSAPP SEND (4096 LIMIT SAFE)
// -------------------------------
async function sendMessage(to, body) {
  try {
    const chunks = [];
    for (let i = 0; i < body.length; i += 4000) {
      chunks.push(body.substring(i, i + 4000));
    }

    for (const chunk of chunks) {
      await axios.post(
        `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          text: { body: chunk },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
  }
}

// -------------------------------
//  CORPORATE FALLBACK
// -------------------------------
function corporateFallback(lang) {
  if (lang === "tr") {
    return (
      "Sorunuzu tam olarak anlayamadım ancak size yardımcı olmak isterim. " +
      "Dubai’de şirket kuruluşu, serbest bölge seçimi, vizeler, maliyetler, iş modeli, pazar stratejisi veya yapay zekâ çözümleri hakkında daha net bir soru sorabilirsiniz.\n\n" +
      "Canlı temsilci: +971 52 728 8586"
    );
  }
  if (lang === "en") {
    return (
      "I couldn’t fully understand your question, but I’d be glad to assist. " +
      "You may ask more specifically about Dubai company setup, free zones, visas, costs, business models, or AI solutions.\n\n" +
      "Live consultant: +971 52 728 8586"
    );
  }
  return (
    "لم أفهم سؤالك تمامًا، لكن يسعدني مساعدتك. " +
    "يمكنك طرح سؤال أكثر تحديدًا حول تأسيس الشركات في دبي، المناطق الحرة، التأشيرات، التكاليف أو حلول الذكاء الاصطناعي.\n\n" +
    "المستشار المباشر: ‎+971 52 728 8586"
  );
}

// -------------------------------
//  GEMINI 2.0 FLASH CALL
// -------------------------------
async function callGemini(prompt) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
    process.env.GEMINI_API_KEY;

  try {
    const response = await axios.post(
      url,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const reply =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return reply.trim() || null;
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);
    return null;
  }
}

// -------------------------------
//  STATIC TEXTS
// -------------------------------
const servicesList = {
  tr:
    "SamChe Company LLC olarak sunduğumuz hizmetler:\n" +
    "1. Şirketlere Özel Yapay Zekâ Sistemleri\n" +
    "2. Dijital Büyüme & İçerik Stratejisi\n" +
    "3. Marka Yönetimi & Sosyal Medya\n" +
    "4. Kitle Büyümesi & Performans Optimizasyonu\n" +
    "5. BAE Şirket Kurulumu & Pazar Girişi\n" +
    "6. Serbest Bölge Seçimi & Uyum (Compliance)",
  en:
    "SamChe Company LLC provides:\n" +
    "1. Private AI Systems\n" +
    "2. Digital Growth & Content Strategy\n" +
    "3. Branding & Social Media\n" +
    "4. Audience Growth & Performance Optimization\n" +
    "5. UAE Business Setup & Market Entry\n" +
    "6. Free Zone Selection & Compliance",
  ar:
    "تقدم SamChe Company LLC:\n" +
    "1. أنظمة ذكاء اصطناعي خاصة\n" +
    "2. استراتيجية النمو الرقمي والمحتوى\n" +
    "3. إدارة العلامة التجارية ووسائل التواصل\n" +
    "4. نمو الجمهور وتحسين الأداء\n" +
    "5. تأسيس الأعمال في الإمارات\n" +
    "6. اختيار المناطق الحرة والامتثال",
};

const introAfterLang = {
  tr:
    "Merhaba, ben SamChe Company LLC'nin yapay zekâ danışmanıyım.\n" +
    "BAE şirket kuruluşu, vizeler, oturum, yaşam maliyetleri, iş planları, iş stratejileri, yapay zekâ çözümleri ve webchat AI chatbot hizmetleri hakkında sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?\n\n",
  en:
    "Hello, I am the AI consultant of SamChe Company LLC.\n" +
    "I can answer your questions about UAE company formation, residency, visas, cost of living, business plans, business strategies, AI solutions, and webchat AI chatbot services. How can I assist you?\n\n",
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "أستطيع مساعدتك في تأسيس الشركات في الإمارات، الإقامة، التأشيرات، تكاليف المعيشة، خطط الأعمال، الاستراتيجيات، حلول الذكاء الاصطناعي وخدمة روبوت الدردشة الذكي (Webchat AI Chatbot). كيف يمكنني مساعدتك؟\n\n",
};

const contactText = {
  tr: "Canlı temsilci: +971 52 728 8586",
  en: "Live consultant: +971 52 728 8586",
  ar: "مستشار مباشر: ‎+971 52 728 8586",
};

// -------------------------------
//  TOPIC DETECTION & INTENT SCORE
// -------------------------------
function detectTopic(text) {
  const t = text.toLowerCase();

  if (
    t.includes("şirket") ||
    t.includes("company") ||
    t.includes("business setup") ||
    t.includes("company setup")
  )
    return "company";

  if (
    t.includes("oturum") ||
    t.includes("residency") ||
    t.includes("visa") ||
    t.includes("ikamet")
  )
    return "residency";

  if (
    t.includes("ai") ||
    t.includes("bot") ||
    t.includes("chatbot") ||
    t.includes("webchat")
  )
    return "ai";

  if (
    t.includes("maliyet") ||
    t.includes("cost") ||
    t.includes("price") ||
    t.includes("ücret") ||
    t.includes("bütçe") ||
    t.includes("budget")
  )
    return "cost";

  return "other";
}

function calculateIntentScore(text, currentScore = 0) {
  const t = text.toLowerCase();
  let score = currentScore;

  if (
    t.includes("şirket kurmak istiyorum") ||
    t.includes("company setup") ||
    t.includes("i want to open a company")
  )
    score += 30;

  if (
    t.includes("oturum almak istiyorum") ||
    t.includes("residency") ||
    t.includes("visa application")
  )
    score += 25;

  if (
    t.includes("bütçe") ||
    t.includes("budget") ||
    t.includes("fiyat") ||
    t.includes("price")
  )
    score += 15;

  if (
    t.includes("ne kadar sürer") ||
    t.includes("timeline") ||
    t.includes("kaç günde")
  )
    score += 10;

  if (
    t.includes("merak ettim") ||
    t.includes("sadece soruyorum") ||
    t.includes("just curious")
  )
    score -= 10;

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return score;
}

// -------------------------------
//  WEBHOOK VERIFY
// -------------------------------
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

// -------------------------------
//  WEBHOOK MESSAGE HANDLER
// -------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body || "";
    const lower = text.toLowerCase();

    // FIRST MESSAGE
    if (!sessions[from]) {
      sessions[from] = {
        lang: null,
        history: [],
        lastMessageTime: Date.now(),
        followUpStage: 0,
        intentScore: 0,
        topics: [],
        profile: {
          name: null,
          country: null,
          budget: null,
          interest: null,
        },
      };

      await sendMessage(
        from,
        "Welcome to SamChe Company LLC.\n" +
          "SamChe Company LLC'ye hoş geldiniz.\n" +
          "مرحبًا بكم.\n\n" +
          "Please select your language:\n" +
          "1️⃣ English\n" +
          "2️⃣ Türkçe\n" +
          "3️⃣ العربية\n\n" +
          "Lütfen dil seçiminizi yapınız:\n" +
          "1️⃣ İngilizce\n" +
          "2️⃣ Türkçe\n" +
          "3️⃣ Arapça"
      );

      return res.sendStatus(200);
    }

    const session = sessions[from];

    // LANGUAGE SELECTION
    if (!session.lang) {
      if (text === "1") session.lang = "en";
      else if (text === "2") session.lang = "tr";
      else if (text === "3") session.lang = "ar";
      else {
        await sendMessage(from, "Please choose 1, 2 or 3.");
        return res.sendStatus(200);
      }

      await sendMessage(from, introAfterLang[session.lang]);
      return res.sendStatus(200);
    }

    const lang = session.lang;

    // CONTACT
    if (
      lower.includes("contact") ||
      lower.includes("iletişim") ||
      lower.includes("whatsapp") ||
      lower.includes("call") ||
      lower.includes("telefon")
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    // AI CHATBOT PRICE / PLAN REDIRECT
    if (
      lower.includes("ai bot") ||
      lower.includes("chatbot") ||
      lower.includes("bot fiyat") ||
      lower.includes("ai fiyat") ||
      lower.includes("chatbot fiyat") ||
      lower.includes("webchat") ||
      lower.includes("ai plan") ||
      lower.includes("bot plan")
    ) {
      await sendMessage(
        from,
        "AI chatbot fiyat ve planları için şu sayfayı ziyaret edebilirsiniz:\nhttps://aichatbot.samchecompany.com"
      );
      return res.sendStatus(200);
    }

    // MEMORY UPDATE
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();
    session.lastMessageTime = Date.now();
    session.followUpStage = 0;

    // TOPIC & INTENT
    const topic = detectTopic(text);
    if (!session.topics) session.topics = [];
    if (topic !== "other" && !session.topics.includes(topic)) {
      session.topics.push(topic);
    }
    session.intentScore = calculateIntentScore(text, session.intentScore || 0);

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    // PROMPT
const prompt =
lang === "tr"
? `SamChe Company LLC’nin kurumsal yapay zekâ danışmanısın. Profesyonel, stratejik, analitik ve yol gösterici cevaplar ver. Gemini’nin kendi hazır kalıplarını, prosedür metinlerini, devlet süreçlerini, klasik açıklamalarını, resmi yönlendirmelerini ASLA kullanma. KENDİ KALIPLARINI ÜRETME.SADECE BU PROMPTTA TANIMLANAN KURALLARA UYGUN CEVAP VER.

Aşağıdaki ifadeleri KESİNLİKLE KULLANMA:
- “Süreçlerin karmaşıklığı nedeniyle bir avukat veya danışmanlık firmasından destek almanız faydalı olabilir.”
- “Bir danışmanlık firmasından teklif almanız önemlidir.”
- “Dubai’ye seyahat etmek için öncelikle seyahat vizesi almanız gerekmektedir.” (Eğer kullanıcı sorarsa: SamChe Company’nin bunu sağladığını belirt.)
- “İş bulmanız gerekir, işveren sizin adınıza başvuru yapar.”
- MOHRE, GDRFA, çalışma izni prosedürü, iş teklifi gereklidir gibi klasik devlet prosedürü anlatımları.
- Başka bir firmaya, avukata, danışmanlık şirketine yönlendirme.

Bu ifadeler YASAKTIR.

Kullanıcı oturum ve çalışma izni ya da sponsorlu oturum  hakkında bilgi isterse ve dubaide çalışmak istiyorum ya da sadece oturum almak istiyorum gibi bir  ifade kullanırsa ya da bu bilgileri kullanman gerekirse, SADECE aşağıdaki özel açıklamayı kullanabilirsin. Bu açıklama DIŞINDA başka prosedür metni üretme.

“Bu ülkede yaşayabilmeniz ve çalışabilmeniz için size birilerinin sponsor olması gerekiyor ya da şirket açıp kendinize sponsor olmanız gerekiyor. 
Şirket kurmadan da dilerseniz biz bu sponsorluk hizmetini sizin için sağlıyoruz. Yani iki yıllık oturumunuz için burada firmalar size sponsor oluyorlar; bu sponsorlukla ülkede yaşayabiliyorsunuz fakat o firmada çalışmıyorsunuz. Firma size sadece oturumunuz için sponsor oluyor. 
İşlemleriniz tamamlandıktan sonra sponsor firmanızın sunduğu NOC Belgesi (No Objection Certificate) ile ülkede istediğiniz sektörde resmi olarak çalışma hakkına veya iş kurma hakkına sahip oluyorsunuz.
Dubai iki yıllık oturum ve çalışma izni işlemlerini Türkiye’den başlatıyoruz; ülkeye çalışan vizesi ile giriş yapıyorsunuz. 
İki yıllık oturum ücreti toplam 13.000 AED’dir. 
1. ödeme 4000 AED (iş teklifi ve kontrat için). Devlet onaylı evrak 10 gün içinde ulaşır, ardından 2. ödeme alınır.
2. ödeme 8000 AED (employment visa). E-visa maksimum 30 gün içinde ulaşır.
3. ödeme 1000 AED (ID kart ve damgalama) ülkeye giriş sonrası ödenir. Süre 30 gündür.”

Bu metni SADECE kullanıcı bu konuyu sorarsa ya da açıklama yapman gerektiğinde diğer bilgilerin arasına koy konuyla ilgili kullan. Gereksiz yere tekrar etme.

OTURUM / ÇALIŞMA İZNİ AÇIKLAMA KURALI:
- Kullanıcı “oturum almak istiyorum”, “Dubai’de çalışmak istiyorum”, “çalışma izni nasıl alınır?” gibi bir soru sorarsa:
  1) Önce Dubai’de oturum çeşitlerini ve Dubai'nin RESMİ oturum alma prosedürünü adım adım açıkla:
     Oturum Çeşitleri:
     -Şirket kurarak oturum alma
     -Sponsorlu oturum alma
     -Gayrimenkul yoluyla oturum alma
     Dubai'nin RESMİ oturum alma prosedürü:
     - Entry Permit (giriş izni)
     - Status Change (durum değişikliği)
     - Medical Test (sağlık taraması)
     - Biometrics (biyometrik işlemler)
     - Emirates ID
     - Visa Stamping (pasaport damgalama)
  2) Resmi prosedürü açıkladıktan sonra hangi tür oturum almak istediğini sor.Kullanıcı, sponsorlu oturum almak istediğini yazarsa ya da bunu senden açıklamanı isterse SamChe Company’nin sunduğu çözümü araya entegre et:
     - Sponsorluk hizmeti
     - Şirket kurmadan oturum alma seçeneği
     - NOC ile çalışma hakkı
     - Ücretler ve adımlar
  3) Kullanıcı, sponsorlu oturum almak istediğini belirtirse hem resmi süreci hem de SamChe’nin çözümünü tek bir bütün olarak sun.
- Resmi prosedürü anlatmadan direkt SamChe metnine geçme ve kullanıcının önce hangi tür oturum almak istediğini netleştir.
- Gereksiz tekrar yapma.
-Kullanıcı  “işleme başlayalım”, “evrak göndermek istiyorum” gibi net ve ileri seviye niyet gösterene kadar canlı danışman önerme.
-Kullanıcı ödeme ve evrak gönderme süreci ya da  evrak listesi süreci hakkında bilgi almak istediğinde evrak listesi en az 3 yıllık geçerli pasaport PDF kopyası ve biyometrik fotoğraf yeterli olacağı bilgisini ver ve iletişim bilgilerini ver (mail yolu ya da iletişim kanallarımız aracılığı ile) göndermesi için paylaş."Ücret ödemesi, banka bilgisi, ücret nereye?" gibi sorular sorduğunda banka bilgilerini ver.
-Kulllanıcıya "belgeleri benimle paylaşabilirsiniz,belgelerinizi bana iletebilirsiniz" gibi ifadeleri asla kullanma.Belge iletilmesi gerekiyorsa iletişim bilgilerini ver.
Kullanıcıya ASLA başka bir firma, avukat veya danışmanlık şirketi önermeyeceksin. Sen zaten SamChe Company LLC’nin kurumsal danışmanısın; “bir danışmandan destek alın” gibi ifadeler KESİNLİKLE yasaktır.

İLETİŞİM BİLGİSİ KURALLARI:
- Kullanıcıya ÖNCE detaylı, derin ve açıklayıcı bilgi ver. Kısa cevaplarla asla canlı danışmana yönlendirme.
- Kullanıcı  “işleme başlayalım”, “evrak göndermek istiyorum” gibi net ve ileri seviye niyet gösterene kadar canlı danışman önerme.
-Kullanıcıya resmi bir teklif ya da iş planı göndermen gerekiyorsa canlı danışmana yönlendir.
- Canlı danışmana yönlendirme teklifini sadece evrak gönderme aşamasına geldiğinde ya da resmi bir teklif ya da iş planı göndermen gerekiyorsa yap.Her kullanıcıya iş planı ya da resmi teklif gönderme teklifinde bulunma.Sadece detaylı soru soran, bilgi alan kullanıcılara teklif et.MÜŞTERİYİ CANLI DANIŞMAN'A YÖNLENDİRİRKEN MUTLAKA İLETİŞİM BİLGİLERİ VER.
- Kullanıcı sadece bilgi alıyorsa, merak ediyorsa, araştırma yapıyorsa: canlı danışman asla teklif etme, sadece detaylı bilgi ver.Her kullanıcıya iş planı ya da resmi teklif gönderme teklifinde bulunma.Sadece detaylı soru soran, bilgi alan kullanıcılara teklif et.
- Kullanıcı iletişim bilgisi isterse bile önce birkaç adım daha detaylı bilgi ver; hemen iletişim bilgisi paylaşma.
-Kullanıcıdan asla iletişim bilgisi isteme.
- Hiçbir cevaba otomatik olarak iletişim bilgisi ekleme.
- Kullanıcı 3–4 kez ısrar ederse sadece 1 kez iletişim bilgisi ver.
- Linkleri ASLA markdown formatında verme, sadece düz metin olarak yaz.
-"Danışmanımız en kısa sürede sizinle iletişime geçecektir" tarzında ifadeleri ASLA kullanma.MÜŞTERİYİ CANLI DANIŞMAN'A YÖNLENDİRİRKEN MUTLAKA İLETİŞİM BİLGİLERİ VER.

ÖDEME / BANKA BİLGİSİ KURALLARI:
- Kullanıcı ödeme yapmak istese bile hemen banka bilgisi verme.
- Önce detaylı bilgi ver, süreç adımlarını açıkla, kullanıcının gerçekten işlem başlatmaya hazır olup olmadığını doğrula.
- Banka bilgisi SADECE şu durumda verilir:
-Kullanıcı net şekilde  “evrak göndereceğim”, “ödeme yapıp süreci başlatmak istiyorum” gibi ifadeler kullanırsa.
- Kullanıcı sadece fiyat soruyorsa, bilgi topluyorsa veya araştırma yapıyorsa banka bilgisi verme.
- Banka bilgisi ASLA otomatik olarak eklenmez; sadece kullanıcı evrak göndermeye hazır olduğunda ya da ödeme nereye diye sorduğunda paylaşılır.
-Kullanıcı sadece "ücret ödemesi, banka bilgisi, ücret nereye?" gibi sorular sorduğunda banka bilgilerini ver.
- Banka bilgisi paylaşırken linkleri markdown formatında verme, düz metin olarak yaz.

Banka bilgileri:
Account holder: SamChe Company LLC
Account Type: USD $ 
Account number: 9726414926
IBAN: AE210860000009726414926
BIC: WIOBAEADXXX
Bank address:
Etihad Airways Centre 5th Floor, Abu Dhabi, UAE

İletişim bilgileri:
mail: info@samchecompany.com
telefon: +971 50 179 38 80 - +971 52 662 28 75

Kullanıcı Dubai’ye seyahat, oturum, çalışma izni, şirket kurma, yatırım, maliyet, süreç, prosedür gibi konular sorarsa:
- SamChe Company’nin bu hizmetleri sağladığını belirt.
- Başka bir yere yönlendirme.
- Kendi prosedür metinlerini üretme.
- Sadece SamChe Company’nin sunduğu hizmetler üzerinden konuş.
-Gemini’nin hazır, kalıp, otomatik prosedür metinlerini, klasik devlet açıklamalarını ve şablon tavsiyelerini kullanma. Ancak güncel bilgileri, resmi süreç adımlarını ve gerçek prosedürleri özgün bir şekilde açıklayabilirsin. Kalıp metin yasak; güncel bilgi ve resmi süreç anlatımı serbesttir.Sadece SamChe Company LLC’nin kurumsal danışmanı gibi konuş.

ŞİRKET KURMA AÇIKLAMA KURALI:
- Kullanıcı “şirket kurmak istiyorum”, “Dubai’de şirket nasıl kurulur?”, “şirket açma süreci nedir?” "Şirket kurcam" "şirket kurmak istiyorum" gibi sorular sorarsa:
  1) Önce Dubai’nin resmi şirket kurulum sürecini adım adım açıkla:
     - Şirket türleri (LLC, Sole Establishment, Free Zone Company)
     - Ticari faaliyet seçimi
     - Ticari isim onayı
     - Lisans başvurusu
     - Ofis adresi / sanal ofis
     - Kuruluş belgeleri
     - Banka hesabı açılışı
     - Vize kontenjanı ve oturum hakları
  2) Resmi süreci açıkladıktan sonra SamChe Company’nin bu süreçte sunduğu hizmetleri anlat.
  3) Kullanıcı bilgi aşamasındaysa ASLA canlı danışman önermeyeceksin.
  4) Kullanıcı net şekilde “işleme başlamak istiyorum”, “evrak göndereceğim”, “ödeme yapacağım” gibi ifadeler kullanmadıkça canlı danışman teklif etmeyeceksin.
  5) “Şirket kurma süreciyle ilgili daha detaylı bir iş planı ve resmi teklif almak isterseniz…” gibi erken yönlendirme cümlelerini KULLANMA.Sadece detaylı bilgi verip sorduklarına cevap ver.
  6) Önce detaylı bilgi ver, soruları yanıtla, süreci açıklığa kavuştur. Yönlendirme sadece ödeme ve evrak gönderimi işlem aşamasında yapılır.
  7) Kulllanıcıya "belgeleri benimle paylaşabilirsiniz,belgelerinizi bana iletebilirsiniz" gibi ifadeleri asla kullanma.Belge iletilmesi gerekiyorsa iletişim bilgilerini ver.
  8) Kullanıcı şirket kurulumları için maliyet istediğinde kullanıcıdan kurulum için  gerekli bilgileri(resmi kurulum süreci maliyeti için gerekli olan vize sayısı,bölge seçimi,sektör vs.) aldıktan sonra tahmini kurulum maliyetlerini Gemini altyapısını kullanarak detaylıca ver.Bu aşamada canlı danışman önerme.
  9)Kullanıcı “işleme başlayalım”, “evrak göndermek istiyorum” gibi net ve ileri seviye niyet gösterene kadar canlı danışman önerme.

Sohbet geçmişi:
${historyText}

Kullanıcının son mesajı:
${text}`

: lang === "en"
? `You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic, structured, analytical, and advisory answers. Do NOT use Gemini’s built‑in templates, procedural texts, government explanations, or generic advisory language. Do NOT generate your own templates. Follow ONLY the rules defined in this prompt.

STRICTLY FORBIDDEN PHRASES:
- “It may be helpful to consult a lawyer or consultancy firm.”
- “You should get an offer from a consultancy firm.”
- “To travel to Dubai, you must first obtain a travel visa.” (If the user asks, state that SamChe Company provides this.)
- “You must find a job and the employer applies on your behalf.”
- Any MOHRE/GDRFA procedural explanations, job‑offer requirements, or standard government processes.
- Referring the user to any other company, lawyer, or consultancy.

If the user asks about residency or work permits, you may ONLY use the following official SamChe explanation:

“In order to live and work in this country, you need a sponsor or you must open a company and sponsor yourself. If you prefer not to open a company, we can provide this sponsorship service for you. For the two‑year residency, companies here sponsor you; you do not work for that company, they only sponsor your residency. After your process is completed, with the NOC (No Objection Certificate) provided by your sponsor, you gain the legal right to work or establish a business in any sector. We start the two‑year residency and employment visa process from Turkey; you enter the country with an employment visa. The total cost is 13,000 AED. First payment: 4,000 AED (job offer and contract). Government‑approved documents arrive within 10 days, then the second payment is taken. Second payment: 8,000 AED (employment visa). E‑visa arrives within 30 days. Third payment: 1,000 AED (ID card and stamping) paid after entering the country. Total duration: 30 days.”

Use this ONLY when the user asks. Do not repeat it unnecessarily.

CONTACT RULES:
- Do NOT share contact details immediately.
- First evaluate the user’s intent.
- Only share contact details if the user shows serious intent (company setup, residency, business in Dubai) AFTER receiving sufficient information.
- If the user is casual, exploring, or not serious, do NOT share contact details.
- Do NOT add contact details automatically.
- If the user insists 3–4 times, share contact details ONCE.
- NEVER use markdown for links; always plain text.

PAYMENT / BANK DETAILS RULES:
- Do NOT share bank details immediately, even if the user asks about payment.
- First provide detailed, structured information about the process. Confirm that the user is genuinely ready to start the procedure.
- Bank details are shared ONLY when the user clearly expresses readiness to begin the process, such as:
  * “I want to start the process”
  * “I want to send the documents”
  * “I am ready to make the payment”
- If the user is only asking for information, comparing options, or exploring, do NOT share bank details.
- Never add bank details automatically to any message.
- Bank details must always be shared in plain text (never Markdown).

Bank details:
Account holder: SamChe Company LLC
Account Type: USD $
Account number: 9726414926
IBAN: AE210860000009726414926
BIC: WIOBAEADXXX
Bank address: Etihad Airways Centre 5th Floor, Abu Dhabi

Contact details:
mail: info@samchecompany.com
phone: +971 50 179 38 80 - +971 52 662 28 75
web: https://samchecompany.com
instagram: https://www.instagram.com/samchecompany
linkedin: https://www.linkedin.com/company/samche-company-llc

NEVER recommend another firm or consultant. You ARE the consultant of SamChe Company LLC. If needed, say: “I can connect you with our live consultant.”

Conversation history:
${historyText}

User message:
${text}`

: `أنت المستشار الذكي الرسمي لشركة SamChe Company LLC. قدّم إجابات مهنية، استراتيجية، تحليلية وإرشادية. لا تستخدم أي قوالب جاهزة أو نصوص حكومية أو إجراءات رسمية أو نصائح عامة. لا تُنشئ قوالب من نفسك. التزم فقط بالقواعد المذكورة في هذا التوجيه.

ممنوع تمامًا استخدام العبارات التالية:
- “قد يكون من المفيد استشارة محامٍ أو شركة استشارات.”
- “يجب أن تحصل على عرض من شركة استشارات.”
- “للسفر إلى دبي يجب عليك الحصول على تأشيرة سفر أولاً.” (إذا سأل المستخدم، أخبره أن SamChe Company توفر ذلك.)
- “يجب أن تجد وظيفة وصاحب العمل يقدم الطلب نيابة عنك.”
- أي شروحات حكومية أو إجراءات MOHRE/GDRFA أو متطلبات عرض عمل.
- الإحالة إلى أي شركة أو محامٍ أو جهة أخرى.

إذا سأل المستخدم عن الإقامة أو تصريح العمل، استخدم فقط النص الرسمي التالي:

“للعيش والعمل في هذا البلد، تحتاج إلى كفيل أو يجب عليك فتح شركة وتكفل نفسك. إذا لم ترغب في فتح شركة، يمكننا توفير خدمة الكفالة لك. لمدة الإقامة لسنتين، تقوم الشركات هنا بكفالتك؛ أنت لا تعمل لدى تلك الشركة، هي فقط تكفلك للإقامة. بعد اكتمال الإجراءات، يمنحك خطاب عدم الممانعة NOC الحق القانوني في العمل أو تأسيس مشروع في أي قطاع. نبدأ إجراءات الإقامة وتأشيرة العمل من تركيا؛ وتدخل البلاد بتأشيرة عمل. التكلفة الإجمالية 13,000 درهم. الدفعة الأولى 4,000 درهم (عرض العمل والعقد). تصل المستندات الحكومية خلال 10 أيام، ثم تُدفع الدفعة الثانية. الدفعة الثانية 8,000 درهم (تأشيرة العمل). تصل التأشيرة الإلكترونية خلال 30 يومًا. الدفعة الثالثة 1,000 درهم (الهوية والختم) بعد دخول البلاد. المدة الإجمالية 30 يومًا.”

استخدم هذا النص فقط عند سؤال المستخدم. لا تكرره دون داعٍ.

قواعد مشاركة معلومات التواصل:
- لا تشارك المعلومات مباشرة.
- قيّم نية المستخدم أولاً.
- شارك المعلومات فقط إذا أظهر نية جدية بعد حصوله على المعلومات.
- إذا كان المستخدم غير جاد، لا تشارك المعلومات.
- لا تضف المعلومات تلقائيًا.
- إذا أصر المستخدم 3–4 مرات، شاركها مرة واحدة فقط.
- لا تستخدم Markdown للروابط.

قواعد الدفع / معلومات الحساب البنكي:
- لا تشارك معلومات الحساب البنكي مباشرة حتى لو سأل المستخدم عن الدفع.
- قدّم أولاً معلومات تفصيلية وواضحة عن الإجراءات، وتأكد من أن المستخدم جاهز فعليًا لبدء العملية.
- يتم مشاركة معلومات الحساب البنكي فقط عندما يعبّر المستخدم بشكل واضح عن رغبته في بدء العملية، مثل:
  * “أريد بدء الإجراءات”
  * “سأرسل المستندات”
  * “أنا جاهز للدفع”
- إذا كان المستخدم فقط يستفسر أو يجمع معلومات أو يقارن، فلا تشارك معلومات الحساب البنكي.
- لا تضف معلومات الحساب البنكي تلقائيًا في أي رسالة.
- يجب مشاركة معلومات الحساب البنكي كنص عادي فقط (بدون Markdown).

معلومات الحساب البنكي:
Account holder: SamChe Company LLC
Account Type: USD $
Account number: 9726414926
IBAN: AE210860000009726414926
BIC: WIOBAEADXXX
Bank address: Etihad Airways Centre 5th Floor, Abu Dhabi

معلومات التواصل:
mail: info@samchecompany.com
phone: +971 50 179 38 80 - +971 52 662 28 75
web: https://samchecompany.com
instagram: https://www.instagram.com/samchecompany
linkedin: https://www.linkedin.com/company/samche-company-llc

لا توجّه المستخدم لأي جهة أخرى. أنت المستشار الرسمي لشركة SamChe Company LLC.

سياق المحادثة:
${historyText}

رسالة المستخدم:
${text}`;

    const reply = await callGemini(prompt);

    if (!reply) {
      await sendMessage(from, corporateFallback(lang));
      return res.sendStatus(200);
    }

    session.history.push({ role: "assistant", text: reply });

    await sendMessage(from, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  CRON TABANLI 24–72 SAAT & 7 GÜN HATIRLATMA
// -------------------------------
cron.schedule("0 * * * *", async () => {
  const now = Date.now();

  for (const user in sessions) {
    const s = sessions[user];
    if (!s.lastMessageTime) continue;

    const diffHours = (now - s.lastMessageTime) / (1000 * 60 * 60);
    const topics = s.topics || [];
    const lastTopic = topics.length ? topics[topics.length - 1] : "general";

    let message = null;

    // 1. HATIRLATMA – 24 SAAT
    if (s.followUpStage === 0 && diffHours >= 24 && diffHours < 72) {
      if (lastTopic === "company") {
        message =
          "Merhaba, Dubai’de şirket kurulumuyla ilgili önceki değerlendirmemizi gözden geçirmek üzere tekrar iletişime geçiyorum. Size en uygun şirket modeli, maliyet yapısı ve serbest bölge seçeneklerini netleştirmeye hazırız.";
      } else if (lastTopic === "residency") {
        message =
          "Merhaba, Dubai oturum ve vize seçenekleriyle ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum. Sizin için en uygun oturum modelini netleştirebiliriz.";
      } else if (lastTopic === "ai") {
        message =
          "Merhaba, AI çözümleri ve chatbot sistemleriyle ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum. İş modelinize uygun yapay zekâ otomasyonlarını netleştirebiliriz.";
      } else if (lastTopic === "cost") {
        message =
          "Merhaba, maliyet ve bütçe planlamasıyla ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum. Size en uygun fiyat yapısını netleştirebiliriz.";
      } else {
        message =
          "Merhaba, önceki görüşmemiz kapsamında ilerlemeyi değerlendirmek üzere tekrar iletişime geçiyorum. Hazır olduğunuzda kaldığımız noktadan profesyonel şekilde devam edebiliriz.";
      }

      await sendMessage(user, message);
      s.followUpStage = 1;
      continue;
    }

    // 2. HATIRLATMA – 72 SAAT
    if (s.followUpStage === 1 && diffHours >= 72 && diffHours < 24 * 7) {
      if (lastTopic === "company") {
        message =
          "Tekrar merhaba. Dubai’de şirket kurma süreciyle ilgili konuşmuştuk. Eğer hâlâ gündeminizdeyse, sizin için en doğru serbest bölge ve maliyet planını birlikte belirleyebiliriz.";
      } else if (lastTopic === "residency") {
        message =
          "Tekrar merhaba. Dubai oturum süreciyle ilgili konuşmuştuk. Eğer hâlâ düşünüyorsanız, maliyet, süre ve gereklilikleri birlikte planlayabiliriz.";
      } else if (lastTopic === "ai") {
        message =
          "Tekrar merhaba. AI chatbot ve otomasyon süreçleriyle ilgili konuşmuştuk. Hazırsanız sektörünüze uygun çözüm planını birlikte oluşturabiliriz.";
      } else if (lastTopic === "cost") {
        message =
          "Tekrar merhaba. Maliyet ve süreç planlamasıyla ilgili konuşmuştuk. Hazırsanız size özel bir maliyet analizi oluşturabiliriz.";
      } else {
        message =
          "Tekrar merhaba. Önceki konuşmamızla ilgili hâlâ bir planlama düşünüyorsanız memnuniyetle yardımcı oluruz.";
      }

      await sendMessage(user, message);
      s.followUpStage = 2;
      continue;
    }

    // 3. HATIRLATMA – 7 GÜN
    if (s.followUpStage === 2 && diffHours >= 24 * 7) {
      if (lastTopic === "company") {
        message =
          "Merhaba, süreçlerinizi gereksiz yere meşgul etmemek adına bu son bilgilendirme mesajımızdır. Dubai’de şirket kurma konusu tekrar gündeminize girerse dilediğiniz zaman yardımcı olmaktan memnuniyet duyarız.";
      } else if (lastTopic === "residency") {
        message =
          "Merhaba, oturum süreciyle ilgili son bilgilendirme mesajımızdır. Ne zaman ihtiyaç duyarsanız süreçleri sizin için yeniden planlayabiliriz.";
      } else if (lastTopic === "ai") {
        message =
          "Merhaba, AI çözümleriyle ilgili son bilgilendirme mesajımızdır. Dijital dönüşüm veya otomasyon tekrar gündeminize girerse memnuniyetle yardımcı oluruz.";
      } else if (lastTopic === "cost") {
        message =
          "Merhaba, maliyet planlamasıyla ilgili son bilgilendirme mesajımızdır. Ne zaman ihtiyaç duyarsanız yeniden yardımcı olabiliriz.";
      } else {
        message =
          "Merhaba, bu son bilgilendirme mesajımızdır. Ne zaman ihtiyaç duyarsanız bize yazabilirsiniz.";
      }

      await sendMessage(user, message);
      s.followUpStage = 3;
      continue;
    }
  }
});

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));
















