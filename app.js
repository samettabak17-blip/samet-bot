import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.0-flash" });

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  BASIT SESSION / HAFIZA & DURUM
// -------------------------------
const sessions = {};
// sessions[from] = { lang, history, flow: { mode, sector, visas } }

// -------------------------------
//  WHATSAPP MESAJ GÖNDERME
// -------------------------------
async function sendMessage(to, body) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// -------------------------------
//  SABİT METİNLER
// -------------------------------
const servicesList = {
  tr:
    "SamChe Company LLC olarak şu hizmetleri vermekteyiz:\n" +
    "1. Şirketlere Özel Yapay Zekâ Sistemleri & Otomasyon\n" +
    "2. Dijital Büyüme & İçerik Stratejisi\n" +
    "3. Marka Yönetimi & Sosyal Medya Geliştirme\n" +
    "4. Kitle Büyümesi & Performans Optimizasyonu\n" +
    "5. BAE Şirket Kurulumu & Pazar Giriş Danışmanlığı\n" +
    "6. Serbest Bölge Seçimi & Uyum (Compliance) Netliği",
  en:
    "SamChe Company LLC provides the following services:\n" +
    "1. Private AI Systems & Automation for Companies\n" +
    "2. Digital Growth & Content Strategy\n" +
    "3. Branding & Social Media Development\n" +
    "4. Audience Growth & Performance Optimization\n" +
    "5. UAE Business Setup & Market Entry Advisory\n" +
    "6. Free Zone Selection & Compliance Clarity",
  ar:
    "تقدم شركة SamChe Company LLC الخدمات التالية:\n" +
    "1. أنظمة ذكاء اصطناعي خاصة وأتمتة للشركات\n" +
    "2. استراتيجية النمو الرقمي والمحتوى\n" +
    "3. إدارة العلامة التجارية وتطوير وسائل التواصل الاجتماعي\n" +
    "4. نمو الجمهور وتحسين الأداء\n" +
    "5. تأسيس الأعمال في الإمارات ودخول السوق\n" +
    "6. اختيار المناطق الحرة وتوضيح المتطلبات التنظيمية",
};

const introAfterLang = {
  tr:
    "Merhaba, ben SamChe Company LLC'nin yapay zekâ asistanıyım.\n" +
    "Dubai’de şirket kuruluşu, vizeler, yaşam maliyetleri, iş planları, iş stratejileri, dijital büyüme gibi konularda istediğin soruyu sorabilirsin.\n\n" +
    servicesList.tr +
    "\n\nSize bugün nasıl yardımcı olabilirim?",
  en:
    "Hello, I am the AI assistant of SamChe Company LLC.\n" +
    "You can ask anything about company setup in Dubai, visas, cost of living, business plans, strategies, and digital growth.\n\n" +
    servicesList.en +
    "\n\nHow may I assist you today?",
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "يمكنك طرح أي سؤال حول تأسيس الشركات في دبي، التأشيرات، تكاليف المعيشة، خطط الأعمال، الاستراتيجيات، والنمو الرقمي.\n\n" +
    servicesList.ar +
    "\n\nكيف يمكنني مساعدتك اليوم؟",
};

const contactText = {
  tr:
    "SamChe Company LLC İletişim Bilgileri:\n" +
    "- Telefon: +971 52 728 8586\n" +
    "- E‑posta: info@samchecompany.com",
  en:
    "SamChe Company LLC Contact Details:\n" +
    "- Phone: +971 52 728 8586\n" +
    "- Email: info@samchecompany.com",
  ar:
    "بيانات الاتصال بشركة SamChe Company LLC:\n" +
    "- الهاتف: ‎+971 52 728 8586\n" +
    "- البريد الإلكتروني: info@samchecompany.com",
};

const chatbotDemo = {
  tr:
    "Yapay zekâ sohbet botu demo ve fiyat bilgisi için şu sayfayı ziyaret edebilirsiniz:\nhttps://aichatbot.samchecompany.com/",
  en:
    "For AI chatbot demo and pricing, please visit:\nhttps://aichatbot.samchecompany.com/",
  ar:
    "لعرض تجريبي وأسعار روبوتات الدردشة بالذكاء الاصطناعي، يرجى زيارة:\nhttps://aichatbot.samchecompany.com/",
};

// -------------------------------
//  WEBHOOK DOĞRULAMA
// -------------------------------
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// -------------------------------
//  ŞİRKET KURULUMU FİYAT HESABI (BASİT LOGİK)
// -------------------------------
function calculateSetupPrice(visas) {
  const v = parseInt(visas || "1", 10);
  const base =
    v <= 1 ? 12000 : v === 2 ? 15000 : v === 3 ? 18000 : 20000 + (v - 3) * 2000;
  const min = base + 6000;
  const max = base + 7000;
  return { min, max };
}

// -------------------------------
//  WEBHOOK MESAJ
// -------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    let text = message.text?.body || "";
    const lower = text.toLowerCase();

    // İlk kez yazan kullanıcı
    if (!sessions[from]) {
      sessions[from] = {
        lang: null,
        history: [],
        flow: { mode: "chat", sector: null, visas: null },
      };

      await sendMessage(
        from,
        "Welcome to SamChe Company LLC.\n" +
          "SamChe Company LLC'ye hoş geldiniz.\n" +
          "مرحبًا بكم في شركة SamChe Company LLC.\n\n" +
          "Please select your preferred language:\n" +
          "Lütfen tercih ettiğiniz dili seçiniz:\n" +
          "الرجاء اختيار لغتك المفضلة:\n\n" +
          "1️⃣ English\n" +
          "2️⃣ Türkçe\n" +
          "3️⃣ العربية"
      );

      return res.sendStatus(200);
    }

    const session = sessions[from];

    // Dil seçimi
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

    // İletişim / canlı görüşme isteği
    if (
      lower.includes("iletişim") ||
      lower.includes("contact") ||
      lower.includes("görüşme") ||
      lower.includes("call") ||
      lower.includes("whatsapp") ||
      lower.includes("telefon")
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    // AI chatbot demo / fiyat isteği
    if (
      lower.includes("bot") ||
      lower.includes("chatbot") ||
      lower.includes("ai bot") ||
      lower.includes("demo") ||
      lower.includes("fiyat") && lower.includes("bot")
    ) {
      await sendMessage(from, chatbotDemo[lang]);
      return res.sendStatus(200);
    }

    // Şirket kurmak istiyorum niyeti → özel akış
    if (
      session.flow.mode === "chat" &&
      (lower.includes("şirket kurmak") ||
        lower.includes("company setup") ||
        lower.includes("business setup") ||
        lower.includes("company formation") ||
        lower.includes("dubai'de şirket") ||
        lower.includes("dubai de şirket"))
    ) {
      session.flow.mode = "setup_sector";
      await sendMessage(
        from,
        lang === "tr"
          ? "Hangi sektörde şirket kurmak istiyorsunuz? (Örn: e‑ticaret, danışmanlık, teknoloji...)"
          : lang === "en"
          ? "In which sector do you want to set up the company? (e.g. e‑commerce, consulting, technology...)"
          : "في أي قطاع ترغب في تأسيس الشركة؟ (مثال: تجارة إلكترونية، استشارات، تقنية...)"
      );
      return res.sendStatus(200);
    }

    // Sektör sorusuna cevap
    if (session.flow.mode === "setup_sector") {
      session.flow.sector = text;
      session.flow.mode = "setup_visas";

      await sendMessage(
        from,
        lang === "tr"
          ? "Şirket için yaklaşık kaç vize (çalışan/ortak) planlıyorsunuz?"
          : lang === "en"
          ? "Approximately how many visas (partners/employees) do you plan for this company?"
          : "تقريبًا كم عدد التأشيرات (شركاء/موظفين) تخطط لهذه الشركة؟"
      );
      return res.sendStatus(200);
    }

    // Vize sayısı
    if (session.flow.mode === "setup_visas") {
      session.flow.visas = text;
      session.flow.mode = "chat";

      const { min, max } = calculateSetupPrice(text);

      let msg;
      if (lang === "tr") {
        msg =
          `Teşekkürler. Sektör: ${session.flow.sector}, Vize sayısı: ${session.flow.visas}.\n\n` +
          `Genel piyasa koşullarına göre, bu tip bir şirket kuruluşu için yaklaşık paket aralığı (lisans, temel kurulum, danışmanlık dahil) şu şekildedir:\n` +
          `👉 Yaklaşık: ${min.toLocaleString("en-US")} – ${max.toLocaleString(
            "en-US"
          )} AED\n\n` +
          `Bu rakamlar genel bir aralıktır; serbest bölge seçimi, ofis tipi, faaliyet kodu ve ek hizmetlere göre netleştirilebilir.\n` +
          `İsterseniz, size daha net bir plan ve adım adım yol haritası da çıkarabilirim.`;
      } else if (lang === "en") {
        msg =
          `Thank you. Sector: ${session.flow.sector}, Visas: ${session.flow.visas}.\n\n` +
          `Based on typical market ranges, a company setup of this type (license, basic setup, advisory) would generally fall around:\n` +
          `👉 Approx.: ${min.toLocaleString("en-US")} – ${max.toLocaleString(
            "en-US"
          )} AED\n\n` +
          `These figures are indicative and can be refined based on free zone choice, office model, activity codes, and additional services.\n` +
          `If you wish, I can also outline a clearer step‑by‑step plan for you.`;
      } else {
        msg =
          `شكرًا لك. القطاع: ${session.flow.sector}، عدد التأشيرات: ${session.flow.visas}.\n\n` +
          `استنادًا إلى نطاقات السوق العامة، فإن تأسيس شركة من هذا النوع (رخصة، إعداد أساسي، استشارات) يكون تقريبًا في حدود:\n` +
          `👉 تقريبًا: ${min.toLocaleString("en-US")} – ${max.toLocaleString(
            "en-US"
          )} درهم إماراتي\n\n` +
          `هذه الأرقام تقديرية ويمكن تعديلها حسب المنطقة الحرة، نوع المكتب، الأنشطة والخدمات الإضافية.\n` +
          `إذا رغبت، يمكنني أيضًا توضيح خطة عمل وخطوات مفصلة لك.`;
      }

      await sendMessage(from, msg);
      return res.sendStatus(200);
    }

    // Hafızaya ekle
    session.history.push({ role: "user", text });
    if (session.history.length > 10) {
      session.history = session.history.slice(-10);
    }

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    const samcheProfile = `
SamChe Company LLC is a UAE‑based consultancy focused on Private AI systems, digital growth strategy, and business setup clarity for entrepreneurs and small businesses.
We help clients build structure, confidence, and long‑term momentum across both their online presence and their company formation journey.

Our digital advisory work includes AI‑powered content strategy, branding, social media development, audience growth, and performance optimization—ensuring every action is measurable, practical, and aligned with real‑world execution.

On the business setup side, we guide clients through UAE market entry, free zone selection, compliance clarity, and launch planning, removing uncertainty and enabling informed decision‑making.

By combining AI innovation, digital strategy, and UAE regulatory insight, SamChe empowers founders and businesses to grow with simplicity, confidence, and strategic direction.
    `;

    const prompts = {
      en: `
You are the private, official assistant of SamChe Company LLC.
You act as:
- Dubai business setup consultant,
- UAE market and strategy advisor,
- Private AI and digital growth expert.

Rules:
- Answer ONLY within SamChe's service scope and the company profile below.
- Do NOT invent services, locations, prices, or contact details.
- Do NOT mention any external model, provider, or source.
- Respond in clear, formal English.
- You can guide step‑by‑step on: company setup, visas, costs, strategy, AI integration into business, and digital growth.
- If user asks for AI chatbot pricing or demo, you may also suggest visiting the AI chatbot page, but only if they explicitly ask.

Company profile:
${samcheProfile}

Conversation context:
${historyText}

Latest user message:
${text}
      `,
      tr: `
Sen SamChe Company LLC'nin özel ve resmi asistanısın.
Şu rollerde davranırsın:
- Dubai şirket kuruluş danışmanı,
- BAE pazar ve iş stratejisi danışmanı,
- Özel yapay zekâ ve dijital büyüme uzmanı.

Kurallar:
- Sadece SamChe'nin hizmet kapsamı ve aşağıdaki şirket profili çerçevesinde cevap ver.
- Yeni hizmet, lokasyon, fiyat veya iletişim bilgisi uydurma.
- Herhangi bir model, sağlayıcı veya kaynak ismi verme.
- Net, resmi ve kurumsal bir Türkçe ile cevap ver.
- Şirket kuruluşu, vizeler, maliyetler, iş planı, strateji, yapay zekânın işe entegrasyonu ve dijital büyüme konularında adım adım yönlendirme yap.
- Kullanıcı özellikle bot fiyatı veya demo isterse, AI chatbot sayfasını önerebilirsin.

Şirket profili:
${samcheProfile}

Sohbet bağlamı:
${historyText}

Kullanıcının son mesajı:
${text}
      `,
      ar: `
أنت المساعد الرسمي والخاص لشركة SamChe Company LLC.
تعمل كـ:
- مستشار لتأسيس الأعمال في دبي،
- مستشار لاستراتيجية السوق في الإمارات،
- خبير في الذكاء الاصطناعي الخاص والنمو الرقمي.

القواعد:
- أجب فقط ضمن نطاق خدمات SamChe وملف الشركة أدناه.
- لا تخترع خدمات أو مواقع أو أسعار أو بيانات اتصال جديدة.
- لا تذكر أي نموذج أو مزود أو مصدر خارجي.
- أجب بلغة عربية رسمية وواضحة.
- يمكنك الإرشاد خطوة بخطوة في: تأسيس الشركات، التأشيرات، التكاليف، الخطط، الاستراتيجيات، دمج الذكاء الاصطناعي في العمل، والنمو الرقمي.
- إذا طلب المستخدم صراحة أسعار أو عرضًا تجريبيًا لروبوتات الدردشة، يمكنك اقتراح صفحة روبوت الدردشة.

ملف الشركة:
${samcheProfile}

سياق المحادثة:
${historyText}

رسالة المستخدم الأخيرة:
${text}
      `,
    };

    const result = await model.generateContent(prompts[lang]);
    const reply = result.response.text();

    session.history.push({ role: "assistant", text: reply });

    await sendMessage(from, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error("WhatsApp Error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("SamChe Bot running on port " + port);
});

