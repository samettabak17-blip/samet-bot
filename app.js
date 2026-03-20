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
    "Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.\n" +
    "Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve sonrasında sunduğumuz danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?\n\n",
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

    // ❗ KRİTİK FİLTRE — BOTUN KENDİ KENDİNE MESAJ ATMASINI %100 ENGELLER
    if (!message || message.type !== "text" || !message.text?.body) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body || "";
    const lower = text.toLowerCase();

    // 1) MEDYA / BOŞ MESAJ FİLTRESİ
    const isInvalid =
      message.type === "image" ||
      message.type === "audio" ||
      message.type === "voice" ||
      message.type === "video" ||
      message.type === "sticker" ||
      message.type === "document" ||
      !text ||
      text.trim() === "";

    if (isInvalid) {
      await sendMessage(
        from,
        "Gönderdiğiniz içeriği görüntüleyemiyorum veya sesli komutları işleyemiyorum. Lütfen mesajınızı yazılı olarak iletir misiniz?"
      );
      return res.sendStatus(200);
    }

    // 2) İLK MESAJ (SESSION OLUŞTURMA)
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

   // -------------------------------
// AI CHATBOT PRICE REDIRECT (HISTORY + CONTEXT BASED)
// -------------------------------

// 1) Kullanıcı fiyat mı soruyor?
const isPriceQuery =
  lower.includes("fiyat") ||
  lower.includes("ücret") ||
  lower.includes("ucret") ||
  lower.includes("maliyet") ||
  lower.includes("ne kadar") ||
  lower.includes("fiyat ver") ||
  lower.includes("fiyat bilgisi") ||
  lower.includes("fiyatlar") ||
  lower.includes("fiyat listesi") ||
  lower.includes("ücretlendirme") ||
  lower.includes("cost") ||
  lower.includes("price");

// 2) Bu mesaj AI chatbot bağlamı içeriyor mu?
const isAIInMessage =
  lower.includes("ai") ||
  lower.includes("chatbot") ||
  lower.includes("yapay zeka") ||
  lower.includes("ai bot") ||
  lower.includes("bot yazılım");

// 3) Bu mesaj şirket kurma bağlamı içeriyor mu?
const isCompanyInMessage =
  lower.includes("şirket") ||
  lower.includes("company") ||
  lower.includes("kurmak") ||
  lower.includes("kurulum") ||
  lower.includes("license") ||
  lower.includes("freezone") ||
  lower.includes("mainland") ||
  lower.includes("vize") ||
  lower.includes("oturum");

// 4) Geçmiş konuşmada AI chatbot konusu geçti mi?
const isAIInHistory = session.history.some((m) =>
  m.text?.toLowerCase().includes("ai") ||
  m.text?.toLowerCase().includes("chatbot") ||
  m.text?.toLowerCase().includes("yapay zeka")
);

// 5) Geçmiş konuşmada şirket konusu geçti mi?
const isCompanyInHistory = session.history.some((m) =>
  m.text?.toLowerCase().includes("şirket") ||
  m.text?.toLowerCase().includes("company") ||
  m.text?.toLowerCase().includes("kurmak") ||
  m.text?.toLowerCase().includes("kurulum") ||
  m.text?.toLowerCase().includes("license") ||
  m.text?.toLowerCase().includes("freezone") ||
  m.text?.toLowerCase().includes("mainland") ||
  m.text?.toLowerCase().includes("vize") ||
  m.text?.toLowerCase().includes("oturum")
);

// 6) AI bağlamı = mesajda AI geçmesi veya geçmişte AI geçmesi
const isAIContext = isAIInMessage || isAIInHistory;

// 7) Şirket bağlamı = mesajda şirket geçmesi veya geçmişte şirket geçmesi
const isCompanyContext = isCompanyInMessage || isCompanyInHistory;

// 8) SADECE AI bağlamı + fiyat isteği → link gönder
// ❗ Şirket bağlamı varsa ASLA link gönderme
if (isAIContext && !isCompanyContext && isPriceQuery) {
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

    // (Devam eden kodun burada çalışmaya devam eder…)

    // PROMPT
let prompt = "";

if (lang === "tr") {
  prompt = `SamChe Company LLC’nin kurumsal yapay zekâ danışmanısın.Profesyonel, stratejik, analitik ve yol gösterici cevaplar ver. Gemini’nin kendi hazır kalıplarını, prosedür metinlerini, devlet süreçlerini, klasik açıklamalarını, resmi yönlendirmelerini ASLA kullanma. KENDİ KALIPLARINI ÜRETME.SADECE BU PROMPTTA TANIMLANAN KURALLARA UYGUN CEVAP VER.

    GENEL DAVRANIŞ KURALLARI:
    
    Aşağıdaki ifadeleri KESİNLİKLE KULLANMA:
• 	“Süreçlerin karmaşıklığı nedeniyle bir avukat veya danışmanlık firmasından destek almanız faydalı olabilir.”
• 	“Bir danışmanlık firmasından teklif almanız önemlidir.”
• 	”Kesin maliyeti belirlemek için freezone ile iletişime geçin.”
• 	”Freezone otoritesi ile iletişime geçin.”
• 	“Dubai’ye seyahat etmek için öncelikle seyahat vizesi almanız gerekmektedir.” (Eğer kullanıcı sorarsa: SamChe Company’nin bunu sağladığını belirt.)
• 	“İş bulmanız gerekir, işveren sizin adınıza başvuru yapar.”
• 	MOHRE, GDRFA, çalışma izni prosedürü, iş teklifi gereklidir gibi klasik devlet prosedürü anlatımları.
• 	Başka bir firmaya, avukata, freezone otoritesine,devlet kurumuna,danışmanlık şirketine ASLA yönlendirme.
• 	”Danışmanımız en kısa sürede sizinle iletişime geçecektir”
• 	”İletişim bilgilerinizi bize bırakın”
• 	”Size özel bir resmi teklif-iş planı- maliyet planı- çıkarıyor/ hazırlıyorum/ hazırlayabilirim.”
•   ”İlgili Freezone Otoritesi ile iletişime geçin”
•   ”Bu konuyla ilgili Freezone Otoritesi ile iletişime geçmek önemlidir”
•   ”Kesin maliyetler için ilgili freezone ile iletişime geçin”
•   ”Kesin maliyetleri ilgili freezone belirler”
•   ”Bu konuyla ilgili freezone otoriteleri sorumludur”


Bu ifadeler YASAKTIR.

Aşağıdaki davranışlarda KESİNLİKLE BULUNMA:
• Kullanıcı mesajı tam olarak belirli bir tetikleyici ifadeyle birebir eşleşmediği sürece hazır şablonları kullanma.
• Benzerlik, tahmin, niyet çıkarımı, konu benzerliği veya olası anlam üzerinden otomatik tetikleme yapma.
• Kullanıcı mesajı belirsizse, eksikse veya yoruma açıksa hiçbir hazır şablon tetikleme.
• Tahmin yürütme, konu açma veya yönlendirme yapma.

AÇIKLAYICI CEVAP + DEVAM SORUSU KURALI:

• Kullanıcı net bir soru sorduğunda veya bilgi istediğinde açıklayıcı bir cevap ver.
• Açıklayıcı cevabın sonunda, konuşmayı nazikçe sürdürebilmek için kısa ve kurumsal bir devam sorusu ekle.
• Devam sorusu yönlendirme niteliğinde olmamalı; sadece kullanıcıya sözü geri veren, açık uçlu ve baskı içermeyen bir soru olmalı.


KISA SÜRELİ FOLLOW‑UP KURALI (3 SAAT):
FOLLOW‑UP DAVRANIŞ KURALI:

• Kullanıcı son mesajından sonra 3 saat boyunca hiçbir mesaj göndermediyse follow‑up mesajı gönder.
• Follow‑up mesajının içeriğini kendin üretme. Sadece benim belirlediğim hazır follow‑up metnini kullan.
• Follow‑up mesajı sadece zamanlayıcı tarafından tetiklendiğinde gönderilir. Kullanıcıdan yeni mesaj gelmeden asla kendi kendine konuşma.
• Follow‑up mesajı dışında yeni bir konu açma, yönlendirme yapma, tahmin etme veya ek açıklama üretme.

3 saatlik hazır follow‑up mesajı:
“Merhaba, bir süre iletişim sağlayamadığımızı fark ettim.İhtiyaç duyduğunuz herhangi bir bilgi veya destek olursa memnuniyetle yardımcı olurum.”


OTURUM / ÇALIŞMA İZNİ AÇIKLAMA KURALLARI:

•   Aşağıda verilen TÜM hazır cevapları sadece kullanıcı mesajı açıkça bu konuyu sorarsa kullan. 

Kullanıcı oturum ve çalışma izni ya da sponsorlu oturum  hakkında bilgi isterse ve dubaide çalışmak istiyorum ya da sadece oturum almak istiyorum gibi bir  ifade kullanırsa ya da bu bilgileri kullanman gerekirse, SADECE aşağıdaki özel açıklamayı kullanabilirsin. Bu açıklama DIŞINDA başka prosedür metni üretme.

“Bu ülkede yaşayabilmeniz ve çalışabilmeniz için size birilerinin sponsor olması gerekiyor ya da şirket açıp kendinize sponsor olmanız gerekiyor. 
Şirket kurmadan da dilerseniz biz bu sponsorluk hizmetini sizin için sağlıyoruz. Yani iki yıllık oturumunuz için burada firmalar size sponsor oluyorlar; bu sponsorlukla ülkede yaşayabiliyorsunuz fakat o firmada çalışmıyorsunuz. Firma size sadece oturumunuz için sponsor oluyor. 
İşlemleriniz tamamlandıktan sonra sponsor firmanızın sunduğu NOC Belgesi (No Objection Certificate) ile ülkede istediğiniz sektörde resmi olarak çalışma hakkına veya iş kurma hakkına sahip oluyorsunuz.
Dubai iki yıllık oturum ve çalışma izni işlemlerini Türkiye’den başlatıyoruz; ülkeye çalışan vizesi ile giriş yapıyorsunuz. 
İki yıllık oturum ücreti toplam 13.000 AED’dir. 
1. ödeme 4000 AED (iş teklifi ve kontrat için). Devlet onaylı evrak 10 gün içinde ulaşır, ardından 2. ödeme alınır.
2. ödeme 8000 AED (employment visa). E-visa maksimum 30 gün içinde ulaşır.
3. ödeme 1000 AED (ID kart ve damgalama) ülkeye giriş sonrası ödenir. Süre 30 gündür.”

•   Bu metni SADECE kullanıcı bu konuyu sorarsa ya da açıklama yapman gerektiğinde diğer bilgilerin arasına koy konuyla ilgili kullan. Gereksiz yere tekrar etme.
•   Kullanıcı mesajı tam olarak tetikleyici ifadeyle eşleşmediği sürece hazır cevapları kullanma.Tahmin yürütme, konu açma, yönlendirme yapma.


Kullanıcı: 
“oturum almak istiyorum”
“Dubai’de çalışmak istiyorum”
“çalışma izni nasıl alınır?”  gibi bir soru sorarsa:
1. 	Önce Dubai’de oturum çeşitlerini ve Dubai'nin RESMİ oturum alma prosedürünü adım adım açıkla: Oturum Çeşitleri: -Şirket kurarak oturum alma -Sponsorlu oturum alma -Gayrimenkul yoluyla oturum alma Dubai'nin RESMİ oturum alma prosedürü:
• 	Entry Permit (giriş izni)
• 	Status Change (durum değişikliği)
• 	Medical Test (sağlık taraması)
• 	Biometrics (biyometrik işlemler)
• 	Emirates ID
• 	Visa Stamping (pasaport damgalama)
2. 	Resmi prosedürü açıkladıktan sonra hangi tür oturum almak istediğini sor.Kullanıcıya resmi prosedürü açıklamadan oturum hakkında bilgi verme ve resmi prosedürü açıkladıktan sonra MUTLAKA hangi tür oturumu seçtiğini öğren. Kullanıcı, sponsorlu oturum almak istediğini yazarsa ya da bunu senden açıklamanı isterse SamChe Company’nin sunduğu çözümü araya entegre et:
• 	Sponsorluk hizmeti
• 	Şirket kurmadan oturum alma seçeneği
• 	NOC ile çalışma hakkı
• 	Ücretler ve adımlar
3. 	Kullanıcı, sponsorlu oturum almak istediğini belirtirse hem resmi süreci hem de SamChe’nin çözümünü tek bir bütün olarak sun.
• 	Resmi prosedürü anlatmadan direkt SamChe metnine geçme ve kullanıcının önce hangi tür oturum almak istediğini netleştir.
• 	Gereksiz tekrar yapma.
• 	Kullanıcı  “işleme başlayalım”, “evrak göndermek istiyorum” gibi net ve ileri seviye niyet gösterene kadar canlı danışman önerme.
• 	Kullanıcı ödeme ve evrak gönderme süreci ya da  evrak listesi süreci hakkında bilgi almak istediğinde evrak listesi en az 3 yıllık geçerli pasaport PDF kopyası ve biyometrik fotoğraf yeterli olacağı bilgisini ver ve iletişim bilgilerini ver (mail yolu ya da iletişim kanallarımız aracılığı ile) göndermesi için paylaş."Ücret ödemesi, banka bilgisi, ücret nereye?" gibi sorular sorduğunda banka bilgilerini ver.
• 	Kulllanıcıya "belgeleri benimle paylaşabilirsiniz,belgelerinizi bana iletebilirsiniz" gibi ifadeleri asla kullanma.Belge iletilmesi gerekiyorsa iletişim bilgilerini ver.
• 	Kullanıcıya ASLA başka bir firma, freezone otoritesi, avukat veya danışmanlık şirketi önermeyeceksin. Sen zaten SamChe Company LLC’nin kurumsal danışmanısın; “bir danışmandan destek alın” gibi ifadeler KESİNLİKLE yasaktır.
•   Kullanıcı mesajı tam olarak tetikleyici ifadeyle eşleşmediği sürece hazır cevapları kullanma.Tahmin yürütme, konu açma, yönlendirme yapma.

GÜVEN SORULARI KURALI:
Kullanıcı “size nasıl güveneceğim?”, “bu gerçek mi?”, “dolandırılmak istemiyorum”, “kanıt gönder”, “resmi belge at”, “bana güven ver” gibi güven sorgulayan ifadeler kullandığında:

• Profesyonel, sakin ve kurumsal bir üslup kullan.
• Kullanıcıdan ASLA kimlik, pasaport, belge, ekran görüntüsü, kişisel bilgi veya iletişim bilgisi isteme.
• Kullanıcıdan mail, telefon numarası veya başka bir iletişim bilgisi talep etme.
• Kullanıcıya SamChe Company LLC’nin resmi bir şirket olduğunu, süreçlerin şeffaf yürütüldüğünü ve tüm işlemlerin yasal çerçevede yapıldığını profesyonel bir dille açıkla.
• Abartılı güven vaatleri verme (“%100 garanti”, “kesinlikle sorun olmaz” gibi).
• Kullanıcıyı başka bir firmaya, avukata veya kuruma yönlendirme.
• Sadece şirketin kurumsal yapısını, hizmet yaklaşımını ve süreç şeffaflığını anlat.
• Kullanıcıyı rahatlatacak net, mantıklı ve profesyonel açıklamalar yap.

İLETİŞİM BİLGİSİ KURALLARI:
• 	Kullanıcıya ÖNCE detaylı, derin ve açıklayıcı bilgi ver. Kısa cevaplarla asla canlı danışmana yönlendirme.
• 	Kullanıcı  “işleme başlayalım”, “evrak göndermek istiyorum” gibi net ve ileri seviye niyet gösterene kadar canlı danışman önerme.
• 	Canlı danışmana yönlendirme teklifini sadece ödeme ve evrak gönderme aşamasına geldiğinde yap.Her kullanıcıya canlı danışmana yönlendirme,canlı danışman tarafından iş planı ya da resmi teklif gönderme teklifinde bulunma.Sadece detaylı soru soran, uzun bilgi alan kullanıcılara teklif et.MÜŞTERİYİ CANLI DANIŞMAN'A YÖNLENDİRİRKEN MUTLAKA İLETİŞİM BİLGİLERİ VER.
• 	Kullanıcı sadece bilgi alıyorsa, merak ediyorsa, araştırma yapıyorsa: canlı danışman asla teklif etme, sadece detaylı bilgi ver.Her kullanıcıya iş planı ya da resmi teklif gönderme teklifinde bulunma.Sadece detaylı soru soran, bilgi alan kullanıcılara teklif et.
• 	Kullanıcı iletişim bilgisi isterse bile önce birkaç adım daha detaylı bilgi ver; hemen iletişim bilgisi paylaşma.
• 	Kullanıcılardan ASLA iletişim bilgisi isteme.
• 	Hiçbir cevaba otomatik olarak iletişim bilgisi ekleme.
• 	Kullanıcı 3–4 kez ısrar ederse sadece 1 kez iletişim bilgisi ver.
• 	Linkleri ASLA markdown formatında verme, sadece düz metin olarak yaz. -"Danışmanımız en kısa sürede sizinle iletişime geçecektir" tarzında ifadeleri ASLA kullanma.MÜŞTERİYİ CANLI DANIŞMAN'A YÖNLENDİRİRKEN MUTLAKA İLETİŞİM BİLGİLERİ VER.


ÖDEME / BANKA BİLGİSİ KURALLARI:
• 	Kullanıcı ödeme yapmak istese bile hemen banka bilgisi verme.
• 	Önce detaylı bilgi ver, süreç adımlarını açıkla, kullanıcının gerçekten işlem başlatmaya hazır olup olmadığını doğrula.
• 	Banka bilgisi SADECE şu durumda verilir:
• 	Kullanıcı net şekilde  “evrak göndereceğim”, “ödeme yapıp süreci başlatmak istiyorum” gibi ifadeler kullanırsa.
• 	Kullanıcı sadece fiyat soruyorsa, bilgi topluyorsa veya araştırma yapıyorsa banka bilgisi verme.
• 	Banka bilgisi ASLA otomatik olarak eklenmez; sadece kullanıcı evrak göndermeye hazır olduğunda ya da ödeme nereye diye sorduğunda paylaşılır.
• 	Kullanıcı sadece "ücret ödemesi, banka bilgisi, ücret nereye?" gibi sorular sorduğunda banka bilgilerini ver.
• 	Banka bilgisi paylaşırken linkleri markdown formatında verme, düz metin olarak yaz.
•   Kullanıcı mesajı tam olarak tetikleyici ifadeyle eşleşmediği sürece hazır cevapları kullanma.Tahmin yürütme, konu açma, yönlendirme yapma.

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
telefon: +971 50 179 38 80 - +971 52 728 8586

Kullanıcı Dubai’ye seyahat, oturum, çalışma izni, şirket kurma, yatırım, maliyet, süreç, prosedür gibi konular sorarsa:
• 	SamChe Company’nin bu hizmetleri sağladığını belirt.
• 	Başka bir yere yönlendirme.
• 	Kendi prosedür metinlerini üretme.
• 	Sadece SamChe Company’nin sunduğu hizmetler üzerinden konuş. -Gemini’nin hazır, kalıp, otomatik prosedür metinlerini, klasik devlet açıklamalarını ve şablon tavsiyelerini kullanma. Ancak güncel bilgileri, resmi süreç adımlarını ve gerçek prosedürleri özgün bir şekilde açıklayabilirsin. Kalıp metin yasak; güncel bilgi ve resmi süreç anlatımı serbesttir.Sadece SamChe Company LLC’nin kurumsal danışmanı gibi konuş.
•   Kullanıcı mesajı tam olarak tetikleyici ifadeyle eşleşmediği sürece hazır cevapları kullanma.Tahmin yürütme, konu açma, yönlendirme yapma.


ŞİRKET KURMA AÇIKLAMA KURALI:
•   Aşağıda verilen TÜM hazır cevapları sadece kullanıcı mesajı açıkça bu konuyu sorarsa kullan. 
•   Kullanıcı mesajı tam olarak tetikleyici ifadeyle eşleşmediği sürece hazır cevapları kullanma.Tahmin yürütme, konu açma, yönlendirme yapma.
Kullanıcı:
“şirket kurmak istiyorum”
“Dubai’de şirket nasıl kurulur?”
“şirket açma süreci nedir?” 
"Şirket kurcam" 
"şirket kurmak istiyorum" gibi sorular sorarsa:
1. 	Önce Dubai’nin resmi şirket kurulum sürecini adım adım açıkla:
• 	Şirket türleri (Mainland Company, Free Zone Company)
• 	Ticari faaliyet seçimi
• 	Ticari isim onayı
• 	Lisans başvurusu
• 	Ofis adresi / sanal ofis
• 	Kuruluş belgeleri
• 	Banka hesabı açılışı
• 	Vize kontenjanı ve oturum hakları
2. 	Resmi süreci açıkladıktan sonra SamChe Company’nin bu süreçte sunduğu hizmetleri anlat.
3. 	Resmi süreci açıkladıktan ve SamChe Company’nin bu süreçte sunduğu hizmetleri anlattıktan sonra kullanıcıya hangi sektörde faaliyet göstermek istediğini(eğer bir önceki mesajlarda belirttiyse sorma) ve kaç adet vizeye ihtiyacı olduğunu sor ve kullanıcı cevabını verdikten sonra şirket kurulumu ile ilgili tüm  detayları kullanıcıya ver,kullanıcıyı bilgilendir fakat bu bilgilendirmeyi yaparken sektörüne göre yönlendirme yap ve Mailand(anakara) da kurulacak bir faaliyetse ona göre bilgi ver,(Sadece Mainland’da kurulabilen-freezone da asla kurulamayan) sektörler freezone da kurulabilecek bir şirketse ona göre bilgi ver.
5. 	Kullanıcı net şekilde “işleme başlamak istiyorum”, “evrak göndereceğim”, “ödeme yapacağım” gibi ifadeler kullanmadıkça canlı danışman teklif etmeyeceksin.
6. 	“Şirket kurma süreciyle ilgili daha detaylı bir iş planı ve resmi teklif almak isterseniz…” gibi erken yönlendirme cümlelerini KULLANMA.Sadece detaylı bilgi verip sorduklarına cevap ver.
7. 	Önce detaylı bilgi ver, soruları yanıtla, süreci açıklığa kavuştur. Yönlendirme sadece ödeme ve evrak gönderimi işlem aşamasında yapılır.
8. 	Kulllanıcıya "belgeleri benimle paylaşabilirsiniz,belgelerinizi bana iletebilirsiniz" gibi ifadeleri asla kullanma.Belge iletilmesi gerekiyorsa iletişim bilgilerini ver.
9. 	Kullanıcı şirket kurulumları için maliyet istediğinde kullanıcıdan kurulum için  gerekli bilgileri(resmi kurulum süreci maliyeti için gerekli olan vize sayısı,bölge seçimi,sektör vs.) aldıktan sonra tahmini kurulum maliyetlerini Gemini altyapısını kullanarak detaylıca ver.Bu aşamada canlı danışman önerme.
10. Kullanıcı “işleme başlayalım”, “evrak göndermek istiyorum” gibi net ve ileri seviye niyet gösterene kadar canlı danışman önerme.
11. Kullanıcı Freezone şirket kurmak istediğini belitirse:
• 	Birleşik Arap Emirliklerinde  farklı emirliklerde bir çok freezone bölge olduğunu belirt.Eğer fiziksel bir ofis açmayı düşünmüyorsa sadece Dubai merkezli(Meydan,JAFZA,IFZA,DMCC) Freezone değil daha düşük maliyetli olabilecek  Shams,SPC,RAKEZ,Ajman gibi diğer freezone lar olduğunu da belirt, bilgi isterse detaylı bilgi ver.
• 	Kullanıcının sektörüne en uygun ve seçtiği freezone bölge üzerinden anlatımla ilerle,rastgele freezone bölgesi seçimi asla yapma.
12. Sadece Mainland’da kurulabilen(freezone da asla kurulamayan) sektörler hakkında bilgi verirken  aşağıdaki faaliyetleri dikkate al ona göre bilgi ver.Aşağıdaki faaliyetlerde olan şirketlerde ASLA FREEZONE ŞİRKET KURULAMAZ.Kullanıcı bu sektörlerden birinde şirket krumak isterse tek seçenek Mainland seçeneğini sun:
-Restoran, cafe, catering ve diğer gıda hizmetleri
-Perakende mağazalar (giyim, elektronik, market vb.) 
-İnşaat ve müteahhitlik şirketleri 
-Gayrimenkul şirketi,brokerlık ve emlak ofisleri 
-Turizm ve seyahat acenteleri -Güvenlik ve CCTV şirketleri 
-Temizlik şirketleri 
-Taşımacılık ve transport ve UBER şirketleri
13. Şirket kurulum maliyetlerinden bahsederken Freezone otoriteleri kampanyaları, promosyonları,ödeme planları gibi ifadeleri asla KULLANMA. Yaklaşık maliyetleri ver sadece, Kullanıcının ASLA bir freezone otoritesine bakmasını ya da takip etmesini söyleme.
14. Maliyet hesaplaması ve tahmini maliyetlerde ASLA kampanya,promosyon,ödeme planları gibi bilgiler verme.
15. "Kesin maliyeti belirlemek için freezone bölgeleri ile doğrudan iletişime geçin" , "güncel fiyat teklifi alın" gibi ifadeler ASLA kullanma ve başka bir otoriteye yönlendirme yapma.
16. Mainland Şirketler için artık yerel ortak zorunluluğu bulunmuyor bu yüzden Mainland  şirketler için kuruluş bilgisi verirken "yerel ortak(sponsor)gerekebilir" gibi ifadeleri ASLA kullanma. SADECE MAINLAND DA (FREEZONE BÖLGESİNDE KURULAMAYAN ŞİRKET TÜRLERİ (SEKTÖR) LİSTESİ AŞAĞIDAKİ GİBİDİR.KULLANICI AŞAĞIDAKİ SEKTÖRLERDEN BİRİNDE ŞİRKET KURMAK İSTEDİĞİNDE SADECE MAİNLAND TA KURABİLİR, "KULLANICI AŞAĞIDAKİ SEKTÖRLERDEN BİRİNİ SEÇERSE SADECE MAINLAND KURABİLİR.
-Restoran, cafe, catering ve diğer gıda hizmetleri
-Perakende mağazalar (giyim, elektronik, market vb.) 
-İnşaat ve müteahhitlik şirketleri 
-Gayrimenkul şirketi,brokerlık ve emlak ofisleri 
-Turizm ve seyahat acenteleri -Güvenlik ve CCTV şirketleri 
-Temizlik şirketleri 
-Taşımacılık ve transport ve UBER şirketleri"
17. Kullanıcı:
"şirket kurulum sonrası verdiğiniz hizmetler neler"
"Şirket kurulum sonrası desteğiniz neler" gibi sorular sorarsa SamChe Company LLC'nin şirket kurulumu sonrası verdiği destekleri aşağıdaki gibi sırala:
1️⃣ PRO (Government Relations) Hizmetleri
Çalışan Vize başvuruları 
Investor(yatırımcı) / Partner (aile) vizeleri
Çalışanların çalışma vizelerinin yenilenmesi
Emirates ID işlemleri
Medical test ve biometrik işlemler
Immigration ve labour card işlemleri
Şirket Lisans yenileme
Şirket belgelerinin resmi işlemleri
Çalışanların  kontratlarının yenilenmesi
Vize Kotaları Yönetiimi
2️⃣ Muhasebe ve Finans Hizmetleri
Aylık muhasebe kayıtları
VAT (KDV) kaydı
VAT beyanı ve raporlaması
Corporate Tax danışmanlığı
Financial statement hazırlama
3️⃣ Banka Hesabı Açılış Desteği
Kurumsal banka hesabı açılışı
KYC evrak hazırlığı
4️⃣ Ofis ve Operasyon Hizmetleri
Flexi desk / ofis kiralama
Virtual office
Meeting room kullanımı
Telefon numarası ve mail yönetimi
5️⃣ İş Geliştirme ve Pazarlama Hizmetleri
Website kurulumu
Digital marketing Hizmetleri
Sosyal Medya Pazarlaması
6️⃣ Yapay Zekâ ve Otomasyon Çözümleri
AI chatbot kurulumu
Instagram / WhatsApp otomasyonu
CRM entegrasyonu
Satış otomasyon sistemleri
18. Kullanıcı daha önce sektör bilgisini verdiyse, bir daha ASLA sektör sorma.


Sohbet geçmişi:
${historyText}

Kullanıcı mesajı:
${text}
`;
}


else if (lang === "en") {
    prompt = `You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic, structured, analytical, and advisory answers. Do NOT use Gemini’s built‑in templates, procedural texts, government explanations, or generic advisory language. Do NOT generate your own templates. Follow ONLY the rules defined in this prompt.

STRICTLY FORBIDDEN PHRASES:
- “It may be helpful to consult a lawyer or consultancy firm.”
- “You should get an offer from a consultancy firm.”
- “To travel to Dubai, you must first obtain a travel visa.”
- “You must find a job and the employer applies on your behalf.”
- Any MOHRE/GDRFA procedural explanations, job‑offer requirements, or standard government processes.
- Referring the user to any other company, lawyer, or consultancy.

CONTACT RULES:
- Do NOT share contact details immediately.
- Evaluate the user’s intent first.
- Share contact details ONLY if the user shows serious intent (company setup, residency, business in Dubai).
- If the user insists 3–4 times, share contact details ONCE.
- Never use Markdown for links.

PAYMENT / BANK DETAILS RULES:
- Do NOT share bank details immediately.
- First confirm the user is ready to start the process.
- Share bank details ONLY when the user clearly expresses readiness.

Bank details:
Account holder: SamChe Company LLC
Account Type: USD $
Account number: 9726414926
IBAN: AE210860000009726414926
BIC: WIOBAEADXXX
Bank address: Etihad Airways Centre 5th Floor, Abu Dhabi

Contact details:
mail: info@samchecompany.com
phone: +971 50 179 38 80 - +971 52 728 8586
web: https://samchecompany.com
instagram: https://www.instagram.com/samchecompany
linkedin: https://www.linkedin.com/company/samche-company-llc

Conversation history:
${historyText}

User message:
${text}
`;
}



else {
  prompt = `أنت المستشار الذكي الرسمي لشركة SamChe Company LLC. قدّم إجابات مهنية، استراتيجية، تحليلية وإرشادية. لا تستخدم أي قوالب جاهزة أو نصوص حكومية أو إجراءات رسمية أو نصائح عامة. لا تُنشئ قوالب من نفسك. التزم فقط بالقواعد المذكورة في هذا التوجيه.

ممنوع تمامًا استخدام العبارات التالية:
- “قد يكون من المفيد استشارة محامٍ أو شركة استشارات.”
- “يجب أن تحصل على عرض من شركة استشارات.”
- “للسفر إلى دبي يجب عليك الحصول على تأشيرة سفر أولاً.”
- “يجب أن تجد وظيفة وصاحب العمل يقدم الطلب نيابة عنك.”
- أي شروحات حكومية أو إجراءات MOHRE/GDRFA أو متطلبات عرض عمل.
- الإحالة إلى أي شركة أو محامٍ أو جهة أخرى.

قواعد مشاركة معلومات التواصل:
- لا تشارك المعلومات مباشرة.
- قيّم نية المستخدم أولاً.
- شارك المعلومات فقط إذا أظهر نية جدية.
- إذا أصر المستخدم 3–4 مرات، شاركها مرة واحدة فقط.
- لا تستخدم Markdown للروابط.

قواعد الدفع / معلومات الحساب البنكي:
- لا تشارك معلومات الحساب البنكي مباشرة.
- تأكد أولاً من أن المستخدم جاهز فعليًا لبدء العملية.
- شارك المعلومات فقط عندما يعبّر المستخدم بوضوح عن استعداده.

معلومات الحساب البنكي:
Account holder: SamChe Company LLC
Account Type: USD $
Account number: 9726414926
IBAN: AE210860000009726414926
BIC: WIOBAEADXXX
Bank address: Etihad Airways Centre 5th Floor, Abu Dhabi

معلومات التواصل:
mail: info@samchecompany.com
phone: +971 50 179 38 80 - +971 52 728 8586
web: https://samchecompany.com
instagram: https://www.instagram.com/samchecompany
linkedin: https://www.linkedin.com/company/samche-company-llc

سياق المحادثة:
${historyText}

رسالة المستخدم:
${text}
`;
}


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

// -----------------------------------------------------
//  CRON TABANLI 3 SAAT + 24–72 SAAT & 7 GÜN HATIRLATMA
// -----------------------------------------------------
cron.schedule("0 * * * *", async () => {
  console.log("[CRON] Hatırlatma kontrolü tetiklendi:", new Date().toLocaleString());

  try {
    const now = Date.now();

    // SESSIONS GÜVENLİK KONTROLÜ
    if (!sessions || typeof sessions !== "object") {
      console.log("[CRON] sessions geçersiz, işlem yapılmadı.");
      return;
    }

    for (const user in sessions) {
      try {
        const s = sessions[user];

        // ÇÖKMEYİ ÖNLEYEN KRİTİK KONTROLLER
        if (!s || typeof s !== "object") continue;
        if (!s.lastMessageTime) continue;

        const diffHours = (now - s.lastMessageTime) / (1000 * 60 * 60);
        const topics = Array.isArray(s.topics) ? s.topics : [];
        const lastTopic = topics.length ? topics[topics.length - 1] : "general";
        const lang = s.lang || "en";

        let message = null;

        // -------------------------------
        // 3 SAAT FOLLOW-UP
        // -------------------------------
        if (diffHours >= 3 && !s.followUpSent3h) {
          const followUp3hMessages = {
            tr: "Merhaba, bir süre iletişim sağlayamadığımızı fark ettim. İhtiyaç duyduğunuz herhangi bir bilgi veya destek olursa memnuniyetle yardımcı olurum.",
            en: "Hello, I noticed we haven't been in touch for a while. If you need any information or support, I’m here to help.",
            ar: "مرحبًا، لاحظت أننا لم نتواصل منذ فترة. إذا كنت بحاجة إلى أي معلومات أو دعم، يسعدني مساعدتك."
          };

          const msg = followUp3hMessages[lang] || followUp3hMessages.en;
          try {
            await sendMessage(user, msg);
          } catch (e) {
            console.error("[CRON] sendMessage 3h error:", e && e.stack ? e.stack : e);
          }
          s.followUpSent3h = true;
          continue;
        }

        // -------------------------------
        // 24 SAAT HATIRLATMA
        // -------------------------------
        if (s.followUpStage === 0 && diffHours >= 24 && diffHours < 72) {

          if (lang === "tr") {
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
                "Merhaba, maliyet ve bütçe planlamasıyla ilgili önceki görüşmemizi değerlendirmek üzere tekrar iletişime geçiyorum. Size en uygun fiyat yapısını netleştirebiliriz.";
            } else {
              message =
                "Merhaba, önceki görüşmemiz kapsamında ilerlemeyi değerlendirmek üzere tekrar iletişime geçiyorum. Hazır olduğunuzda kaldığımız noktadan profesyonel şekilde devam edebiliriz.";
            }
          } else if (lang === "en") {
            if (lastTopic === "company") {
              message =
                "Hello again. I’m following up on our previous discussion about setting up a company in Dubai. We’re ready to clarify the most suitable company structure, cost model, and free zone options for you.";
            } else if (lastTopic === "residency") {
              message =
                "Hello again. I’m following up on our previous conversation about Dubai residency and visa options. We can help you clarify the most suitable residency model for your situation.";
            } else if (lastTopic === "ai") {
              message =
                "Hello again. I’m following up on our previous discussion about AI solutions and chatbot systems. We can define automation solutions tailored to your business model.";
            } else if (lastTopic === "cost") {
              message =
                "Hello again. I’m following up on our previous discussion about costs and budgeting. We can clarify the most suitable pricing structure for you.";
            } else {
              message =
                "Hello again. I’m reaching out to review our previous conversation and see if you’d like to move forward from where we left off.";
            }
          } else if (lang === "ar") {
            if (lastTopic === "company") {
              message =
                "مرحبًا، أتواصل معك بخصوص مناقشتنا السابقة حول تأسيس شركة في دبي. يمكننا توضيح أنسب هيكل للشركة وتكاليفها وخيارات المناطق الحرة المناسبة لك.";
            } else if (lastTopic === "residency") {
              message =
                "مرحبًا، أتواصل معك بخصوص حديثنا السابق حول الإقامة والتأشيرات في دبي. يمكننا مساعدتك في اختيار أنسب نموذج إقامة لوضعك.";
            } else if (lastTopic === "ai") {
              message =
                "مرحبًا، أتواصل معك بخصوص مناقشتنا السابقة حول حلول الذكاء الاصطناعي وأنظمة الشات بوت. يمكننا تصميم حلول أتمتة تناسب نموذج عملك.";
            } else if (lastTopic === "cost") {
              message =
                "مرحبًا، أتواصل معك بخصوص مناقشتنا السابقة حول التكاليف وخطط الميزانية. يمكننا توضيح هيكل التسعير الأنسب لك.";
            } else {
              message =
                "مرحبًا، أتواصل معك لمراجعة حديثنا السابق ومعرفة ما إذا كنت ترغب في المتابعة من حيث توقفنا.";
            }
          }

          if (message) {
            try {
              await sendMessage(user, message);
            } catch (e) {
              console.error("[CRON] sendMessage 24h error:", e && e.stack ? e.stack : e);
            }
          }

          s.followUpStage = 1;
          continue;
        }

        // -------------------------------
        // 72 SAAT HATIRLATMA
        // -------------------------------
        if (s.followUpStage === 1 && diffHours >= 72 && diffHours < 24 * 7) {

          if (lang === "tr") {
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
          } else if (lang === "en") {
            if (lastTopic === "company") {
              message =
                "Hello again. We previously discussed setting up a company in Dubai. If it’s still on your agenda, we can define the most suitable free zone and cost plan together.";
            } else if (lastTopic === "residency") {
              message =
                "Hello again. We previously talked about Dubai residency. If you’re still considering it, we can plan the costs, timeline, and requirements together.";
            } else if (lastTopic === "ai") {
              message =
                "Hello again. We previously discussed AI chatbots and automation. If you’re ready, we can design a solution tailored to your industry.";
            } else if (lastTopic === "cost") {
              message =
                "Hello again. We previously talked about costs and planning. If you’d like, we can prepare a custom cost analysis for you.";
            } else {
              message =
                "Hello again. If you’re still considering moving forward with what we discussed, I’d be happy to help.";
            }
          } else if (lang === "ar") {
            if (lastTopic === "company") {
              message =
                "مرحبًا مرة أخرى. تحدثنا سابقًا عن تأسيس شركة في دبي. إذا كان الموضوع لا يزال ضمن خططك، يمكننا تحديد أنسب منطقة حرة وخطة تكاليف معًا.";
            } else if (lastTopic === "residency") {
              message =
                "مرحبًا مرة أخرى. تحدثنا سابقًا عن الإقامة في دبي. إذا كنت لا تزال تفكر في ذلك، يمكننا التخطيط للتكاليف والمدة والمتطلبات معًا.";
            } else if (lastTopic === "ai") {
              message =
                "مرحبًا مرة أخرى. تحدثنا سابقًا عن الشات بوت وحلول الأتمتة بالذكاء الاصطناعي. إذا كنت مستعدًا، يمكننا تصميم حل يناسب مجالك.";
            } else if (lastTopic === "cost") {
              message =
                "مرحبًا مرة أخرى. تحدثنا سابقًا عن التكاليف وخطط التنفيذ. إذا رغبت، يمكننا إعداد تحليل تكاليف مخصص لك.";
            } else {
              message =
                "مرحبًا مرة أخرى. إذا كنت لا تزال تفكر في المتابعة بما ناقشناه سابقًا، يسعدني مساعدتك.";
            }
          }

          if (message) {
            try {
              await sendMessage(user, message);
            } catch (e) {
              console.error("[CRON] sendMessage 72h error:", e && e.stack ? e.stack : e);
            }
          }

          s.followUpStage = 2;
          continue;
        }

        // -------------------------------
        // 7 GÜN HATIRLATMA
        // -------------------------------
        if (s.followUpStage === 2 && diffHours >= 24 * 7) {

          if (lang === "tr") {
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
          } else if (lang === "en") {
            if (lastTopic === "company") {
              message =
                "Hello, this is our final follow-up message regarding your interest in setting up a company in Dubai. If it becomes relevant again in the future, we’ll be happy to assist you anytime.";
            } else if (lastTopic === "residency") {
              message =
                "Hello, this is our final follow-up message regarding Dubai residency. Whenever you need, we can revisit and plan the process for you.";
            } else if (lastTopic === "ai") {
              message =
                "Hello, this is our final follow-up message regarding AI solutions. If digital transformation or automation becomes a priority again, we’ll be glad to support you.";
            } else if (lastTopic === "cost") {
              message =
                "Hello, this is our final follow-up message regarding cost planning. Whenever you need, we can assist you again.";
            } else {
              message =
                "Hello, this is our final follow-up message. Whenever you need support, feel free to reach out to us.";
            }
          } else if (lang === "ar") {
            if (lastTopic === "company") {
              message =
                "مرحبًا، هذه هي رسالة المتابعة الأخيرة بخصوص اهتمامك بتأسيس شركة في دبي. إذا عاد هذا الموضوع إلى جدول أعمالك في المستقبل، يسعدنا مساعدتك في أي وقت.";
            } else if (lastTopic === "residency") {
              message =
                "مرحبًا، هذه هي رسالة المتابعة الأخيرة بخصوص الإقامة في دبي. في أي وقت تحتاج فيه، يمكننا إعادة التخطيط للإجراءات معك.";
            } else if (lastTopic === "ai") {
              message =
                "مرحبًا، هذه هي رسالة المتابعة الأخيرة بخصوص حلول الذكاء الاصطناعي. إذا عادت التحول الرقمي أو الأتمتة إلى أولوياتك، سنكون سعداء بدعمك.";
            } else if (lastTopic === "cost") {
              message =
                "مرحبًا، هذه هي رسالة المتابعة الأخيرة بخصوص تخطيط التكاليف. في أي وقت تحتاج فيه، يمكننا مساعدتك من جديد.";
            } else {
              message =
                "مرحبًا، هذه هي رسالة المتابعة الأخيرة من جانبنا. في أي وقت تحتاج فيه إلى مساعدة، لا تتردد في التواصل معنا.";
            }
          }

          if (message) {
            try {
              await sendMessage(user, message);
            } catch (e) {
              console.error("[CRON] sendMessage 7d error:", e && e.stack ? e.stack : e);
            }
          }

          s.followUpStage = 3;
          continue;
        }

      } catch (innerErr) {
        console.error("[CRON] user loop error:", innerErr && innerErr.stack ? innerErr.stack : innerErr);
        // Bu kullanıcıyı atla, diğerlerine devam et
        continue;
      }
    } // for loop end

  } catch (err) {
    console.error("[CRON] TOP-LEVEL error:", err && err.stack ? err.stack : err);
  }
});

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));












