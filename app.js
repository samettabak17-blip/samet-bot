// app.js – WhatsApp + Gemini 2.0 Flash
// Bağlamlı, niyet takibi + iletişim filtresi + ödeme akışı + oturum/şirket ayrımı
// + Profesyonel SamChe danışman prompt’u

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
//  TOPIC DETECTION (KONU ALGILAMA)
// -------------------------------
function detectTopic(text) {
  const t = text.toLowerCase();

  if (
    t.includes("company") ||
    t.includes("şirket") ||
    t.includes("sirket") ||
    t.includes("kurmak") ||
    t.includes("business setup") ||
    t.includes("firma açmak") ||
    t.includes("firma acmak") ||
    t.includes("freezone") ||
    t.includes("free zone") ||
    t.includes("mainland")
  )
    return "company_setup";

  if (
    t.includes("residency") ||
    t.includes("oturum") ||
    t.includes("visa") ||
    t.includes("vize") ||
    t.includes("sponsor") ||
    t.includes("sponsorlu oturum") ||
    t.includes("freelance visa") ||
    t.includes("freelance vize")
  )
    return "residency";

  if (t.includes("license") || t.includes("trade license")) return "license";

  return null;
}

// SADECE SPONSORLU OTURUM İSTEYENLER (ŞİRKET KURMAK İSTEMEYEN)
function isSponsorOnlyResidency(text) {
  const t = text.toLowerCase();
  const residencyWords =
    t.includes("oturum almak istiyorum") ||
    t.includes("sponsorlu oturum almak istiyorum") ||
    t.includes("freelance visa") ||
    t.includes("freelance vize") ||
    t.includes("sadece oturum") ||
    t.includes("sadece residency") ||
    t.includes("oturum istiyorum");
  const companyWords =
    t.includes("şirket") ||
    t.includes("sirket") ||
    t.includes("company") ||
    t.includes("kurmak") ||
    t.includes("business setup") ||
    t.includes("firma açmak") ||
    t.includes("firma acmak");

  return residencyWords && !companyWords;
}

// İLK OTURUM SORUSU MU? (GENEL BİLGİ İSTEĞİ)
function isInitialResidencyQuestion(text) {
  const t = text.toLowerCase();
  if (
    t.includes("oturum almak istiyorum") ||
    t.includes("sponsorlu oturum almak istiyorum") ||
    t.includes("oturum nasıl alınır") ||
    t.includes("oturum nasil alinir") ||
    t.includes("oturum süreci") ||
    t.includes("oturum sureci") ||
    t.includes("oturum başvurusu") ||
    t.includes("oturum basvurusu") ||
    t.includes("freelance visa") ||
    t.includes("freelance vize")
  ) {
    return true;
  }
  return false;
}

// -------------------------------
//  FOLLOW-UP MESSAGE (KONUYA GÖRE)
// -------------------------------
function getFollowUpMessage(topic, stage) {
  let base;
  switch (topic) {
    case "company_setup":
      base =
        "Merhaba, şirket kurma süreciyle ilgili konuşmamız yarım kalmıştı. Hazırsanız devam edebiliriz.";
      break;
    case "residency":
      base =
        "Merhaba, oturum ve sponsorlu oturum süreciyle ilgili konuşmamız yarım kalmıştı. İsterseniz devam edebiliriz.";
      break;
    case "license":
      base =
        "Merhaba, trade license süreciyle ilgili konuşmamız yarım kalmıştı. Hazırsanız devam edebiliriz.";
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
//  SPONSORLU OTURUM MESAJI
// -------------------------------
const sponsorResidencyText =
  "Bu ülkede yaşayabilmeniz ve çalışabilmeniz için size birilerinin sponsor olması gerekiyor ya da şirket açıp kendinize sponsor olmanız gerekiyor. " +
  "Şirket kurmadan da dilerseniz biz bu sponsorlugu sizin için sağlıyoruz; yani iki yıllık oturumunuz için burada firmalar size sponsor oluyor. " +
  "Bu sponsorlukla burada yaşayabiliyorsunuz fakat o firmada çalışmıyorsunuz, firma size sadece oturumunuz için sponsor oluyor. " +
  "İşlemleriniz tamamlandıktan sonra sponsor firmanızın size sunduğu NOC Belgesi (No Objection Certificate) ile ülkede istediğiniz sektörde resmi olarak çalışma hakkına " +
  "ya da iş kurma hakkına sahip oluyorsunuz. Bu belge sponsorunuzun ekstra bir işte çalışmanıza itirazı olmadığını gösteren belgedir. " +
  "Dubai iki yıllık sponsorlu oturum ve çalışma izni için işlemleri Türkiye’den başlatıyoruz, ülkeye çalışan vizesi ile giriş yapıyorsunuz.\n\n" +
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
      "Dubai’de şirket kuruluşu, serbest bölge seçimi, vizeler, maliyetler, iş modeli, pazar stratejisi veya yapay zekâ çözümleri hakkında daha net bir soru sorabilirsiniz."
    );
  }
  if (lang === "en") {
    return (
      "I couldn’t fully understand your question, but I’d be glad to assist. " +
      "You may ask more specifically about Dubai company setup, free zones, visas, costs, business models, or AI solutions."
    );
  }
  return (
    "لم أفهم سؤالك تمامًا، لكن يسعدني مساعدتك. " +
    "يمكنك طرح سؤال أكثر تحديدًا حول تأسيس الشركات في دبي، المناطق الحرة، التأشيرات، التكاليف أو حلول الذكاء الاصطناعي."
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
    "BAE şirket kuruluşu, vizeler, yaşam maliyetleri, iş planları, iş stratejileri, yapay zekâ çözümleri ve webchat AI chatbot hizmetleri hakkında sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?\n\n" +
    servicesList.tr,
  en:
    "Hello, I am the AI consultant of SamChe Company LLC.\n" +
    "I can answer your questions about UAE company formation, visas, cost of living, business plans, business strategies, AI solutions, and webchat AI chatbot services. How can I assist you?\n\n" +
    servicesList.en,
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "أستطيع مساعدتك في تأسيس الشركات في الإمارات، التأشيرات، تكاليف المعيشة، خطط الأعمال، الاستراتيجيات، حلول الذكاء الاصطناعي وخدمة روبوت الدردشة الذكي (Webchat AI Chatbot). كيف يمكنني مساعدتك؟\n\n" +
    servicesList.ar,
};

const contactText = {
  tr:
    "Size özel bir danışmanla görüşmek ve resmi teklif almak için iletişim bilgilerimiz:\n" +
    "mail: info@samchecompany.com\n" +
    "telefon: +971 50 179 38 80 - +971 52 662 28 75\n" +
    "web: https://samchecompany.com\n" +
    "instagram: https://www.instagram.com/samchecompany\n" +
    "linkedin: https://www.linkedin.com/company/samche-company-llc",
  en:
    "To speak with a dedicated consultant and receive an official quotation, you can use our contact details:\n" +
    "mail: info@samchecompany.com\n" +
    "phone: +971 50 179 38 80 - +971 52 662 28 75\n" +
    "web: https://samchecompany.com\n" +
    "instagram: https://www.instagram.com/samchecompany\n" +
    "linkedin: https://www.linkedin.com/company/samche-company-llc",
  ar:
    "للتحدث مع مستشار مخصص والحصول على عرض رسمي، يمكنك استخدام بيانات الاتصال التالية:\n" +
    "البريد الإلكتروني: info@samchecompany.com\n" +
    "الهاتف: ‎+971 50 179 38 80 - ‎+971 52 662 28 75\n" +
    "الموقع: https://samchecompany.com\n" +
    "إنستغرام: https://www.instagram.com/samchecompany\n" +
    "لينكدإن: https://www.linkedin.com/company/samche-company-llc",
};

// -------------------------------
//  REPLY SANITIZATION (İLETİŞİM BİLGİSİ FİLTRESİ)
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
        "Kredi kartı veya online ödeme için lütfen canlı temsilci ile iletişime geçin: +971 50 179 38 80"
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
    //  KOMUT ALGILAMA (BAŞLAYALIM / DEVAM / EVET vb.)
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
      // Eğer hem şirket hem oturum daha önce konuşulduysa ve net intent yoksa
      if (!session.lastIntent) {
        await sendMessage(
          from,
          "Hangi işlem için başlamak istersiniz? Şirket kuruluşu mu, yoksa sponsorlu oturum süreci mi?"
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }

      if (session.lastIntent === "company_setup") {
        await sendMessage(
          from,
          "Dubai’de şirket kuruluşu için süreci başlatıyoruz. Size uygun şirket türünü, freezone/mainland seçeneklerini ve gerekli evrakları adım adım planlayabiliriz. İsterseniz önce hangi serbest bölgenin size daha uygun olacağını netleştirelim."
        );
      } else if (session.lastIntent === "residency") {
        await sendMessage(
          from,
          "İki yıllık sponsorlu oturum sürecini başlatıyoruz. Öncelikle pasaport ve biyometrik fotoğrafınızı PDF olarak hazırlayın, ardından ödeme adımına geçebiliriz."
        );
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

    // SADECE SPONSORLU OTURUM İSTEĞİ (ŞİRKET KURMAK İSTEMEYEN)
    if (!session.residencyExplained && isSponsorOnlyResidency(lower)) {
      await sendMessage(from, sponsorResidencyText);
      session.residencyExplained = true;
      session.lastIntent = "residency";
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // İLK OTURUM SORUSU (GENEL BİLGİ) - ŞİRKET KURMAK İSTEYENLER HARİÇ
    const topicNow = detectTopic(text);
    const mentionsCompany =
      lower.includes("şirket") ||
      lower.includes("sirket") ||
      lower.includes("company") ||
      lower.includes("business setup") ||
      lower.includes("firma açmak") ||
      lower.includes("firma acmak");

    if (
      topicNow === "residency" &&
      !session.residencyExplained &&
      isInitialResidencyQuestion(lower) &&
      !mentionsCompany
    ) {
      await sendMessage(from, sponsorResidencyText);
      session.residencyExplained = true;
      session.lastIntent = "residency";
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
        session.residencyExplained
      ) {
        session.payment = {
          type: "residency",
          stage: "askCurrency",
          currency: null,
        };
        session.lastIntent = "payment";
        await sendMessage(
          from,
          "İki yıllık sponsorlu oturum için ödemenizi hangi para birimiyle yapmak istersiniz? USD olarak mı yoksa TL olarak mı ödemek istersiniz?"
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
            "İki yıllık sponsorlu oturum için ödemenizi USD olarak tek seferde yapabilirsiniz. Şirket banka bilgilerimiz:\n\n" +
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
          "TL ile ödeme yapmak isterseniz, lütfen evraklarınızı ve ödeme talebinizi doğrudan canlı temsilcimize iletin: +971 50 179 38 80"
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
      await sendMessage(
        from,
        "İki yıllık sponsorlu oturum için en az 3 yıllık geçerli pasaportunuz ve biyometrik fotoğrafınızı PDF olarak göndermeniz yeterlidir."
      );
      session.lastIntent = "documents";
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // TOPIC DETECTION & FOLLOW-UP START
    const topic = detectTopic(text);
    if (topic && !session.stopFollowUp) {
      if (!session.followUp) {
        session.followUp = true;
        session.topic = topic;
        session.followStartTime = Date.now();
        session.followStage = 0;
      }
      if (topic === "company_setup") session.lastIntent = "company_setup";
      if (topic === "residency") session.lastIntent = "residency";
      if (topic === "license") session.lastIntent = "company_setup";
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
        topic === "company_setup" || topic === "residency";

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
          "Size daha doğru yardımcı olabilmem için önce birkaç temel bilginizi ve sorularınızı yazmanız çok daha sağlıklı olur. Ardından gerekirse sizi bir danışmana yönlendirebilirim."
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
    //  GEMINI PROMPT (YENİ TR PROFESYONEL DANIŞMAN)
    // -------------------------------
    const prompt =
      lang === "tr"
        ? `SamChe Company LLC’nin kıdemli iş kurulum ve strateji danışmanısın. 
Görevin, Dubai ve BAE’de şirket kurmak, oturum almak, lisans süreçleri, serbest bölge/mainland seçimi, iş modeli ve büyüme stratejileri konusunda profesyonel, kurumsal ve analitik cevaplar vermek.

Aşağıdaki ilkelere HER ZAMAN uy:

1) PROFESYONEL VE KURUMSAL TON
- SamChe Company LLC’nin uzman danışmanı gibi konuş.
- Net, sakin, güven veren, kurumsal bir dil kullan.
- Gereksiz süslü cümleler, abartılı satış dili kullanma.
- “Biz” diliyle konuşabilirsin ama samimiyeti abartma.

2) BİLGİ VERMEKTE TUTARLI OL
- Bilgi verirken Gemini’nin kendi bilgi tabanını kullan.
- Uydurma, mantıksız veya çelişkili bilgi üretme.
- Freezone/mainland farkları, lisans tipleri, şirket türleri, oturum süreçleri, vergi ve uyum konularında mantıklı, tutarlı ve gerçekçi açıklamalar yap.
- Emin olmadığın bir bilgiyi “kesin” gibi sunma; gerekirse “genel olarak”, “yaklaşık olarak” gibi ifadeler kullan.

3) ÖNCE ANALİZ, SONRA YÖNLENDİRME
- Kullanıcı “şirket kurmak istiyorum” dediğinde hemen maliyet verme.
- Önce analiz soruları sor:
  - Hangi sektörde faaliyet göstereceksiniz?
  - Freezone mu yoksa Mainland mi düşünüyorsunuz?
  - Tek ortaklı mı yoksa çok ortaklı bir yapı mı planlıyorsunuz?
  - Fiziksel ofis ihtiyacınız var mı?
  - Hedef pazarınız neresi (BAE içi, global, online vs.)?
- Bu sorularla kullanıcının ihtiyacını netleştir, sonra öneri ver.

4) MALİYET DAVRANIŞI
- Kullanıcı açıkça “maliyet”, “fiyat”, “ücret” sormadan kendiliğinden maliyet çıkarma.
- Kullanıcı “maliyet nedir, fiyat nedir, ne kadar tutar?” gibi sorarsa:
  - Yaklaşık aralıklar verebilirsin (örneğin: “genellikle X–Y aralığında değişir”).
  - Net ve resmi fiyat tablosu isteyenleri https://guide.samchecompany.com/ adresindeki maliyet bölümüne yönlendirebilirsin.
- Maliyet verirken:
  - Çok net rakamlar yerine aralık ve koşul odaklı konuş (“seçilen bölgeye, lisans tipine ve iş modeline göre değişir” gibi).

5) SATIŞ ODAKLI AMA BASKICI OLMADAN
- Kullanıcıya bilgi verdikten sonra onu satışa hazırlayan sorular sor:
  - “İsterseniz sizin durumunuza göre en uygun şirket modelini birlikte netleştirebiliriz.”
  - “Hazırsanız bir sonraki adım olarak lisans tipini belirleyebiliriz.”
- Kullanıcı “başlayalım, devam edelim, tamam, evet” gibi ifadeler kullanırsa:
  - Bunu süreci ilerletme niyeti olarak yorumla.
  - Bir sonraki mantıklı adımı öner (örneğin: “O zaman önce şirket türünü netleştirelim.”).

6) İLETİŞİM BİLGİSİ VERME
- Kullanıcıya asla telefon numarası, e-posta adresi, web sitesi, Instagram veya LinkedIn linki verme.
- İletişim bilgisi paylaşma işini sistem yönetecek; sen sadece “bir danışmanla detaylı görüşme yapabilirsiniz” gibi genel ifadeler kullan.
- “İsterseniz bir danışmanla detaylı bir görüşme planlanabilir.” gibi cümleler kurabilirsin ama asla numara/mail/link yazma.

7) BAĞLAM VE NİYET TAKİBİ
- Her cevabında kullanıcının önceki mesajlarını ve niyetini dikkate al.
- Kullanıcı önce şirket, sonra oturum, sonra tekrar şirket sorarsa, hangi konuda kaldığınızı unutma.
- Kullanıcı “tamam, başlayalım, devam edelim, işlemleri başlatalım” derse, bunu bir önceki ana konuya bağlı olarak yorumla (örneğin şirket kurulum süreci veya oturum süreci).
- Bağlamdan kopma, konu değiştiyse bunu fark et ve gerekiyorsa netleştirici soru sor (“Şu an şirket kuruluşu mu yoksa oturum süreci mi sizin için öncelikli?” gibi).

8) WEBCHAT AI CHATBOT HİZMETİ
- Kullanıcı webchat bot, chatbot veya AI chatbot fiyatı, paketleri veya demo isterse onu https://aichatbot.samchecompany.com adresine yönlendir.
- Bu linki düz metin olarak yaz, Markdown kullanma.

9) LİNK FORMATLARI
- Linkleri asla Markdown formatında yazma.
- Linkleri sadece düz metin olarak yaz (örnek: https://samchecompany.com).

10) OTURUM DİLİ
- Oturum türlerini anlatırken “istihdam yoluyla” ifadesi yerine “sponsorlu oturum” ifadesini kullan.
- Sponsorlu oturumun mantığını sade ve net şekilde açıklayabilirsin.

Aşağıda sohbet geçmişi ve kullanıcının son mesajı var. 
Bu bağlamı dikkatle incele, kullanıcının niyetini anla ve yukarıdaki kurallara uygun, profesyonel, kurumsal, analitik ve satışa hazırlayan bir cevap üret.

Sohbet geçmişi:
${historyText}

Kullanıcının son mesajı:
${text}`
        : lang === "en"
        ? `You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic, structured, analytical, advisory answers. Never share phone numbers, email addresses, website URLs, Instagram or LinkedIn links; the system will handle contact details. You only explain processes, options, pros/cons, approximate cost ranges and strategic recommendations. Even if the user is serious, do not provide direct contact details; you may only say that they can speak with a consultant in general terms. SamChe Company LLC also provides webchat AI chatbot solutions. If the user asks about webchat bot, chatbot or AI chatbot pricing, packages or demo, direct them to https://aichatbot.samchecompany.com. For users who want to set up a company in the UAE, you may explain company types, free zone vs mainland, license types, process steps and approximate cost ranges. If the user wants an exact, official cost breakdown or quotation, you may direct them to the cost section at https://guide.samchecompany.com/. Conversation history:\n${historyText}\n\nUser message:\n${text}`
        : `أنت المستشار الذكي لشركة SamChe Company LLC. قدم إجابات تحليلية واستراتيجية وواضحة. لا تشارك أبدًا أرقام الهواتف أو عناوين البريد الإلكتروني أو روابط الموقع أو إنستغرام أو لينكدإن؛ النظام هو الذي يدير بيانات الاتصال. دورك هو شرح الإجراءات والخيارات والمزايا والعيوب والتكاليف التقريبية والتوصيات الاستراتيجية فقط. حتى لو كان المستخدم جادًا، لا تقدم بيانات الاتصال مباشرة؛ يمكنك فقط الإشارة بشكل عام إلى إمكانية التحدث مع مستشار. تقدم SamChe Company LLC أيضًا حلول Webchat AI Chatbot. إذا سأل المستخدم عن أسعار أو باقات أو تجربة روبوت الدردشة، فقم بتوجيهه إلى https://aichatbot.samchecompany.com. إذا أراد المستخدم تأسيس شركة في الإمارات، يمكنك شرح أنواع الشركات، الفرق بين المناطق الحرة والبر الرئيسي، أنواع الرخص، خطوات العملية والتكاليف التقريبية. إذا طلب المستخدم عرض أسعار رسمي أو جدول تكاليف دقيق، يمكنك توجيهه إلى قسم التكاليف في https://guide.samchecompany.com/. سياق المحادثة:\n${historyText}\n\nرسالة المستخدم:\n${text}`;

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
