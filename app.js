// app.js – WhatsApp + Gemini 2.0 Flash (OTOMATİK DİL TESPİTİ - TAM VE TEMİZ SÜRÜM)

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
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + process.env.GEMINI_API_KEY;
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
  if (t.includes("şirket") || t.includes("company") || t.includes("business setup")) return "company";
  if (t.includes("oturum") || t.includes("residency") || t.includes("visa")) return "residency";
  if (t.includes("ai") || t.includes("bot") || t.includes("chatbot")) return "ai";
  if (t.includes("maliyet") || t.includes("cost") || t.includes("price")) return "cost";
  return "other";
}

function calculateIntentScore(text, currentScore = 0) {
  const t = text.toLowerCase();
  let score = currentScore;
  if (t.includes("şirket kurmak") || t.includes("company setup")) score += 30;
  if (t.includes("oturum almak") || t.includes("residency")) score += 25;
  if (t.includes("bütçe") || t.includes("budget") || t.includes("price")) score += 15;
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

    const isInvalid = ["image", "audio", "voice", "video", "sticker", "document"].includes(message.type) || !text.trim();
    if (isInvalid) {
      await sendMessage(from, "Gönderdiğiniz içeriği görüntüleyemiyorum veya sesli komutları işleyemiyorum. Lütfen mesajınızı yazılı olarak iletir misiniz?");
      return res.sendStatus(200);
    }

    // SESSION OLUŞTURMA VE DİL TESPİTİ
    if (!sessions[from]) {
      const detectLangPrompt = `Identify the language: "${text}". Reply ONLY with "tr", "en", or "ar". If unsure, reply "en".`;
      const detectedLang = await callGemini(detectLangPrompt);
      const finalLang = ["tr", "en", "ar"].includes(detectedLang?.toLowerCase()) ? detectedLang.toLowerCase() : "en";

      sessions[from] = {
        lang: finalLang,
        history: [],
        lastMessageTime: Date.now(),
        followUpStage: 0,
        intentScore: 0,
        topics: [],
        profile: { name: null, country: null, budget: null, interest: null },
      };
    }

    const session = sessions[from];
    const lang = session.lang;

    // SABİT KOMUTLAR
    if (lower.includes("contact") || lower.includes("iletişim") || lower.includes("whatsapp") || lower.includes("telefon")) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    if (lower.includes("ai bot") || lower.includes("chatbot") || lower.includes("bot fiyat") || lower.includes("ai fiyat")) {
      await sendMessage(from, "AI chatbot fiyat ve planları için şu sayfayı ziyaret edebilirsiniz:\nhttps://aichatbot.samchecompany.com");
      return res.sendStatus(200);
    }

    // BELLEK GÜNCELLEME
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();
    session.lastMessageTime = Date.now();
    session.followUpStage = 0;

    const topic = detectTopic(text);
    if (!session.topics) session.topics = [];
    if (topic !== "other" && !session.topics.includes(topic)) session.topics.push(topic);
    session.intentScore = calculateIntentScore(text, session.intentScore || 0);

    const historyText = session.history.map((m) => `User: ${m.text}`).join("\n");

    // PROMPTLAR (ORİJİNAL app.txt İÇERİĞİ)
   // PROMPT
const prompt =
lang === "tr"
? `SamChe Company LLC’nin kurumsal yapay zekâ danışmanısın. Profesyonel, stratejik, analitik ve yol gösterici cevaplar ver. Gemini’nin kendi hazır kalıplarını, prosedür metinlerini, devlet süreçlerini, klasik açıklamalarını, resmi yönlendirmelerini ASLA kullanma. KENDİ KALIPLARINI ÜRETME.SADECE BU PROMPTTA TANIMLANAN KURALLARA UYGUN CEVAP VER.

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

Sohbet geçmişi:
${historyText}

Kullanıcının son mesajı:
${text}`

    } else if (lang === "en") {
      prompt = `You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic and advisory answers.
      NO standard government templates. Use only SamChe procedures.
      
      RESIDENCY TEXT: "Total cost is 13,000 AED... Duration: 30 days."
      
      BANK DETAILS: Account holder: SamChe Company LLC, IBAN: AE210860000009726414926.
      
      History: ${historyText}
      User: ${text}`;
    } else {
      prompt = `أنت المستشار الذكي الرسمي لشركة SamChe Company LLC... [Arapça Kurallar] \n\n ${historyText} \n\n ${text}`;
    }

    const reply = await callGemini(prompt);
    if (!reply) {
      await sendMessage(from, corporateFallback(lang));
    } else {
      session.history.push({ role: "assistant", text: reply });
      await sendMessage(from, reply);
    }
    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  CRON JOB - TAKİP MESAJLARI
// -------------------------------
cron.schedule("0 * * * *", async () => {
  try {
    const now = Date.now();
    for (const user in sessions) {
      const s = sessions[user];
      const diffHours = (now - s.lastMessageTime) / (1000 * 60 * 60);
      const lastTopic = s.topics[s.topics.length - 1] || "general";
      let message = "";

      // 24 SAAT TAKİBİ
      if (s.followUpStage === 0 && diffHours >= 24 && diffHours < 72) {
        if (lastTopic === "company") message = "Merhaba, Dubai’de şirket kurulumuyla ilgili önceki değerlendirmemizi gözden geçirmek üzere tekrar iletişime geçiyorum. Sürece başlamak veya detayları netleştirmek isterseniz yardımcı olabilirim.";
        else if (lastTopic === "residency") message = "Merhaba, Dubai oturum ve vize seçenekleriyle ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum. Herhangi bir sorunuz olursa yanıtlamaktan memnuniyet duyarım.";
        else message = "Merhaba, bir süre iletişim sağlayamadığımızı fark ettim. İhtiyaç duyduğunuz herhangi bir bilgi olursa memnuniyetle yardımcı olurum.";
        
        await sendMessage(user, message);
        s.followUpStage = 1;
      }
      
      // 72 SAAT TAKİBİ
      else if (s.followUpStage === 1 && diffHours >= 72 && diffHours < 168) {
        message = "Tekrar merhaba. Dubai planlarınız hala gündeminizde mi? SamChe Company olarak size en doğru stratejiyi sunmak için buradayız.";
        await sendMessage(user, message);
        s.followUpStage = 2;
      }

      // 7 GÜN TAKİBİ (SON)
      else if (s.followUpStage === 2 && diffHours >= 168) {
        message = "Merhaba, bu süreçlerinizle ilgili son bilgilendirme mesajımızdır. İleride Dubai’de iş kurma veya oturum alma kararı verirseniz bize dilediğiniz zaman ulaşabilirsiniz.";
        await sendMessage(user, message);
        s.followUpStage = 3;
      }
    }
  } catch (err) {
    console.error("Cron error:", err);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));
