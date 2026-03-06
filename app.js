// app.js – SamChe Company LLC WhatsApp Bot (FINAL)
// Şirket kurulum + oturum (residency) + sponsorlu oturum + hatırlatmalar
// Önceki tüm bağlamlara sadık, tek parça, kurumsal, mantıklı, niyet odaklı

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  SESSION MEMORY
// -------------------------------
const sessions = {};

// -------------------------------
//  TOPIC / INTENT DETECTION
// -------------------------------
function detectTopic(text) {
  const t = text.toLowerCase();

  const companyWords =
    t.includes("şirket") ||
    t.includes("sirket") ||
    t.includes("company") ||
    t.includes("business setup") ||
    t.includes("firma açmak") ||
    t.includes("firma acmak") ||
    t.includes("freezone") ||
    t.includes("free zone") ||
    t.includes("mainland");

  const residencyWords =
    t.includes("oturum") ||
    t.includes("residency") ||
    t.includes("visa") ||
    t.includes("vize") ||
    t.includes("sponsorlu oturum") ||
    t.includes("sponsor") ||
    t.includes("freelance visa") ||
    t.includes("freelance vize") ||
    t.includes("dubai'de çalışmak") ||
    t.includes("dubaide çalışmak") ||
    t.includes("dubai de çalışmak") ||
    t.includes("dubai’de çalışmak") ||
    t.includes("dubai'de calismak") ||
    t.includes("dubaide calismak");

  if (companyWords && !residencyWords) return "company_setup";
  if (residencyWords && !companyWords) return "residency";
  if (companyWords && residencyWords) return "mixed";
  return null;
}

// Şirket kurmadan sadece oturum isteyen (net residency niyeti)
function isSponsorOnlyResidency(text) {
  const t = text.toLowerCase();
  const residencyWords =
    t.includes("şirket kurmadan oturum") ||
    t.includes("sirket kurmadan oturum") ||
    t.includes("sadece oturum") ||
    t.includes("sadece residency") ||
    t.includes("sadece oturum istiyorum") ||
    t.includes("sadece residency istiyorum") ||
    t.includes("sponsorlu oturum") ||
    t.includes("sponsorlukla oturum") ||
    t.includes("dubai'de çalışmak istiyorum") ||
    t.includes("dubai de çalışmak istiyorum") ||
    t.includes("dubaide çalışmak istiyorum") ||
    t.includes("dubaide calismak istiyorum");
  const companyWords =
    t.includes("şirket kurmak") ||
    t.includes("sirket kurmak") ||
    t.includes("company kurmak") ||
    t.includes("business setup") ||
    t.includes("firma açmak") ||
    t.includes("firma acmak");

  return residencyWords && !companyWords;
}

// -------------------------------
//  FOLLOW-UP MESSAGE
// -------------------------------
function getFollowUpMessage(topic, stage) {
  let base;
  switch (topic) {
    case "company_setup":
      base =
        "Merhaba, Dubai’de şirket kurma süreciyle ilgili konuşmamız yarım kalmıştı. Hazırsanız devam edebiliriz.";
      break;
    case "residency":
      base =
        "Merhaba, oturum ve sponsorlu oturum süreciyle ilgili konuşmamız yarım kalmıştı. İsterseniz devam edebiliriz.";
      break;
    default:
      base =
        "Merhaba, konuşmamız yarım kalmıştı. Hazırsanız devam edebiliriz.";
  }

  if (stage === 1) return base + " (1. hatırlatma)";
  if (stage === 2) return base + " (2. hatırlatma)";
  if (stage === 3) return base + " (son hatırlatma)";
  return base;
}

// -------------------------------
//  SPONSORLU OTURUM METNİ (KİLİTLİ METİN)
// -------------------------------
const sponsorResidencyText =
  "Bu ülkede yaşayabilmeniz ve çalışabilmeniz için size birilerinin sponsor olması gerekiyor ya da şirket açıp kendinize sponsor olmanız gerekiyor. " +
  "Şirket kurmadan da dilerseniz biz bu sponsorlugu sizin için sağlıyoruz yani iki yıllık oturumunuz için burada firmalar size sponsor oluyorlar. " +
  "Bu sponsorlukla burada yaşayabiliyorsunuz fakat o firmada çalışmıyorsunuz; firma size sadece oturumunuz için sponsor oluyor.\n\n" +
  "İşlemleriniz tamamlandıktan sonra sponsor firmanızın size sunduğu NOC Belgesi (No Objection Certificate) ile ülkede istediğiniz sektörde resmi olarak çalışma hakkına ya da iş kurma hakkına sahip oluyorsunuz. " +
  "Bu belge sponsorunuzun ekstra bir işte çalışmanıza itirazı olmadığını gösteren belgedir.\n\n" +
  "Dubai iki yıllık oturum ve çalışma izni için işlemleri Türkiye’den başlatıyoruz, ülkeye çalışan vizesi ile giriş yapıyorsunuz.\n\n" +
  "İki yıllık oturum ücreti toplam 13.000 AED (3,500$)\n" +
  "1. ödeme 4000 AED (iş teklifi ve kontrat için). Devlet onaylı evrak 10 gün içinde ulaşır, ardından 2. ödeme alınır.\n" +
  "2. ödeme 8000 AED (employment visa). E-visa maksimum 30 gün içinde ulaşır.\n" +
  "3. ödeme 1000 AED (ID kart ve damgalama) ülkeye giriş sonrası ödenir. Süre 30 gün.";

// -------------------------------
//  BANKA BİLGİLERİ (USD HESABI)
// -------------------------------
const companyBankInfoUSD =
  "Ödemelerinizi aşağıdaki USD şirket hesabına EFT/Havale ile tek seferde yapabilirsiniz:\n\n" +
  "Account holder: SamChe Company LLC\n" +
  "Account number: 9726414926\n" +
  "IBAN: AE210860000009726414926\n" +
  "BIC: WIOBAEADXXX\n" +
  "Bank address:\nEtihad Airways Centre 5th Floor, Abu Dhabi, UAE.";

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
      "Dubai’de şirket kuruluşu, serbest bölge seçimi, vizeler, oturum, maliyetler, iş modeli, pazar stratejisi veya yapay zekâ çözümleri hakkında daha net bir soru sorabilirsiniz."
    );
  }
  if (lang === "en") {
    return (
      "I couldn’t fully understand your question, but I’d be glad to assist. " +
      "You may ask more specifically about Dubai company setup, free zones, residency, visas, costs, business models, or AI solutions."
    );
  }
  return (
    "لم أفهم سؤالك تمامًا، لكن يسعدني مساعدتك. " +
    "يمكنك طرح سؤال أكثر تحديدًا حول تأسيس الشركات في دبي، المناطق الحرة، الإقامة، التأشيرات، التكاليف أو حلول الذكاء الاصطناعي."
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
    "6. Serbest Bölge Seçimi & Uyum (Compliance)\n" +
    "7. Webchat AI Chatbot Çözümleri",
  en:
    "SamChe Company LLC provides:\n" +
    "1. Private AI Systems\n" +
    "2. Digital Growth & Content Strategy\n" +
    "3. Branding & Social Media\n" +
    "4. Audience Growth & Performance Optimization\n" +
    "5. UAE Business Setup & Market Entry\n" +
    "6. Free Zone Selection & Compliance\n" +
    "7. Webchat AI Chatbot Solutions",
  ar:
    "تقدم SamChe Company LLC:\n" +
    "1. أنظمة ذكاء اصطناعي خاصة\n" +
    "2. استراتيجية النمو الرقمي والمحتوى\n" +
    "3. إدارة العلامة التجارية ووسائل التواصل\n" +
    "4. نمو الجمهور وتحسين الأداء\n" +
    "5. تأسيس الأعمال في الإمارات\n" +
    "6. اختيار المناطق الحرة والامتثال\n" +
    "7. حلول روبوت الدردشة الذكي (Webchat AI Chatbot)",
};

const introAfterLang = {
  tr:
    "Merhaba, ben SamChe Company LLC'nin yapay zekâ danışmanıyım.\n" +
    "BAE şirket kuruluşu, vizeler, oturum, yaşam maliyetleri, iş planları, iş stratejileri, yapay zekâ çözümleri ve webchat AI chatbot hizmetleri hakkında sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?\n\n" +
    servicesList.tr,
  en:
    "Hello, I am the AI consultant of SamChe Company LLC.\n" +
    "I can answer your questions about UAE company formation, residency, visas, cost of living, business plans, business strategies, AI solutions, and webchat AI chatbot services. How can I assist you?\n\n" +
    servicesList.en,
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "أستطيع مساعدتك في تأسيس الشركات في الإمارات، الإقامة، التأشيرات، تكاليف المعيشة، خطط الأعمال، الاستراتيجيات، حلول الذكاء الاصطناعي وخدمة روبوت الدردشة الذكي (Webchat AI Chatbot). كيف يمكنني مساعدتك؟\n\n" +
    servicesList.ar,
};

const contactText = {
  tr:
    "Size özel bir SamChe danışmanıyla görüşmek ve resmi teklif almak için iletişim bilgilerimiz:\n" +
    "mail: info@samchecompany.com\n" +
    "telefon: +971 50 179 38 80 - +971 52 662 28 75\n" +
    "web: https://samchecompany.com\n" +
    "instagram: https://www.instagram.com/samchecompany\n" +
    "linkedin: https://www.linkedin.com/company/samche-company-llc",
  en:
    "To speak with a dedicated SamChe consultant and receive an official quotation, you can use our contact details:\n" +
    "mail: info@samchecompany.com\n" +
    "phone: +971 50 179 38 80 - +971 52 662 28 75\n" +
    "web: https://samchecompany.com\n" +
    "instagram: https://www.instagram.com/samchecompany\n" +
    "linkedin: https://www.linkedin.com/company/samche-company-llc",
  ar:
    "للتحدث مع مستشار من SamChe والحصول على عرض رسمي، يمكنك استخدام بيانات الاتصال التالية:\n" +
    "البريد الإلكتروني: info@samchecompany.com\n" +
    "الهاتف: ‎+971 50 179 38 80 - ‎971 52 662 28 75\n" +
    "الموقع: https://samchecompany.com\n" +
    "إنستغرام: https://www.instagram.com/samchecompany\n" +
    "لينكدإن: https://www.linkedin.com/company/samche-company-llc",
};

// -------------------------------
//  REPLY SANITIZATION (İLETİŞİM FİLTRESİ)
// -------------------------------
function sanitizeReply(reply, session) {
  if (session.contactAllowed) return reply;

  let r = reply;
  const patterns = [
    /info@samchecompany\.com/gi,
    /\+971\s?50\s?179\s?38\s?80/gi,
    /\+971\s?52\s?662\s?28\s?75/gi,
    /https?:\/\/samchecompany\.com/gi,
    /https?:\/\/www\.samchecompany\.com/gi,
    /https?:\/\/www\.instagram\.com\/samchecompany/gi,
    /https?:\/\/www\.linkedin\.com\/company\/samche-company-llc/gi,
  ];

  patterns.forEach((p) => {
    r = r.replace(p, "");
  });

  r = r
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n");

  return r.trim();
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
        followUp: false,
        stopFollowUp: false,
        topic: null,
        lastMessageTime: Date.now(),
        followStartTime: null,
        followStage: 0,
        payment: null,
        residencyExplained: false,
        contactAllowed: false,
        contactRequestCount: 0,
        lastIntent: null, // company_setup | residency | payment | documents | start_process
        residencyMode: null, // "company" | "sponsor" | null
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
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    const lang = session.lang;

    // STOP FOLLOW-UP COMMANDS
    if (
      lower.includes("istemiyorum") ||
      lower.includes("rahatsız etmeyin") ||
      lower.includes("rahatsiz etmeyin") ||
      lower.includes("stop") ||
      lower.includes("no reminder")
    ) {
      session.stopFollowUp = true;
      session.followUp = false;

      await sendMessage(from, "Tamamdır, sizi bir daha rahatsız etmeyeceğim.");
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // ONLINE / KREDİ KARTI ÖDEME İSTEĞİ
    if (
      lower.includes("kredi kart") ||
      lower.includes("online ödeme") ||
      lower.includes("online odeme") ||
      lower.includes("kartla ödeme") ||
      lower.includes("kartla odeme") ||
      lower.includes("credit card") ||
      lower.includes("pay online")
    ) {
      await sendMessage(
        from,
        "Kredi kartı veya online ödeme için lütfen SamChe canlı temsilcisi ile iletişime geçin: +971 50 179 38 80"
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // AI CHATBOT / WEBCHAT BOT FİYAT SORULARI
    if (
      lower.includes("webchat") ||
      lower.includes("chatbot") ||
      lower.includes("ai chatbot") ||
      (lower.includes("bot") && lower.includes("fiyat"))
    ) {
      await sendMessage(
        from,
        "Webchat AI chatbot çözümleri, paketler ve fiyatlar için lütfen şu sayfayı ziyaret edin:\nhttps://aichatbot.samchecompany.com"
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // -------------------------------
    //  BAŞLAYALIM / DEVAM KOMUTLARI
    // -------------------------------
    const isStartCommand =
      lower.includes("başlayalım") ||
      lower.includes("baslayalim") ||
      lower.includes("işlemleri başlat") ||
      lower.includes("islemleri baslat") ||
      lower.includes("devam edelim") ||
      lower.includes("yapalım") ||
      lower.includes("yapalim") ||
      lower === "evet" ||
      lower === "tamam" ||
      lower.includes("proceed") ||
      lower.includes("start") ||
      lower.includes("let's go") ||
      lower.includes("lets go");

    if (isStartCommand) {
      if (!session.lastIntent) {
        await sendMessage(
          from,
          "Hangi işlem için başlamak istersiniz? Şirket kuruluşu mu, yoksa oturum süreci (şirket kurarak veya sponsorlu) mi?"
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }

      if (session.lastIntent === "company_setup") {
        await sendMessage(
          from,
          "Dubai’de şirket kuruluşu için süreci başlatıyoruz. Öncelikle sektörünüzü, freezone/mainland tercihinizi ve ortak yapınızı netleştirerek ilerleyebiliriz."
        );
      } else if (session.lastIntent === "residency") {
        if (session.residencyMode === "sponsor") {
          await sendMessage(
            from,
            "Sponsorlu oturum sürecini başlatıyoruz. Öncelikle pasaport ve biyometrik fotoğrafınızı PDF olarak hazırlamanız, ardından ödeme adımına geçmemiz gerekecek."
          );
        } else if (session.residencyMode === "company") {
          await sendMessage(
            from,
            "Şirket kurarak oturum almak için önce şirket modelinizi netleştirelim. Sektör, freezone/mainland tercihi ve ortak yapısı üzerinden ilerleyebiliriz."
          );
        } else {
          await sendMessage(
            from,
            "Oturumu hangi yolla almak istediğinizi netleştirelim: Şirket kurarak mı, yoksa şirket kurmadan sponsorlu oturum ile mi?"
          );
        }
      } else if (session.lastIntent === "payment") {
        await sendMessage(
          from,
          "Ödeme adımlarını netleştirelim. Ödemeyi USD mi yoksa TL olarak mı yapmak istersiniz?"
        );
      } else if (session.lastIntent === "documents") {
        await sendMessage(
          from,
          "Evrak sürecini başlatıyoruz. Lütfen pasaport ve biyometrik fotoğrafınızı PDF formatında hazırlayın ve e-posta ile iletmeye hazır olun."
        );
      }

      session.lastIntent = "start_process";
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // -------------------------------
    //  ŞİRKET + OTURUM AYNI MESAJDA → NETLEŞTİRME
    // -------------------------------
    const topicNow = detectTopic(text);
    if (topicNow === "mixed") {
      await sendMessage(
        from,
        "Hem şirket kurma hem de oturum konusu geçti. Sizin için şu an hangi işlem öncelikli? Şirket kuruluşu mu, yoksa şirket kurmadan sponsorlu oturum mu?"
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // OTURUM İSTEYİP YÖNTEMİ BELİRTMEYEN KULLANICI
    if (
      topicNow === "residency" &&
      !isSponsorOnlyResidency(lower) &&
      !lower.includes("şirket kurarak") &&
      !lower.includes("sirket kurarak") &&
      !lower.includes("company üzerinden") &&
      !lower.includes("company uzerinden") &&
      !session.residencyMode
    ) {
      await sendMessage(
        from,
        "Oturumu hangi yolla almak istiyorsunuz? Şirket kurarak mı, yoksa şirket kurmadan sponsorlu oturum modeliyle mi düşünüyorsunuz?"
      );
      session.lastIntent = "residency";
      session.topic = "residency";
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // KULLANICI AÇIKÇA "ŞİRKET KURARAK OTURUM" DERSE
    if (
      lower.includes("şirket kurarak oturum") ||
      lower.includes("sirket kurarak oturum") ||
      lower.includes("company üzerinden oturum") ||
      lower.includes("company uzerinden oturum")
    ) {
      session.residencyMode = "company";
      session.lastIntent = "residency";
      session.topic = "residency";
      await sendMessage(
        from,
        "Şirket kurarak oturum almak istiyorsunuz. Bu durumda önce şirket modelinizi netleştirmemiz gerekiyor. Sektörünüz, freezone/mainland tercihiniz, ortak sayınız ve ofis ihtiyacınız hakkında bilgi verebilir misiniz?"
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // SADECE SPONSORLU OTURUM İSTEĞİ (ŞİRKET KURMAK İSTEMEYEN)
    if (!session.residencyExplained && isSponsorOnlyResidency(lower)) {
      session.residencyMode = "sponsor";
      await sendMessage(from, sponsorResidencyText);
      session.residencyExplained = true;
      session.lastIntent = "residency";
      session.topic = "residency";
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // ÖDEME NEREYE / HESAP / ÜCRET / EVRAKLAR NEREYE SORULARI
    if (
      lower.includes("ödeme nereye") ||
      lower.includes("odeme nereye") ||
      lower.includes("ücreti nereye") ||
      lower.includes("ucreti nereye") ||
      lower.includes("nereye göndereceğim") ||
      lower.includes("nereye gonderecem") ||
      lower.includes("ödeme?") ||
      lower.includes("odeme?") ||
      (lower.includes("ödeme") && !lower.includes("plan")) ||
      (lower.includes("odeme") && !lower.includes("plan")) ||
      lower.includes("hesap numarası") ||
      lower.includes("hesap numarasi") ||
      lower.includes("banka bilgisi") ||
      lower.includes("banka bilgilerini") ||
      lower.includes("ödeme yapmak istiyorum") ||
      lower.includes("odeme yapmak istiyorum") ||
      lower.includes("evraklar nereye") ||
      lower.includes("belgeler nereye")
    ) {
      const topic = detectTopic(text);

      if (
        topic === "residency" ||
        isSponsorOnlyResidency(lower) ||
        session.residencyExplained ||
        session.lastIntent === "residency"
      ) {
        session.payment = {
          type: "residency",
          stage: "askCurrency",
          currency: null,
        };
        session.lastIntent = "payment";
        await sendMessage(
          from,
          "Sponsorlu oturum için ödemenizi hangi para birimiyle yapmak istersiniz? USD olarak mı yoksa TL olarak mı ödemek istersiniz?"
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      } else {
        session.payment = {
          type: "other",
          stage: "askCurrency",
          currency: null,
        };
        session.lastIntent = "payment";
        await sendMessage(
          from,
          "Ödemenizi hangi para birimiyle yapmak istersiniz? USD olarak mı yoksa TL olarak mı ödemek istersiniz?"
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }
    }

    // ÖDEME İÇİN PARA BİRİMİ CEVABI
    if (session.payment && session.payment.stage === "askCurrency") {
      if (
        lower.includes("usd") ||
        lower.includes("dolar") ||
        lower.includes("dollar")
      ) {
        session.payment.currency = "usd";
        session.payment.stage = "done";

        if (session.payment.type === "residency") {
          await sendMessage(
            from,
            "Sponsorlu oturum için ödemenizi USD olarak tek seferde yapabilirsiniz. Şirket banka bilgilerimiz:\n\n" +
              companyBankInfoUSD +
              "\n\nLütfen ödeme dekontunuzu ve pasaport + biyometrik fotoğrafınızı PDF olarak info@samchecompany.com adresine gönderin."
          );
        } else {
          await sendMessage(
            from,
            "Ödemenizi USD olarak tek seferde aşağıdaki şirket hesabına EFT/Havale ile yapabilirsiniz:\n\n" +
              companyBankInfoUSD +
              "\n\nÖdeme dekontunuzu ve ilgili evraklarınızı info@samchecompany.com adresine iletebilirsiniz."
          );
        }

        session.lastIntent = "payment";
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }

      if (
        lower.includes("tl") ||
        lower.includes("türk lirası") ||
        lower.includes("turkish lira")
      ) {
        session.payment.currency = "tl";
        session.payment.stage = "done";

        await sendMessage(
          from,
          "TL ile ödeme yapmak isterseniz, lütfen evraklarınızı ve ödeme talebinizi doğrudan SamChe canlı temsilcimize iletin: +971 50 179 38 80"
        );
        session.lastIntent = "payment";
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }

      await sendMessage(
        from,
        "Ödemeyi hangi para birimiyle yapmak istediğinizi anlayamadım. Lütfen 'USD' veya 'TL' olarak belirtin."
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // EVRAKLAR NELER SORUSU (GENEL)
    if (
      lower.includes("evrak") ||
      lower.includes("belge") ||
      lower.includes("hangi evrak") ||
      lower.includes("ne lazım") ||
      lower.includes("ne gerekli")
    ) {
      if (
        session.lastIntent === "residency" ||
        session.topic === "residency" ||
        isSponsorOnlyResidency(lower)
      ) {
        await sendMessage(
          from,
          "Sponsorlu oturum için genellikle geçerli pasaportunuz ve biyometrik fotoğrafınız temel evraklar olarak yeterlidir. Detaylı evrak listesi, durumunuza göre SamChe danışmanı tarafından netleştirilir."
        );
      } else {
        await sendMessage(
          from,
          "Şirket kuruluşu için gerekli evraklar; pasaport, ortak bilgileri ve seçilecek serbest bölge veya mainland yapısına göre değişen ek belgelerden oluşur. Sektörünüzü ve ortak yapınızı netleştirdikten sonra size özel evrak listesini çıkarabiliriz."
        );
      }
      session.lastIntent = "documents";
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // TOPIC DETECTION & FOLLOW-UP START
    if (topicNow && topicNow !== "mixed" && !session.stopFollowUp) {
      if (!session.followUp) {
        sessions[from].followUp = true;
        sessions[from].topic =
          topicNow === "license" ? "company_setup" : topicNow;
        sessions[from].followStartTime = Date.now();
        sessions[from].followStage = 0;
      }
      if (topicNow === "company_setup") session.lastIntent = "company_setup";
      if (topicNow === "residency") session.lastIntent = "residency";
      session.lastMessageTime = Date.now();
    }

    // CONTACT İSTEKLERİ – FİLTRELİ
    if (
      lower.includes("contact") ||
      lower.includes("iletişim") ||
      lower.includes("iletisim") ||
      lower.includes("whatsapp") ||
      lower.includes("call") ||
      lower.includes("telefon") ||
      lower.includes("numara") ||
      lower.includes("numaranız") ||
      lower.includes("numaraniz")
    ) {
      session.contactRequestCount = (session.contactRequestCount || 0) + 1;

      const seriousTopic =
        session.topic === "company_setup" || session.topic === "residency";

      const strongIntent =
        lower.includes("net fiyat") ||
        lower.includes("resmi teklif") ||
        lower.includes("teklif istiyorum") ||
        lower.includes("teklif almak istiyorum") ||
        lower.includes("danışmanla görüşmek") ||
        lower.includes("danismanla gorusmek") ||
        lower.includes("görüşmek istiyorum") ||
        lower.includes("gorusmek istiyorum") ||
        lower.includes("appointment") ||
        lower.includes("meeting");

      if (seriousTopic && (strongIntent || session.contactRequestCount >= 2)) {
        session.contactAllowed = true;
        await sendMessage(from, contactText[lang]);
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      } else {
        await sendMessage(
          from,
          "Size daha doğru yardımcı olabilmem için önce birkaç temel bilginizi ve sorularınızı yazmanız çok daha sağlıklı olur. Ardından gerekirse sizi SamChe danışmanına yönlendirebilirim."
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }
    }

    // MEMORY
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    // -------------------------------
    //  GEMINI PROMPT (TR / EN / AR)
    // -------------------------------
    const prompt =
      lang === "tr"
        ? `SamChe Company LLC’nin kıdemli iş kurulum ve strateji danışmanısın. 
Görevin, Dubai ve BAE'de şirket kurmak, oturum almak, lisans süreçleri, serbest bölge/mainland seçimi, iş modeli ve büyüme stratejileri konusunda profesyonel, kurumsal ve analitik cevaplar vermek.

Aşağıdaki ilkelere HER ZAMAN uy:

1) PROFESYONEL VE KURUMSAL TON
- SamChe Company LLC’nin uzman danışmanı gibi konuş.
- Net, sakin, güven veren, kurumsal bir dil kullan.
- Gereksiz süslü cümleler, abartılı satış dili kullanma.

2) SADECE SAMCHE PERSPEKTİFİNDEN KONUŞ
- Kullanıcıyı ASLA başka bir firmaya, başka bir profesyonel danışmana, Freezone yetkilisine, devlet kurumuna, foruma veya harici bir kaynağa yönlendirme
- “Freezone yetkilileriyle görüşün”, “resmi siteye bakın”, “forumlara bakın”, “başka bir danışmana sorun” gibi ifadeler KULLANMA.
- Tüm bilgi, analiz ve yönlendirme SamChe Company LLC perspektifinden verilir.
- Yönlendirme yapman gereken tek linkler:
  - https://samchecompany.com
  - https://guide.samchecompany.com
  - https://aichatbot.samchecompany.com

3) BİLGİ VERMEKTE TUTARLI OL
- Bilgi verirken Gemini’nin kendi bilgi tabanını kullan ama uydurma, mantıksız veya çelişkili bilgi üretme.
- Freezone/mainland farkları, lisans tipleri, şirket türleri, oturum süreçleri, vergi ve uyum konularında mantıklı, tutarlı ve gerçekçi açıklamalar yap.
- Emin olmadığın bir bilgiyi “kesin” gibi sunma; gerekirse “genel olarak”, “yaklaşık olarak” gibi ifadeler kullan.
-Analiz yapiyorum,detaylı rapor hazırlıyorum gibi kullanıcıyı oyalayan ifadeler kullanma, her zaman net ol profesyonel davran.

4) ÖNCE ANALİZ, SONRA YÖNLENDİRME (ŞİRKET KURULUMU)
- Kullanıcı “şirket kurmak istiyorum” dediğinde hemen maliyet verme.
- Önce analiz soruları sor:
  - Hangi sektörde faaliyet göstereceksiniz?
  - Freezone mu yoksa Mainland mi düşünüyorsunuz?
  - Tek ortaklı mı yoksa çok ortaklı bir yapı mı planlıyorsunuz?
  - Fiziksel ofis ihtiyacınız var mı?
  - Hedef pazarınız neresi (BAE içi, global, online vs.)?
- Bu sorularla kullanıcının ihtiyacını netleştir, sonra uygun şirket modelini öner,Bilgi verirken Gemini’nin kendi bilgi tabanını kullan ama uydurma, mantıksız veya çelişkili bilgi üretme.
- Şirket kurulumunda oturumdan bahsedeceksen, bunu şirket kurmanın doğal sonucu olarak anlat (örneğin: “Şirket kurduğunuzda, 2 yıllık oturum iznine sahip olursunuz.Bu kurulum paketlerine dahildir.”).
- Şirket kurmak isteyen kullanıcıya sponsorlu oturum modelini ana çözüm olarak sunma; odak şirket kurulumunda kalsın.
-Analiz yapıyorum,detaylı rapor hazırlıyorum gibi kullanıcıyı oyalayan ifadeler kullanma, her zaman net ol profesyonel davran.

5) MALİYET DAVRANIŞI
- Kullanıcı açıkça “maliyet”, “fiyat”, “ücret” sormadan kendiliğinden maliyet çıkarma.
- Kullanıcı “maliyet nedir, fiyat nedir, ne kadar tutar?” gibi sorarsa:
  - Yaklaşık aralıklar verebilirsin (örneğin: “genellikle Anakara şirket ya da Sharjah Freezone ya da Dubai Freezone aralığında değişir”).
  - Net  fiyat tablosu isteyenleri sadece https://guide.samchecompany.com/ adresindeki maliyet bölümüne yönlendirebilirsin.
- Maliyet verirken çok net rakamlar yerine aralık ve koşul odaklı konuş.
-En uygun-daha ucuz gibi ifadeler kullanan kullanıcıyı sponsorlu oturuma yönlendir.

6) SATIŞ ODAKLI AMA BASKICI OLMADAN
- Kullanıcıya bilgi verdikten sonra onu satışa hazırlayan sorular sor:
  - “İsterseniz sizin durumunuza göre en uygun şirket modelini birlikte netleştirebiliriz.”
  - “Hazırsanız bir sonraki adım olarak lisans tipini belirleyebiliriz.”
- Kullanıcı “başlayalım, devam edelim, tamam, evet” gibi ifadeler kullanırsa:
  - Bunu süreci ilerletme niyeti olarak yorumla.
  - Bir sonraki mantıklı adımı öner.Gemini’nin kendi bilgi tabanını kullan ama uydurma, mantıksız veya çelişkili bilgi üretme,başka bir kaynak ya da danışan önerme.

7) OTURUM (RESIDENCY) DAVRANIŞI – İKİ MODELİ DE BİL

a) ŞİRKET KURARAK OTURUM:
- Kullanıcı önceliğini şirket kurmak olarak ifade ediyorsa (örneğin “Dubai’de şirket kurmak istiyorum” veya “şirket kurarak oturum almak istiyorum”):
  - Odak noktan şirket kurulum süreci olsun.
  - Oturumdan bahsederken, şirket kurmanın doğal sonucu olarak anlat (“Şirket kurduğunuzda, belirli şartlar altında oturum izni almanız da mümkündür.”).
  - Bu durumda sponsorlu oturum modelini ana çözüm gibi sunma.
  -Kullanıcı dubaide çalışacağım iş arıyorum gibi ifadeler kullanırsa sponsorlu oturuma yönlendir.

b) ŞİRKET KURMADAN SADECE OTURUM (SPONSORLU OTURUM):
- Kullanıcı “şirket kurmadan oturum almak istiyorum”, “sadece oturum istiyorum”, “Dubai’de çalışmak istiyorum”, “sponsorlu oturum” gibi ifadeler kullanıyorsa ve şirket kurma niyeti yoksa:
  - Odak noktan SamChe Company LLC’nin sponsorlu oturum modeli olsun.
  - Gayrimenkul yatırımı, iş bulma, başka şirketler, forumlar, devlet siteleri veya başka oturum yollarını DETAYLANDIRMA ve ÖNERME.
  - Kullanıcıya “iş arayın, forumlara bakın, başka firmalara başvurun” gibi yönlendirmeler yapma.
  - Sponsorlu oturum sürecini, SamChe’nin bu süreci nasıl yönettiğini ve temel adımları net ve profesyonel şekilde açıkla.
  - Sponsorlu oturum açıklamasında AŞAĞIDAKİ METNİ KULLANMAK ZORUNDASIN (metni değiştirme, anlamını bozma, eksiltme yapma):
${sponsorResidencyText}

c) KULLANICI KARARSIZSA:
- Kullanıcı hem şirket hem oturumdan bahsediyor veya “oturum istiyorum” deyip yöntemi belirtmiyorsa:
  - Önce şu soruyu sor: “Oturumu hangi yolla almak istiyorsunuz? Şirket kurarak mı, yoksa şirket kurmadan sponsorlu oturum modeliyle mi?”
  - Ardından kullanıcının cevabına göre ya şirket kurulum akışına ya da sponsorlu oturum akışına geç.

8) İLETİŞİM BİLGİSİ VERME
- Kullanıcıya asla telefon numarası, e-posta adresi, web sitesi, Instagram veya LinkedIn linki yazma; Kullanıcı sadece kendisi iletişim bilgisi ve canlı kişiyle görüşmek istediğinde iletişim bilgisi ver.
- Sen sadece “SamChe danışmanı ile detaylı görüşme yapılabilir” gibi genel ifadeler kullan.
-Kullanıcı canlı temsilci ile görüşücem beni temsilciye bağla canlı insan yok mu iletişim bilgisi ver gibi ifadeler kullandığında iletişim bilgisi ver

9) BAĞLAM VE NİYET TAKİBİ
- Her cevabında kullanıcının önceki mesajlarını ve niyetini dikkate al.
- Kullanıcı önce şirket, sonra oturum, sonra tekrar şirket sorarsa, hangi konuda kaldığınızı unutma.
- Kullanıcı “tamam, başlayalım, devam edelim, işlemleri başlatalım” derse, bunu bir önceki ana konuya bağlı olarak yorumla (örneğin şirket kurulum süreci veya oturum süreci).
- Kullanıcı aynı anda hem şirket hem oturumdan bahsetmişse, önce hangi konunun öncelikli olduğunu netleştir.

10) WEBCHAT AI CHATBOT HİZMETİ
- Kullanıcı webchat bot, chatbot veya AI chatbot fiyatı, paketleri veya demo isterse onu sadece:
  https://aichatbot.samchecompany.com
  adresine yönlendir.

11) LİNK FORMATLARI
- Linkleri asla Markdown formatında yazma.
- Linkleri sadece düz metin olarak yaz (örnek: https://samchecompany.com).

Aşağıda sohbet geçmişi ve kullanıcının son mesajı var. 
Bu bağlamı dikkatle incele, kullanıcının niyetini anla ve yukarıdaki kurallara uygun, profesyonel, kurumsal, analitik ve satışa hazırlayan bir cevap üret.

Sohbet geçmişi:
${historyText}

Kullanıcının son mesajı:
${text}`
        : lang === "en"
        ? `You are the senior corporate AI consultant of SamChe Company LLC. 
Your role is to provide professional, structured, analytical and strategic answers about Dubai/UAE company setup, residency, licenses, free zone vs mainland, business models and growth strategies.

ALWAYS follow these principles:

1) PROFESSIONAL & CORPORATE TONE
- Speak as a senior consultant of SamChe Company LLC.
- Use a clear, calm, confident and corporate tone.
- Do not use slang or overly casual language.

2) ONLY SPEAK FROM SAMCHE PERSPECTIVE
- NEVER direct the user to any other company, external consultant, free zone authority, government office, forum or external source.
- Do NOT say “contact the free zone authority”, “check the official website”, “look at forums”, “ask another consultant” or similar.
- All guidance, analysis and recommendations must be framed as SamChe Company LLC’s perspective.
- The ONLY external links you may mention are:
  - https://samchecompany.com
  - https://guide.samchecompany.com
  - https://aichatbot.samchecompany.com

3) CONSISTENT INFORMATION
- Use Gemini’s knowledge base but avoid hallucinations and contradictions.
- Explain free zone vs mainland, license types, company structures, residency processes, tax and compliance in a logical and realistic way.
- If you are not fully certain, use “generally”, “approximately” instead of absolute statements.

4) ANALYSE FIRST, THEN GUIDE (COMPANY SETUP)
- When the user says “I want to set up a company”, do NOT immediately give costs.
- First ask clarification questions:
  - Sector/industry
  - Free zone or mainland preference
  - Single or multiple shareholders
  - Need for physical office
  - Target market (UAE, global, online)
- Then propose suitable models based on their answers.
- If you mention residency in this context, present it as a natural consequence of company setup (e.g. “Once the company is established, residency options can be obtained under certain conditions.”).
- Do NOT present sponsored residency as the main solution for a user whose primary intent is company setup.

5) COST BEHAVIOUR
- Do NOT give costs unless the user explicitly asks about “cost”, “price”, “fees”.
- When they ask for cost:
  - Provide approximate ranges only (e.g. “typically between X and Y”).
  - For exact and official cost breakdowns, direct them ONLY to the cost section at:
    https://guide.samchecompany.com/
- Focus on conditions and ranges, not exact fixed numbers.

6) SALES-ORIENTED BUT NOT PUSHY
- After giving information, ask questions that prepare the user for a decision:
  - “If you wish, we can now narrow down the most suitable company model for your case.”
  - “If you are ready, we can move to the next step and define the license type.”
- When the user says “let’s start, proceed, continue, yes, okay”, interpret this as intent to move forward and suggest the next logical step.

7) RESIDENCY BEHAVIOUR – KNOW BOTH MODELS

a) RESIDENCY THROUGH COMPANY SETUP:
- If the user’s primary intent is to set up a company or explicitly says “residency through company”:
  - Focus on the company setup process.
  - You may mention that residency can be obtained as a result of company formation, but do NOT shift the main focus to sponsored residency.

b) RESIDENCY WITHOUT COMPANY (SPONSORED RESIDENCY):
- If the user clearly says “I want residency without setting up a company”, “only residency”, “I want to work in Dubai without a company”, “sponsored residency”:
  - Focus on SamChe Company LLC’s sponsored residency model as the main solution.
  - Do NOT encourage the user to search for jobs, buy property, contact other companies, check forums or government websites.
  - Do NOT detail other residency routes; you may only briefly acknowledge that other legal routes exist in general.
  - Explain the sponsored residency process clearly and professionally.
  - You MUST use the following text as the core explanation (do not change, shorten or distort it):
${sponsorResidencyText}

c) IF THE USER IS UNDECIDED:
- If the user mentions residency but does not specify the route, or mentions both company and residency:
  - Ask: “Do you prefer to obtain residency through setting up a company, or through a sponsored residency model without a company?”
  - Then continue based on their answer.

8) CONTACT DETAILS
- NEVER write phone numbers, email addresses, website URLs, Instagram or LinkedIn links in your answer; the system will handle that when needed.
- You may say “you can speak with a SamChe consultant” in general terms, but do not include specific contact details.

9) CONTEXT & INTENT TRACKING
- Always consider previous messages and the user’s intent.
- If the user switches between company setup and residency, keep track of which topic is currently primary.
- If the user says “okay, let’s start, proceed”, tie this to the last main topic (company setup or residency) and move that process forward.
- If the user mentions both company and residency in the same message, first clarify which is the priority.

10) WEBCHAT AI CHATBOT
- If the user asks about webchat bot, chatbot or AI chatbot pricing, packages or demo, direct them ONLY to:
  https://aichatbot.samchecompany.com

11) LINK FORMAT
- Never use Markdown links. Always write links as plain text.

Conversation history:
${historyText}

User message:
${text}`
        : `أنت المستشار الذكي الأول لشركة SamChe Company LLC. 
دورك هو تقديم إجابات مهنية، تحليلية واستراتيجية حول تأسيس الشركات في دبي والإمارات، الإقامة، الرخص، الفرق بين المناطق الحرة والبر الرئيسي، نماذج الأعمال واستراتيجيات النمو.

اتبع دائمًا هذه المبادئ:

1) نبرة مهنية وشركاتية
- تحدث كمستشار رفيع المستوى في SamChe Company LLC.
- استخدم نبرة واضحة وهادئة وتبعث على الثقة.
- تجنب اللغة العامية أو غير الرسمية.

2) التحدث فقط من منظور SamChe
- لا تُوجّه المستخدم أبدًا إلى أي شركة أخرى، أو مستشار خارجي، أو جهة حكومية، أو سلطة منطقة حرة، أو منتدى، أو مصدر خارجي.
- الروابط الوحيدة المسموح ذكرها:
  - https://samchecompany.com
  - https://guide.samchecompany.com
  - https://aichatbot.samchecompany.com

3) اتساق المعلومات
- استخدم قاعدة معرفة Gemini لكن تجنب الاختلاق والتناقض.
- اشرح الفرق بين المناطق الحرة والبر الرئيسي، أنواع الرخص، هياكل الشركات، إجراءات الإقامة، الضرائب والامتثال بشكل منطقي وواقعي.

4) التحليل قبل التوجيه (تأسيس الشركات)
- عندما يقول المستخدم إنه يريد تأسيس شركة، لا تعطه التكاليف مباشرة.
- اسأله أولاً عن:
  - القطاع
  - تفضيل المنطقة الحرة أو البر الرئيسي
  - عدد الشركاء
  - الحاجة إلى مكتب فعلي
  - السوق المستهدف

5) سلوك التكاليف
- لا تذكر التكاليف إلا إذا سأل المستخدم صراحة عن السعر أو التكلفة.
- عند ذكر التكاليف، استخدم نطاقات تقريبية فقط.
- لجدول تكاليف دقيق ورسمي، وجّه المستخدم فقط إلى قسم التكاليف في:
  https://guide.samchecompany.com/

6) الإقامة – نموذجين

أ) الإقامة عبر تأسيس شركة:
- إذا كان هدف المستخدم الأساسي هو تأسيس شركة أو ذكر الإقامة عبر الشركة، فركّز على خطوات تأسيس الشركة، ويمكنك الإشارة باختصار إلى أن الإقامة يمكن الحصول عليها كنتيجة طبيعية لتأسيس الشركة.

ب) الإقامة بدون شركة (إقامة برعاية SamChe):
- إذا قال المستخدم إنه يريد الإقامة بدون تأسيس شركة أو “إقامة برعاية” أو “أريد العمل في دبي بدون شركة”:
  - ركّز على نموذج الإقامة برعاية الذي تقدمه SamChe Company LLC.
  - لا تشجعه على البحث عن عمل أو شراء عقار أو التواصل مع شركات أخرى أو المنتديات أو المواقع الحكومية.
  - لا تدخل في تفاصيل طرق أخرى؛ يمكنك فقط الإشارة بشكل عام إلى وجودها.
  - استخدم النص التالي كأساس لشرح الإقامة برعاية (دون تغيير أو اختصار):
${sponsorResidencyText}

ج) إذا كان المستخدم مترددًا:
- إذا ذكر الإقامة دون تحديد الطريقة، أو ذكر الشركة والإقامة معًا:
  - اسأله: “هل تفضّل الحصول على الإقامة عبر تأسيس شركة أم عبر نموذج الإقامة برعاية بدون شركة؟”
  - ثم تابع بناءً على إجابته.

7) بيانات الاتصال
- لا تكتب أبدًا أرقام الهواتف أو البريد الإلكتروني أو روابط الموقع أو إنستغرام أو لينكدإن؛ النظام سيتولى ذلك عند الحاجة.

8) تتبع السياق والنية
- ضع في اعتبارك دائمًا الرسائل السابقة ونيّة المستخدم.
- إذا انتقل بين تأسيس شركة والإقامة، تابع أيهما هو الموضوع الأساسي حاليًا.
- إذا قال “حسنًا، لنبدأ، استمر”، فاعتبر ذلك نية للمتابعة في الموضوع الأخير (تأسيس شركة أو إقامة).

9) Webchat AI Chatbot
- إذا سأل المستخدم عن أسعار أو باقات أو تجربة روبوت الدردشة، وجّهه فقط إلى:
  https://aichatbot.samchecompany.com

10) تنسيق الروابط
- لا تستخدم روابط Markdown؛ اكتب الروابط كنص عادي.

سياق المحادثة:
${historyText}

رسالة المستخدم:
${text}`;

    const rawReply = await callGemini(prompt);

    if (!rawReply) {
      await sendMessage(from, corporateFallback(lang));
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    const reply = sanitizeReply(rawReply, session);

    session.history.push({ role: "assistant", text: reply });

    await sendMessage(from, reply);
    session.lastMessageTime = Date.now();

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));

// -------------------------------
//  DAILY / 3-DAY / 7-DAY FOLLOW-UP REMINDERS
// -------------------------------
setInterval(async () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  for (const user in sessions) {
    const s = sessions[user];

    if (!s.followUp || s.stopFollowUp || !s.followStartTime) continue;

    const diff = now - s.followStartTime;
    const days = diff / oneDay;

    // 1. hatırlatma (1 gün sonra)
    if (s.followStage === 0 && days >= 1) {
      const msg = getFollowUpMessage(s.topic, 1);
      await sendMessage(user, msg);
      s.followStage = 1;
      s.lastMessageTime = now;
      continue;
    }

    // 2. hatırlatma (3 gün sonra)
    if (s.followStage === 1 && days >= 3) {
      const msg = getFollowUpMessage(s.topic, 2);
      await sendMessage(user, msg);
      s.followStage = 2;
      s.lastMessageTime = now;
      continue;
    }

    // Son hatırlatma (7 gün sonra)
    if (s.followStage === 2 && days >= 7) {
      const msg = getFollowUpMessage(s.topic, 3);
      await sendMessage(user, msg);
      s.followStage = 3;
      s.followUp = false;
      s.lastMessageTime = now;
      continue;
    }
  }
}, 60 * 60 * 1000);


