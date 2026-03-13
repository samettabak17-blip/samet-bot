// followup-worker.js – JSON STATE + AUTO FOLLOW-UP SYSTEM

import cron from "node-cron";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// -------------------------------
//  JSON SESSION STORAGE
// -------------------------------
function loadSessions() {
  try {
    return JSON.parse(fs.readFileSync("./data/sessions.json", "utf8"));
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  fs.writeFileSync("./data/sessions.json", JSON.stringify(sessions, null, 2));
}

// -------------------------------
//  WHATSAPP SEND
// -------------------------------
async function sendMessage(to, body) {
  try {
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
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
  }
}

// -------------------------------
//  FOLLOW-UP CRON (EVERY 15 MIN)
// -------------------------------
cron.schedule("*/15 * * * *", async () => {
  console.log("FOLLOW-UP WORKER RUNNING:", new Date().toISOString());

  const sessions = loadSessions();
  const now = Date.now();

  for (const user in sessions) {
    const s = sessions[user];
    if (!s.lastMessageTime) continue;

    const diffHours =
      (now - s.lastMessageTime) / (1000 * 60 * 60);

    const lastTopic =
      s.topics?.length ? s.topics[s.topics.length - 1] : "general";

    let message = null;

    // -------------------------------
    //  1) 24 SAAT HATIRLATMA
    // -------------------------------
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

    // -------------------------------
    //  2) 72 SAAT HATIRLATMA
    // -------------------------------
    if (s.followUpStage === 1 && diffHours >= 72 && diffHours < 168) {
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

    // -------------------------------
    //  3) 7 GÜN HATIRLATMA
    // -------------------------------
    if (s.followUpStage === 2 && diffHours >= 168) {
      if (lastTopic === "company") {
        message =
          "Merhaba,  Dubai’de şirket kurma konusu tekrar gündeminize girerse dilediğiniz zaman yardımcı olmaktan memnuniyet duyarız.";
      } else if (lastTopic === "residency") {
        message =
          "Merhaba, oturum süreciyle ilgili son bilgilendirme mesajımızdır. Ne zaman ihtiyaç duyarsanız süreçleri sizin için yeniden planlayabiliriz.";
      } else if (lastTopic === "ai") {
        message =
          "Merhaba, AI çözümleri-Dijital dönüşüm veya otomasyon tekrar gündeminize girerse memnuniyetle yardımcı oluruz.";
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

  saveSessions(sessions);
});
