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
    if (!message) return res.sendStatus(200);

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
    //  AI CHATBOT PRICE REDIRECT
    // -------------------------------

    // Şirket konusunu tamamen devre dışı bırak
    session.topics = session.topics.filter((t) => t !== "company");

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

    // 2) Mesaj AI chatbot bağlamı içeriyor mu?
    const isAIInMessage =
      lower.includes("ai") ||
      lower.includes("chatbot") ||
      lower.includes("yapay zeka") ||
      lower.includes("ai bot") ||
      lower.includes("bot yazılım");

    // 3) Mesaj şirket bağlamı içeriyor mu?
    const isCompanyInMessage =
      lower.includes("şirket") ||
      lower.includes("company") ||
      lower.includes("firma") ||
      lower.includes("business setup") ||
      lower.includes("company setup") ||
      lower.includes("freezone") ||
      lower.includes("free zone") ||
      lower.includes("mainland") ||
      lower.includes("license") ||
      lower.includes("trade license") ||
      lower.includes("vize") ||
      lower.includes("oturum") ||
      lower.includes("residence") ||
      lower.includes("immigration");

    // 4) Geçmişte AI chatbot geçti mi?
    const isAIInHistory = session.history.some((m) => {
      const t = m.text?.toLowerCase() || "";
      return (
        t.includes("ai") ||
        t.includes("chatbot") ||
        t.includes("yapay zeka")
      );
    });

    // 5) Geçmişte şirket konusu geçti mi?
    const isCompanyInHistory = session.history.some((m) => {
      const t = m.text?.toLowerCase() || "";
      return (
        t.includes("şirket") ||
        t.includes("company") ||
        t.includes("firma") ||
        t.includes("business setup") ||
        t.includes("company setup") ||
        t.includes("freezone") ||
        t.includes("free zone") ||
        t.includes("mainland") ||
        t.includes("license") ||
        t.includes("trade license") ||
        t.includes("vize") ||
        t.includes("oturum") ||
        t.includes("residence") ||
        t.includes("immigration")
      );
    });

    // 6) AI bağlamı
    const isAIContext = isAIInMessage || isAIInHistory;

    // 7) Şirket bağlamı
    const isCompanyContext = isCompanyInMessage || isCompanyInHistory;

    // 8) SADECE AI bağlamı + fiyat isteği → link gönder
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
    session.intentScore = calculateIntentScore(
      text,
      session.intentScore || 0
    );

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    // (Devam eden AI cevabı üretme kodların burada devam eder…)

    return res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(500);
  }
});

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
  res.sendStatus(200);   // return KALDIRILDI
  return;                // istersen bunu da ekleyebilirsin, ama şart değil
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
//  CRON TABANLI 10 DK PING + 3H + 24H + 72H + 7 GÜN
// -----------------------------------------------------

cron.schedule("*/10 * * * *", async () => {
  console.log("[CRON] Hatırlatma kontrolü tetiklendi:", new Date().toLocaleString());

  try {
    const now = Date.now();

    // -----------------------------------------------------
    // SESSIONS GÜVENLİK KONTROLÜ
    // -----------------------------------------------------
    if (!sessions || typeof sessions !== "object") {
      console.log("[CRON] sessions geçersiz, işlem yapılmadı.");
      return;
    }

    const users = Object.keys(sessions);
    if (!users.length) {
      console.log("[CRON] aktif session yok, çıkılıyor.");
      return;
    }

    for (const user of users) {
      try {
        const s = sessions[user];

        // -----------------------------------------------------
        // ÇÖKMEYİ ÖNLEYEN KRİTİK KONTROLLER
        // -----------------------------------------------------
        if (!s || typeof s !== "object") {
          console.log("[CRON] session nesnesi geçersiz, user:", user);
          continue;
        }

        if (!s.lastMessageTime || isNaN(s.lastMessageTime)) {
          console.log("[CRON] lastMessageTime yok veya geçersiz, user:", user);
          continue;
        }

        const diffMinutes = (now - s.lastMessageTime) / (1000 * 60);
        if (!isFinite(diffMinutes) || diffMinutes < 0) {
          console.log("[CRON] diffMinutes geçersiz, user:", user);
          continue;
        }

        const diffHours = diffMinutes / 60;

        const topics = Array.isArray(s.topics) ? s.topics : [];
        const lastTopic = topics.length ? topics[topics.length - 1] : "general";
        const lang = typeof s.lang === "string" ? s.lang : "en";

        // -----------------------------------------------------
        // 10 DAKİKA PING — HER SESSİZLİKTE TEKRAR
        // followUpStage'i ETKİLEMEZ
        // -----------------------------------------------------
        if (diffMinutes >= 10) {
          const lastPing = s.lastPingSentAt && !isNaN(s.lastPingSentAt) ? s.lastPingSentAt : null;

          if (!lastPing || (now - lastPing) > 10 * 60 * 1000) {
            const pingMessage = getPingMessage(lang, lastTopic);

            if (pingMessage && typeof pingMessage === "string") {
              try {
                await sendMessage(user, pingMessage);
              } catch (e) {
                console.error("[CRON] sendMessage 10min error:", e);
              }
              s.lastPingSentAt = now;
            } else {
              console.log("[CRON] pingMessage geçersiz, user:", user);
            }

            continue;
          }
        } else {
          // Kullanıcı yazdı → ping reset
          if (s.lastPingSentAt) s.lastPingSentAt = null;
        }

        // -----------------------------------------------------
        // 3 SAAT FOLLOW-UP (3–6 saat)
        // -----------------------------------------------------
        if (!s.followUpSent3h && diffHours >= 3 && diffHours < 6) {
          const msg = getFollowUpMessage(lang, lastTopic, "3h");

          if (msg && typeof msg === "string") {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 3h error:", e);
            }
            s.followUpSent3h = true;
            s.followUpStage = 0;
          } else {
            console.log("[CRON] 3h followUpMessage geçersiz, user:", user);
          }

          continue;
        }

        // -----------------------------------------------------
        // 24 SAAT FOLLOW-UP (24–25 saat)
        // -----------------------------------------------------
        if (s.followUpStage === 0 && diffHours >= 24 && diffHours < 25) {
          const msg = getFollowUpMessage(lang, lastTopic, "24h");

          if (msg && typeof msg === "string") {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 24h error:", e);
            }
            s.followUpStage = 1;
          } else {
            console.log("[CRON] 24h followUpMessage geçersiz, user:", user);
          }

          continue;
        }

        // -----------------------------------------------------
        // 72 SAAT FOLLOW-UP (72–73 saat)
        // -----------------------------------------------------
        if (s.followUpStage === 1 && diffHours >= 72 && diffHours < 73) {
          const msg = getFollowUpMessage(lang, lastTopic, "72h");

          if (msg && typeof msg === "string") {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 72h error:", e);
            }
            s.followUpStage = 2;
          } else {
            console.log("[CRON] 72h followUpMessage geçersiz, user:", user);
          }

          continue;
        }

        // -----------------------------------------------------
        // 7 GÜN FOLLOW-UP (168–169 saat)
        // -----------------------------------------------------
        if (s.followUpStage === 2 && diffHours >= 168 && diffHours < 169) {
          const msg = getFollowUpMessage(lang, lastTopic, "7d");

          if (msg && typeof msg === "string") {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 7d error:", e);
            }
            s.followUpStage = 3;
          } else {
            console.log("[CRON] 7d followUpMessage geçersiz, user:", user);
          }

          continue;
        }

      } catch (innerErr) {
        console.error("[CRON] user loop error:", innerErr);
        continue;
      }
    }

  } catch (err) {
    console.error("[CRON] TOP-LEVEL error:", err);
  }
});


// -----------------------------------------------------
// 10 DAKİKA PING MESAJLARI (KURUMSAL – SATIŞ ODAKLI – İNSANİ)
// -----------------------------------------------------
function getPingMessage(lang, topic) {
  const messages = {
    tr: {
      company:
        "Şirket kurulum sürecinizle ilgili paylaştığım bilgiler doğrultusunda ilerlemek ister misiniz? Hazırsanız süreci sizin için başlatabilirim.",
      residency:
        "Oturum ve vize sürecinizle ilgili aktardığım bilgiler doğrultusunda devam etmeyi düşünüyor musunuz? Uygunsanız bir sonraki adımı planlayabiliriz.",
      ai:
        "AI ve otomasyon çözümleriyle ilgili paylaştığım bilgiler doğrultusunda ilerlemek ister misiniz? Projenizi bir üst seviyeye taşımaya hazırım.",
      cost:
        "Maliyet ve süreç detaylarıyla ilgili paylaştığım bilgiler doğrultusunda devam etmeyi düşünüyor musunuz? Hazırsanız ilerleyebiliriz.",
      general:
        "Paylaştığım bilgiler doğrultusunda hangi süreçte ilerlemeyi düşünürsünüz? Hazır olduğunuzda süreçlerle ilgili adımları birlikte netleştirebiliriz."
    },

    en: {
      company:
        "Would you like to proceed based on the information I shared regarding your company setup? I can initiate the next steps whenever you're ready.",
      residency:
        "Would you like to move forward based on the residency and visa details I provided? We can plan the next step whenever it suits you.",
      ai:
        "Would you like to proceed with the AI and automation options I shared? I’m ready to help you move forward whenever you are.",
      cost:
        "Would you like to continue based on the cost and process details I shared? I can assist further whenever you're ready.",
      general:
        "Based on the information I shared, which direction would you like to move forward with? Whenever you're ready, we can clarify the next steps together."
    },

    ar: {
      company:
        "هل ترغبون بالمتابعة بناءً على المعلومات التي قدمتها حول تأسيس الشركة؟ يمكنني البدء بالإجراءات متى ما كنتم جاهزين.",
      residency:
        "هل ترغبون بالمتابعة بناءً على تفاصيل الإقامة والتأشيرة التي شاركتها معكم؟ يمكننا تحديد الخطوة التالية في الوقت المناسب لكم.",
      ai:
        "هل تودون المتابعة بناءً على خيارات الذكاء الاصطناعي والأتمتة التي قدمتها؟ أنا جاهز لمساعدتكم في أي وقت.",
      cost:
        "هل ترغبون بالمتابعة بناءً على تفاصيل التكاليف والإجراءات التي قدمتها؟ يمكنني مساعدتكم متى ما كنتم جاهزين.",
      general:
        "استنادًا إلى المعلومات التي قدمتها، في أي مسار تودون المتابعة؟ عندما تكونون جاهزين، يمكننا تحديد الخطوات التالية معًا."
    }
  };

  const langSet = messages[lang] || messages["en"];
  return langSet[topic] || langSet["general"];
}

// -----------------------------------------------------
// FOLLOW-UP MESAJLARI (3h – 24h – 72h – 7d)
// -----------------------------------------------------
function getFollowUpMessage(lang, topic, stage) {
  const messages = {
    "3h": {
      tr: "Merhaba, bir süre iletişim sağlayamadığımızı fark ettim. İhtiyaç duyduğunuz herhangi bir bilgi veya destek olursa memnuniyetle yardımcı olurum.",
      en: "Hello, I noticed we haven't been in touch for a while. If you need any information or support, I’m here to help.",
      ar: "مرحبًا، لاحظت أننا لم نتواصل منذ فترة. إذا كنت بحاجة إلى أي معلومات أو دعم، يسعدني مساعدتك."
    },

    "24h": {
      tr: {
        company: "Merhaba, Dubai’de şirket kurulumuyla ilgili önceki değerlendirmemizi gözden geçirmek üzere tekrar iletişime geçiyorum.",
        residency: "Merhaba, Dubai oturum ve vize seçenekleriyle ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum.",
        ai: "Merhaba, AI çözümleri ve chatbot sistemleriyle ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum.",
        cost: "Merhaba, maliyet ve bütçe planlamasıyla ilgili önceki görüşmemizi değerlendirmek üzere tekrar iletişime geçiyorum.",
        general: "Merhaba, önceki görüşmemiz kapsamında ilerlemeyi değerlendirmek üzere tekrar iletişime geçiyorum."
      },
      en: {
        company: "Hello again. I’m following up on our previous discussion about setting up a company in Dubai.",
        residency: "Hello again. I’m following up on our previous conversation about Dubai residency and visa options.",
        ai: "Hello again. I’m following up on our previous discussion about AI solutions.",
        cost: "Hello again. I’m following up on our previous discussion about costs and budgeting.",
        general: "Hello again. I’m reaching out to review our previous conversation."
      },
      ar: {
        company: "مرحبًا، أتواصل معك بخصوص مناقشتنا السابقة حول تأسيس شركة في دبي.",
        residency: "مرحبًا، أتواصل معك بخصوص حديثنا السابق حول الإقامة والتأشيرات.",
        ai: "مرحبًا، أتواصل معك بخصوص مناقشتنا السابقة حول حلول الذكاء الاصطناعي.",
        cost: "مرحبًا، أتواصل معك بخصوص مناقشتنا السابقة حول التكاليف.",
        general: "مرحبًا، أتواصل معك لمراجعة حديثنا السابق."
      }
    },

    "72h": {
      tr: {
        company: "Merhaba, Dubai’de şirket kurulumuyla ilgili önceki görüşmemiz üzerinden bir süre geçti.",
        residency: "Merhaba, Dubai oturum ve vize seçenekleriyle ilgili önceki görüşmemiz üzerinden zaman geçti.",
        ai: "Merhaba, AI çözümleri ve chatbot sistemleriyle ilgili önceki görüşmemiz üzerinden zaman geçti.",
        cost: "Merhaba, maliyet ve bütçe planlamasıyla ilgili önceki görüşmemiz üzerinden zaman geçti.",
        general: "Merhaba, önceki görüşmemiz üzerinden zaman geçti."
      },
      en: {
        company: "Hello again. It has been a while since our last discussion about setting up a company in Dubai.",
        residency: "Hello again. It has been some time since our last conversation about Dubai residency.",
        ai: "Hello again. It has been a while since we discussed AI solutions.",
        cost: "Hello again. It has been some time since we discussed costs.",
        general: "Hello again. It has been a while since our last conversation."
      },
      ar: {
        company: "مرحبًا، لقد مر بعض الوقت منذ مناقشتنا الأخيرة حول تأسيس شركة في دبي.",
        residency: "مرحبًا، لقد مر بعض الوقت منذ حديثنا الأخير حول الإقامة.",
        ai: "مرحبًا، لقد مر بعض الوقت منذ مناقشتنا الأخيرة حول حلول الذكاء الاصطناعي.",
        cost: "مرحبًا، لقد مر بعض الوقت منذ مناقشتنا الأخيرة حول التكاليف.",
        general: "مرحبًا، لقد مر بعض الوقت منذ حديثنا الأخير."
      }
    },

    "7d": {
      tr: {
        company: "Merhaba, Dubai’de şirket kurulumuyla ilgili önceki görüşmemizin üzerinden bir hafta geçti.",
        residency: "Merhaba, Dubai oturum ve vize seçenekleriyle ilgili görüşmemizin üzerinden bir hafta geçti.",
        ai: "Merhaba, AI çözümleri ve chatbot sistemleriyle ilgili görüşmemizin üzerinden bir hafta geçti.",
        cost: "Merhaba, maliyet ve bütçe planlamasıyla ilgili görüşmemizin üzerinden bir hafta geçti.",
        general: "Merhaba, önceki görüşmemizin üzerinden bir hafta geçti."
      },
      en: {
        company: "Hello again. It has been a week since our last discussion about setting up a company in Dubai.",
        residency: "Hello again. It has been a week since we discussed Dubai residency.",
        ai: "Hello again. It has been a week since we talked about AI solutions.",
        cost: "Hello again. It has been a week since we discussed costs.",
        general: "Hello again. It has been a week since our last conversation."
      },
      ar: {
        company: "مرحبًا، لقد مر أسبوع منذ مناقشتنا الأخيرة حول تأسيس شركة في دبي.",
        residency: "مرحبًا، لقد مر أسبوع منذ حديثنا الأخير حول الإقامة.",
        ai: "مرحبًا، لقد مر أسبوع منذ مناقشتنا الأخيرة حول حلول الذكاء الاصطناعي.",
        cost: "مرحبًا، لقد مر أسبوع منذ مناقشتنا الأخيرة حول التكاليف.",
        general: "مرحبًا، لقد مر أسبوع منذ حديثنا الأخير."
      }
    }
  };

  const stageSet = messages[stage];
  if (!stageSet) return "";

  // 3h düz string, diğerleri topic bazlı
  if (stage === "3h") {
    const langSet = stageSet[lang] || stageSet["en"];
    return langSet || "";
  }

  const langSet = stageSet[lang] || stageSet["en"];
  if (!langSet) return "";

  return langSet[topic] || langSet["general"] || "";
}

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));












